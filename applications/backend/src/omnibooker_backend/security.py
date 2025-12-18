import json
from dataclasses import dataclass
from functools import lru_cache
from threading import RLock
from time import monotonic
from typing import Any, Iterable, Optional, cast
from urllib.error import URLError
from urllib.request import urlopen

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models
from .config import get_settings
from .database import get_db

settings = get_settings()

# Use HTTPBearer for Auth0 token validation
security = HTTPBearer()


@dataclass
class _CachedEmail:
    email: str
    expires_at: float


_EMAIL_CACHE_TTL_SECONDS = 600.0  # 10 minutes to survive short bursts
_email_cache: dict[str, _CachedEmail] = {}
_email_cache_lock = RLock()


def _get_cached_email(sub: str) -> Optional[str]:
    now = monotonic()
    with _email_cache_lock:
        cached = _email_cache.get(sub)
        if not cached:
            return None
        if cached.expires_at <= now:
            del _email_cache[sub]
            return None
        return cached.email


def _set_cached_email(sub: str, email: str) -> None:
    expires_at = monotonic() + _EMAIL_CACHE_TTL_SECONDS
    with _email_cache_lock:
        _email_cache[sub] = _CachedEmail(email=email, expires_at=expires_at)


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()


@lru_cache
def get_auth0_jwks() -> dict[str, Any]:
    if not settings.auth0_domain:
        raise RuntimeError("Auth0 domain is not configured")
    url = f"https://{settings.auth0_domain}/.well-known/jwks.json"
    try:
        with urlopen(url, timeout=10) as response:  # type: ignore[call-arg]
            return json.load(response)
    except URLError as exc:
        raise HTTPException(
            status_code=500, detail="Unable to download Auth0 JWKS"
        ) from exc


def fetch_email_from_auth0(token: str, sub: str) -> str:
    """Fetch user email from Auth0's userinfo endpoint."""
    cached = _get_cached_email(sub)
    if cached:
        return cached

    if not settings.auth0_domain:
        raise HTTPException(status_code=500, detail="Auth0 domain is not configured")
    if not settings.auth0_audience:
        raise HTTPException(status_code=500, detail="Auth0 audience is not configured")

    url = f"https://{settings.auth0_domain}/userinfo"
    try:
        import urllib.request

        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=10) as response:  # type: ignore[call-arg]
            user_info = json.load(response)
            email = user_info.get("email")
            if not email or "@" not in email:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Email not found for user {sub}. Please ensure email is verified in Auth0.",
                )
            _set_cached_email(sub, email)
            return email
    except URLError as exc:
        raise HTTPException(
            status_code=500, detail="Unable to fetch user info from Auth0"
        ) from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not settings.auth0_domain:
        raise HTTPException(status_code=500, detail="Auth0 is not configured")

    token = credentials.credentials
    payload = decode_auth0_token(token, credentials_exception)

    if not user_has_required_role(
        payload,
        required_role=settings.auth0_required_role,
        primary_claim=settings.auth0_roles_claim,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Missing required role"
                if not settings.auth0_required_role
                else f"Missing required role '{settings.auth0_required_role}'"
            ),
        )

    # Get the sub (subject) which is always present
    sub = payload.get("sub")
    if not sub:
        raise credentials_exception

    # Try to get email from token payload first
    email = payload.get("email") or payload.get("https://omnibooker/email")
    if email and "@" in email:
        _set_cached_email(sub, email)
    else:
        cached = _get_cached_email(sub)
        if cached:
            email = cached

    # If email not in token, fetch it from Auth0 userinfo endpoint
    if not email or "@" not in email:
        email = fetch_email_from_auth0(token, sub)

    return get_or_create_user(db, email=email, full_name=payload.get("name"))


async def get_current_active_user(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def decode_auth0_token(
    token: str, credentials_exception: HTTPException
) -> dict[str, Any]:
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise credentials_exception from exc

    jwks = get_auth0_jwks()
    rsa_key = next(
        (
            key
            for key in jwks.get("keys", [])
            if key.get("kid") == unverified_header.get("kid")
        ),
        None,
    )
    if not rsa_key:
        raise credentials_exception

    if not settings.auth0_domain:
        raise HTTPException(status_code=500, detail="Auth0 is not configured")
    if not settings.auth0_audience:
        raise HTTPException(status_code=500, detail="Auth0 audience is not configured")

    decode_kwargs: dict[str, Any] = {
        "algorithms": [settings.auth0_algorithm],
        "issuer": f"https://{settings.auth0_domain}/",
        "audience": settings.auth0_audience,
    }

    try:
        payload = jwt.decode(token, rsa_key, **decode_kwargs)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Auth0 token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return payload


def get_or_create_user(
    db: Session, *, email: str, full_name: str | None = None
) -> models.User:
    existing = get_user_by_email(db, email=email)
    if existing:
        return existing

    # Auth0 users don't need a password - they authenticate via Auth0
    user = models.User(
        email=email, hashed_password=None, full_name=full_name, is_active=True
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except IntegrityError:
        db.rollback()
        existing = get_user_by_email(db, email=email)
        if existing:
            return existing
        raise


def user_has_required_role(
    payload: dict[str, Any], *, required_role: str | None, primary_claim: str | None
) -> bool:
    if not required_role:
        return True
    roles = _extract_roles(payload, primary_claim)
    return required_role in roles


def _extract_roles(payload: dict[str, Any], primary_claim: str | None) -> set[str]:
    role_claim_order: list[str] = []
    if primary_claim:
        role_claim_order.append(primary_claim)
    for fallback in ("permissions", "roles", "https://omnibooker/roles"):
        if fallback and fallback not in role_claim_order:
            role_claim_order.append(fallback)

    roles: set[str] = set()
    for claim in role_claim_order:
        values = payload.get(claim)
        roles.update(_normalize_claim_values(values))
    return roles


def _normalize_claim_values(values: Any) -> Iterable[str]:
    if isinstance(values, str):
        return [values]
    if isinstance(values, (list, tuple, set)):
        normalized: list[str] = []
        iterable_values = cast(Iterable[Any], values)
        for item in iterable_values:
            if isinstance(item, str):
                normalized.append(item)
        return normalized
    return []
