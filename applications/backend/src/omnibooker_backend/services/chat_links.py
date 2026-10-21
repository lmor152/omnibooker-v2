"""Linking chat accounts and channels to app users."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .. import models
from .confirmation import get_preferences

DISCORD = "discord"
LINK_CODE_TTL = timedelta(minutes=10)
# No 0/O/1/I so codes are easy to type.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
BOT_PERMISSIONS = 274877992000  # view/send/threads/embed/history/reactions


class LinkError(ValueError):
    """An invalid, expired or already-used link code."""


def bot_invite_url(application_id: str) -> str:
    return (
        "https://discord.com/oauth2/authorize"
        f"?client_id={application_id}&scope=bot%20applications.commands"
        f"&permissions={BOT_PERMISSIONS}"
    )


def create_link_code(db: Session, user_id: int, *, now: datetime | None = None) -> tuple[str, datetime]:
    now = now or datetime.now(timezone.utc)
    code = "".join(secrets.choice(_ALPHABET) for _ in range(8))
    expires_at = now + LINK_CODE_TTL
    db.add(models.ChatLinkCode(user_id=user_id, code_hash=_hash(code), expires_at=expires_at))
    db.commit()
    return code, expires_at


def consume_link_code(
    db: Session,
    code: str,
    *,
    platform: str,
    external_user_id: str,
    external_username: str | None,
    now: datetime | None = None,
) -> models.ChatIdentity:
    now = now or datetime.now(timezone.utc)
    normalized = code.strip().upper().replace("-", "").replace(" ", "")
    link = (
        db.query(models.ChatLinkCode)
        .filter(models.ChatLinkCode.code_hash == _hash(normalized))
        .with_for_update()
        .one_or_none()
    )
    if link is None or link.used_at is not None or _utc(link.expires_at) <= now:
        db.rollback()
        raise LinkError("That code is invalid or has expired. Generate a new one in Settings.")

    identity = identity_for(db, platform, external_user_id)
    if identity is None:
        identity = models.ChatIdentity(platform=platform, external_user_id=external_user_id)
        db.add(identity)
    identity.user_id = link.user_id
    identity.external_username = external_username
    identity.linked_at = now
    link.used_at = now
    db.commit()
    return identity


def identity_for(db: Session, platform: str, external_user_id: str) -> models.ChatIdentity | None:
    return (
        db.query(models.ChatIdentity)
        .filter_by(platform=platform, external_user_id=external_user_id)
        .one_or_none()
    )


def unlink(db: Session, platform: str, external_user_id: str) -> bool:
    identity = identity_for(db, platform, external_user_id)
    if identity is None:
        return False
    db.delete(identity)
    db.commit()
    return True


def add_discord_destination(
    db: Session, user_id: int, *, guild_id: str | None, channel_id: str, name: str
) -> models.ChatDestination:
    """Register a channel for a user (idempotent). The first one becomes their default."""

    destination = (
        db.query(models.ChatDestination)
        .filter_by(user_id=user_id, platform="discord_channel", discord_channel_id=channel_id)
        .one_or_none()
    )
    if destination is None:
        destination = models.ChatDestination(
            user_id=user_id,
            platform="discord_channel",
            discord_guild_id=guild_id,
            discord_channel_id=channel_id,
            name=name,
        )
        db.add(destination)
        db.flush()
    else:
        destination.name = name
    prefs = get_preferences(db, user_id)
    if prefs.default_destination_id is None:
        prefs.default_destination_id = destination.id
    db.commit()
    return destination


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
