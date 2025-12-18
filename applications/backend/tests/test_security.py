from typing import Any, Dict

from omnibooker_backend.security import (
    user_has_required_role,  # type: ignore[import-not-found]
)


def test_user_has_required_role_from_permissions() -> None:
    payload: Dict[str, Any] = {"permissions": ["access:omnibooker", "other:action"]}
    assert user_has_required_role(
        payload,
        required_role="access:omnibooker",
        primary_claim="permissions",
    )


def test_user_missing_required_role() -> None:
    payload: Dict[str, Any] = {"permissions": ["something:else"]}
    assert not user_has_required_role(
        payload,
        required_role="access:omnibooker",
        primary_claim="permissions",
    )


def test_user_custom_roles_claim() -> None:
    payload: Dict[str, Any] = {"https://omnibooker/roles": ["access:omnibooker"]}
    # simulate misconfigured primary claim to ensure fallback list works
    assert user_has_required_role(
        payload,
        required_role="access:omnibooker",
        primary_claim="custom",
    )


def test_no_required_role_means_access_allowed() -> None:
    payload: Dict[str, Any] = {}
    assert user_has_required_role(
        payload, required_role=None, primary_claim="permissions"
    )
