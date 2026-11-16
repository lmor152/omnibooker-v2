"""Web Push: notifications to the home-screen app (iOS 16.4+), Android and desktop browsers.

Implements the two standards a push service needs, using `cryptography` (already a dependency):

- RFC 8291 (message encryption): the payload is encrypted for the subscribing browser with
  "aes128gcm" content encoding, so the push service can't read it.
- RFC 8292 (VAPID): each request carries a short-lived ES256-signed JWT that proves it comes from
  this server, whose public key the browser subscribed with.

Generate a key pair once with:

    python -m omnibooker_backend.services.push generate-keys
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import struct
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings

logger = logging.getLogger(__name__)

RECORD_SIZE = 4096
TTL_SECONDS = 12 * 60 * 60
JWT_LIFETIME_SECONDS = 12 * 60 * 60
DEFAULT_SUBJECT = "mailto:admin@localhost"

# Only send to real push services, never to an arbitrary URL a client hands us.
ALLOWED_PUSH_HOSTS = (
    "push.apple.com",  # Safari / iOS home-screen apps
    "fcm.googleapis.com",  # Chrome, Edge, Android
    "push.services.mozilla.com",  # Firefox
    "notify.windows.com",  # legacy Edge
)


@dataclass(frozen=True)
class PushMessage:
    """What the service worker shows. `url` is opened when the notification is tapped."""

    title: str
    body: str
    url: str = "/#/bookings"
    # Notifications with the same tag replace each other (e.g. a reminder replaces "booked").
    tag: str | None = None


class PushNotConfigured(RuntimeError):
    """VAPID keys are missing."""


# --- encoding helpers -------------------------------------------------------------


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _hmac_sha256(key: bytes, data: bytes) -> bytes:
    return hmac.new(key, data, hashlib.sha256).digest()


def _public_bytes(key: ec.EllipticCurvePublicKey) -> bytes:
    return key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


# --- keys -------------------------------------------------------------------------


def generate_vapid_keys() -> tuple[str, str]:
    """A new (public, private) VAPID key pair, base64url-encoded as browsers expect."""

    private = ec.generate_private_key(ec.SECP256R1())
    private_bytes = private.private_numbers().private_value.to_bytes(32, "big")
    return b64url_encode(_public_bytes(private.public_key())), b64url_encode(private_bytes)


def _load_private_key(value: str) -> ec.EllipticCurvePrivateKey:
    return ec.derive_private_key(int.from_bytes(b64url_decode(value), "big"), ec.SECP256R1())


def is_configured() -> bool:
    settings = get_settings()
    return bool(settings.vapid_public_key and settings.vapid_private_key)


# --- RFC 8291 encryption ------------------------------------------------------------


def encrypt(
    plaintext: bytes,
    ua_public: bytes,
    auth_secret: bytes,
    *,
    salt: bytes | None = None,
    sender_private: ec.EllipticCurvePrivateKey | None = None,
) -> bytes:
    """Encrypt a payload for one subscription (aes128gcm, a single record)."""

    salt = salt or os.urandom(16)
    sender_private = sender_private or ec.generate_private_key(ec.SECP256R1())
    sender_public = _public_bytes(sender_private.public_key())
    receiver_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    shared_secret = sender_private.exchange(ec.ECDH(), receiver_key)

    # IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
    prk_key = _hmac_sha256(auth_secret, shared_secret)
    key_info = b"WebPush: info\x00" + ua_public + sender_public
    ikm = _hmac_sha256(prk_key, key_info + b"\x01")

    prk = _hmac_sha256(salt, ikm)
    cek = _hmac_sha256(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac_sha256(prk, b"Content-Encoding: nonce\x00\x01")[:12]

    if len(plaintext) + 1 + 16 > RECORD_SIZE:
        raise ValueError("Push payload too large")
    ciphertext = AESGCM(cek).encrypt(nonce, plaintext + b"\x02", None)  # 0x02: last record

    header = salt + struct.pack(">I", RECORD_SIZE) + bytes([len(sender_public)]) + sender_public
    return header + ciphertext


# --- RFC 8292 VAPID ---------------------------------------------------------------


def vapid_authorization(endpoint: str, *, now: float | None = None) -> str:
    settings = get_settings()
    if not (settings.vapid_public_key and settings.vapid_private_key):
        raise PushNotConfigured("VAPID keys are not configured")
    parsed = urlparse(endpoint)
    claims = {
        "aud": f"{parsed.scheme}://{parsed.netloc}",
        "exp": int((now or time.time()) + JWT_LIFETIME_SECONDS),
        "sub": settings.vapid_subject or DEFAULT_SUBJECT,
    }
    header = {"typ": "JWT", "alg": "ES256"}
    signing_input = (
        b64url_encode(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + b64url_encode(json.dumps(claims, separators=(",", ":")).encode())
    )
    der = _load_private_key(settings.vapid_private_key).sign(
        signing_input.encode("ascii"), ec.ECDSA(hashes.SHA256())
    )
    r, s = decode_dss_signature(der)
    signature = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return f"vapid t={signing_input}.{b64url_encode(signature)}, k={settings.vapid_public_key}"


# --- subscriptions ----------------------------------------------------------------


def is_allowed_endpoint(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and any(
        host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_PUSH_HOSTS
    )


def send(
    subscription: models.PushSubscription,
    message: PushMessage,
    *,
    client: httpx.Client | None = None,
) -> bool:
    """Send one notification. Returns False if the subscription is gone (and should be deleted)."""

    payload = json.dumps(asdict(message)).encode()
    body = encrypt(payload, b64url_decode(subscription.p256dh), b64url_decode(subscription.auth))
    headers = {
        "Authorization": vapid_authorization(subscription.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": str(TTL_SECONDS),
        "Urgency": "high",
    }
    owns_client = client is None
    client = client or httpx.Client(timeout=10)
    try:
        response = client.post(subscription.endpoint, content=body, headers=headers)
    finally:
        if owns_client:
            client.close()
    if response.status_code in (404, 410):
        return False
    if response.status_code >= 400:
        raise RuntimeError(f"Push service returned {response.status_code}: {response.text[:200]}")
    return True


def send_to_user(
    db: Session,
    user_id: int,
    message: PushMessage,
    *,
    client: httpx.Client | None = None,
) -> int:
    """Best-effort send to every device the user subscribed. Returns how many accepted it.

    Expired subscriptions are removed; other failures are logged and never raised, so a broken
    device can't stop the other notification channels.
    """

    if not is_configured():
        return 0
    delivered = 0
    for subscription in db.query(models.PushSubscription).filter_by(user_id=user_id).all():
        try:
            if send(subscription, message, client=client):
                subscription.last_used_at = datetime.now(timezone.utc)
                delivered += 1
            else:
                logger.info("Removing expired push subscription %s", subscription.id)
                db.delete(subscription)
        except Exception as exc:  # pylint: disable=broad-except
            logger.warning("Push to subscription %s failed: %s", subscription.id, exc)
    db.flush()
    return delivered


def main(argv: list[str]) -> int:
    if argv[1:] == ["generate-keys"]:
        public, private = generate_vapid_keys()
        print(f"VAPID_PUBLIC_KEY={public}")
        print(f"VAPID_PRIVATE_KEY={private}")
        print("VAPID_SUBJECT=mailto:you@example.com")
        return 0
    print("usage: python -m omnibooker_backend.services.push generate-keys", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
