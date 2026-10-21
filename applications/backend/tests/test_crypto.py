import pytest
from cryptography.fernet import Fernet

from omnibooker_backend import crypto  # type: ignore[import-not-found]
from omnibooker_backend.config import get_settings  # type: ignore[import-not-found]


@pytest.fixture()
def encryption_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        get_settings(), "omnibooker_encryption_key", Fernet.generate_key().decode()
    )
    crypto._fernet.cache_clear()
    yield
    crypto._fernet.cache_clear()


def test_round_trip(encryption_key: None) -> None:
    token = crypto.encrypt_str("https://hooks.slack.com/services/secret")
    assert "secret" not in token
    assert crypto.decrypt_str(token) == "https://hooks.slack.com/services/secret"


def test_encrypted_string_type(encryption_key: None) -> None:
    column = crypto.EncryptedString()
    stored = column.process_bind_param("value", None)
    assert stored != "value"
    assert column.process_result_value(stored, None) == "value"
    assert column.process_bind_param(None, None) is None


def test_missing_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "omnibooker_encryption_key", None)
    crypto._fernet.cache_clear()
    with pytest.raises(crypto.EncryptionNotConfiguredError):
        crypto.encrypt_str("value")
    crypto._fernet.cache_clear()
