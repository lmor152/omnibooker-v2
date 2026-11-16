import json
import os
import struct
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from omnibooker_backend import models  # type: ignore[import-not-found]
from omnibooker_backend.config import get_settings  # type: ignore[import-not-found]
from omnibooker_backend.database import SessionLocal, get_db  # type: ignore[import-not-found]
from omnibooker_backend.main import create_app  # type: ignore[import-not-found]
from omnibooker_backend.security import get_current_active_user  # type: ignore[import-not-found]
from omnibooker_backend.services import actions, confirmation, push  # type: ignore[import-not-found]
from omnibooker_backend.services.push import b64url_decode, b64url_encode  # type: ignore[import-not-found]

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)
START = datetime(2026, 10, 25, 17, 0, tzinfo=timezone.utc)
APPLE_ENDPOINT = "https://web.push.apple.com/QGuQyavXutnMH9zA"


@pytest.fixture()
def vapid(monkeypatch: pytest.MonkeyPatch):
    public, private = push.generate_vapid_keys()
    settings = get_settings()
    monkeypatch.setattr(settings, "vapid_public_key", public)
    monkeypatch.setattr(settings, "vapid_private_key", private)
    monkeypatch.setattr(settings, "vapid_subject", "mailto:test@example.com")
    return public, private


@pytest.fixture(autouse=True)
def _empty_action_queue(db_session: Session):
    db_session.query(models.ScheduledAction).delete()
    db_session.commit()


# --- encryption ------------------------------------------------------------------


def _hkdf_like(key: bytes, data: bytes) -> bytes:
    import hashlib
    import hmac

    return hmac.new(key, data, hashlib.sha256).digest()


def _decrypt(body: bytes, ua_private: ec.EllipticCurvePrivateKey, auth_secret: bytes) -> bytes:
    """Receiver side of RFC 8291, written independently of push.encrypt."""

    salt, record_size, id_len = body[:16], struct.unpack(">I", body[16:20])[0], body[20]
    sender_public = body[21 : 21 + id_len]
    ciphertext = body[21 + id_len :]
    assert record_size == 4096
    ua_public = ua_private.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    shared = ua_private.exchange(
        ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), sender_public)
    )
    ikm = _hkdf_like(_hkdf_like(auth_secret, shared), b"WebPush: info\x00" + ua_public + sender_public + b"\x01")
    prk = _hkdf_like(salt, ikm)
    cek = _hkdf_like(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hkdf_like(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    padded = AESGCM(cek).decrypt(nonce, ciphertext, None)
    assert padded.endswith(b"\x02")
    return padded[:-1]


def test_encrypted_payload_round_trips() -> None:
    ua_private = ec.generate_private_key(ec.SECP256R1())
    ua_public = ua_private.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    auth_secret = os.urandom(16)

    body = push.encrypt(b'{"title":"hi"}', ua_public, auth_secret)

    assert _decrypt(body, ua_private, auth_secret) == b'{"title":"hi"}'


def test_encryption_matches_rfc8291_example() -> None:
    # RFC 8291, Appendix A.
    sender = ec.derive_private_key(
        int.from_bytes(b64url_decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"), "big"), ec.SECP256R1()
    )
    body = push.encrypt(
        b"When I grow up, I want to be a watermelon",
        b64url_decode("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
        b64url_decode("BTBZMqHH6r4Tts7J_aSIgg"),
        salt=b64url_decode("DGv6ra1nlYgDCS1FRnbzlw"),
        sender_private=sender,
    )
    assert b64url_encode(body) == (
        "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_y"
        "l95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
    )


def test_vapid_header_is_a_valid_es256_jwt(vapid) -> None:
    public, _ = vapid
    header = push.vapid_authorization(APPLE_ENDPOINT, now=NOW.timestamp())

    token = header.split("t=")[1].split(",")[0]
    assert header.endswith(f"k={public}")
    head, claims, signature = token.split(".")
    decoded = json.loads(b64url_decode(claims))
    assert decoded["aud"] == "https://web.push.apple.com"
    assert decoded["sub"] == "mailto:test@example.com"
    assert decoded["exp"] == int(NOW.timestamp()) + 12 * 3600
    raw = b64url_decode(signature)
    der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
    key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), b64url_decode(public))
    key.verify(der, f"{head}.{claims}".encode(), ec.ECDSA(hashes.SHA256()))  # raises if invalid


def test_only_known_push_services_are_allowed() -> None:
    assert push.is_allowed_endpoint(APPLE_ENDPOINT)
    assert push.is_allowed_endpoint("https://fcm.googleapis.com/fcm/send/abc")
    assert push.is_allowed_endpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")
    assert not push.is_allowed_endpoint("http://web.push.apple.com/abc")
    assert not push.is_allowed_endpoint("https://evil.example.com/push.apple.com")
    assert not push.is_allowed_endpoint("https://notpush.apple.com.evil.com/x")


# --- sending ----------------------------------------------------------------------


def _subscription(db: Session, user: models.User, endpoint: str = APPLE_ENDPOINT) -> tuple[models.PushSubscription, ec.EllipticCurvePrivateKey, bytes]:
    ua_private = ec.generate_private_key(ec.SECP256R1())
    ua_public = ua_private.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    auth = os.urandom(16)
    subscription = models.PushSubscription(
        user_id=user.id, endpoint=f"{endpoint}/{uuid.uuid4()}", p256dh=b64url_encode(ua_public), auth=b64url_encode(auth)
    )
    db.add(subscription)
    db.commit()
    return subscription, ua_private, auth


def _user(db: Session) -> models.User:
    user = models.User(email=f"{uuid.uuid4()}@example.com")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_send_posts_encrypted_payload_and_drops_expired_devices(db_session: Session, vapid) -> None:
    user = _user(db_session)
    live, ua_private, auth = _subscription(db_session, user)
    expired, _, _ = _subscription(db_session, user)
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(410 if str(request.url) == expired.endpoint else 201)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        sent = push.send_to_user(
            db_session, user.id, push.PushMessage("Booked", "Court 2", "/#/bookings/7", "booking-7"), client=client
        )
    db_session.commit()

    assert sent == 1
    request = next(r for r in requests if str(r.url) == live.endpoint)
    assert request.headers["content-encoding"] == "aes128gcm"
    assert request.headers["authorization"].startswith("vapid t=")
    payload = json.loads(_decrypt(request.content, ua_private, auth))
    assert payload == {"title": "Booked", "body": "Court 2", "url": "/#/bookings/7", "tag": "booking-7"}
    remaining = db_session.query(models.PushSubscription).filter_by(user_id=user.id).all()
    assert [s.id for s in remaining] == [live.id]


def _booking(db: Session, user: models.User, *, auto_cancel: bool = True) -> models.BookingTask:
    provider = models.Provider(user_id=user.id, name="P", type="test-provider", credentials={})
    db.add(provider)
    db.flush()
    slot = models.BookingSlot(
        user_id=user.id, provider_id=provider.id, name="Sunday Tennis",
        frequency=models.FrequencyEnum.one_off, time="17:00", timezone="Europe/London",
        duration_minutes=60, provider_options={}, auto_cancel_enabled=auto_cancel,
    )
    db.add(slot)
    db.flush()
    task = models.BookingTask(
        booking_slot_id=slot.id, scheduled_date=START, status=models.TaskStatusEnum.success,
        booked_time="17:00", booked_resource="Court 2", cost=Decimal("14.10"),
        provider_booking_ref={"refund_deadline_utc": (START - timedelta(hours=24)).isoformat()},
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def test_booking_updates_go_to_phone_without_discord(db_session: Session, vapid, monkeypatch) -> None:
    user = _user(db_session)
    _subscription(db_session, user)
    task = _booking(db_session, user)
    sent: list[push.PushMessage] = []
    monkeypatch.setattr(push, "send", lambda sub, message, client=None: sent.append(message) or True)

    confirmation.on_booking_success(db_session, task, now=NOW)
    actions.process_due_actions(db_session, now=NOW, limit=50, chat_factory=lambda: None)

    assert [m.title for m in sent] == ["Booked Sunday Tennis. Keep it?"]
    assert sent[0].url == f"/#/bookings/{task.id}"
    assert "Court 2" in sent[0].body and "Confirm by" in sent[0].body
    done = db_session.query(models.ScheduledAction).filter_by(booking_task_id=task.id, kind="notify_booked").one()
    assert done.status == models.ActionStatusEnum.done


def test_failed_attempt_is_pushed_and_respects_mute(db_session: Session, vapid, monkeypatch) -> None:
    user = _user(db_session)
    _subscription(db_session, user)
    task = _booking(db_session, user)
    task.status = models.TaskStatusEnum.failed
    task.error_message = "No courts available."
    db_session.commit()
    sent: list[push.PushMessage] = []
    monkeypatch.setattr(push, "send", lambda sub, message, client=None: sent.append(message) or True)

    confirmation.on_booking_failure(db_session, task, now=NOW)
    actions.process_due_actions(db_session, now=NOW, limit=50, chat_factory=lambda: None)

    assert sent[0].title == "Couldn't book Sunday Tennis"
    assert "No courts available" in sent[0].body

    task.booking_slot.notifications_enabled = False
    db_session.commit()
    confirmation.on_booking_failure(db_session, task, now=NOW + timedelta(hours=1))
    assert db_session.query(models.ScheduledAction).filter_by(booking_task_id=task.id).count() == 1


# --- routes -----------------------------------------------------------------------


def _client_for(user: models.User) -> TestClient:
    app = create_app()

    def override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_active_user] = lambda: user
    return TestClient(app)


def test_subscribe_list_and_unsubscribe(db_session: Session, vapid) -> None:
    user = _user(db_session)
    client = _client_for(user)
    endpoint = f"{APPLE_ENDPOINT}/{uuid.uuid4()}"
    body = {"endpoint": endpoint, "keys": {"p256dh": "pk", "auth": "au"}, "user_agent": "iPhone"}

    assert client.get("/api/push/config").json() == {"public_key": vapid[0]}
    assert client.post("/api/push/subscriptions", json=body).status_code == 200
    # Subscribing again updates the same device rather than duplicating it.
    assert client.post("/api/push/subscriptions", json={**body, "keys": {"p256dh": "pk2", "auth": "au2"}}).status_code == 200
    listed = client.get("/api/push/subscriptions").json()
    assert [(s["endpoint"], s["user_agent"]) for s in listed] == [(endpoint, "iPhone")]

    bad = client.post("/api/push/subscriptions", json={**body, "endpoint": "https://example.com/hook"})
    assert bad.status_code == 400

    assert client.post("/api/push/subscriptions/remove", json={"endpoint": endpoint}).status_code == 204
    assert client.get("/api/push/subscriptions").json() == []


def test_other_users_cannot_delete_a_device(db_session: Session, vapid) -> None:
    owner, other = _user(db_session), _user(db_session)
    subscription, _, _ = _subscription(db_session, owner)

    assert _client_for(other).delete(f"/api/push/subscriptions/{subscription.id}").status_code == 404
    assert _client_for(owner).delete(f"/api/push/subscriptions/{subscription.id}").status_code == 204


def test_push_config_is_empty_without_keys(monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "vapid_private_key", None)
    user = models.User(id=999999, email="x@example.com")
    assert _client_for(user).get("/api/push/config").json() == {"public_key": None}


def test_device_cannot_be_taken_over_with_just_its_endpoint(db_session: Session, vapid) -> None:
    owner, attacker = _user(db_session), _user(db_session)
    endpoint = f"{APPLE_ENDPOINT}/{uuid.uuid4()}"
    body = {"endpoint": endpoint, "keys": {"p256dh": "pk", "auth": "owner-secret"}}
    assert _client_for(owner).post("/api/push/subscriptions", json=body).status_code == 200

    stolen = _client_for(attacker).post("/api/push/subscriptions", json={**body, "keys": {"p256dh": "x", "auth": "guess"}})
    assert stolen.status_code == 409
    # The same browser (same secret) can move to another account, e.g. after logging in as someone else.
    moved = _client_for(attacker).post("/api/push/subscriptions", json=body)
    assert moved.status_code == 200
