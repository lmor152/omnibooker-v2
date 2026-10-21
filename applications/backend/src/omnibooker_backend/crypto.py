"""Symmetric encryption for secrets stored in the database (e.g. webhook URLs)."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from .config import get_settings


class EncryptionNotConfiguredError(RuntimeError):
    """Raised when a secret needs encrypting but no key is configured."""


@lru_cache
def _fernet() -> Fernet:
    key = get_settings().omnibooker_encryption_key
    if not key:
        raise EncryptionNotConfiguredError(
            "OMNIBOOKER_ENCRYPTION_KEY is not set; generate one with "
            "`python -c 'from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())'`"
        )
    return Fernet(key.encode())


def encrypt_str(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_str(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Unable to decrypt value; wrong encryption key?") from exc


class EncryptedString(TypeDecorator[str]):
    """A string column that is transparently Fernet-encrypted at rest."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Any) -> str | None:
        return encrypt_str(value) if value is not None else None

    def process_result_value(self, value: str | None, dialect: Any) -> str | None:
        return decrypt_str(value) if value is not None else None
