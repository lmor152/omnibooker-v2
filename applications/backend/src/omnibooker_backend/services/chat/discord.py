"""Discord REST client for posting messages as the bot (no gateway connection)."""

from __future__ import annotations

import logging
import time
from typing import Any, Callable

import httpx

from .base import ButtonStyle, ChatError, OutgoingMessage, PostedMessage

logger = logging.getLogger(__name__)

API_BASE = "https://discord.com/api/v10"
MAX_RATE_LIMIT_WAIT_SECONDS = 10.0

_BUTTON_STYLES = {
    ButtonStyle.primary: 1,
    ButtonStyle.secondary: 2,
    ButtonStyle.success: 3,
    ButtonStyle.danger: 4,
}


def render_payload(message: OutgoingMessage) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "content": message.content,
        # Never ping @everyone/roles from booking text.
        "allowed_mentions": {"parse": []},
        "components": [],
    }
    if message.buttons:
        payload["components"] = [
            {
                "type": 1,  # action row
                "components": [
                    {
                        "type": 2,  # button
                        "style": _BUTTON_STYLES[button.style],
                        "label": button.label,
                        "custom_id": button.custom_id,
                    }
                    for button in message.buttons
                ],
            }
        ]
    return payload


class DiscordClient:
    def __init__(
        self,
        token: str,
        *,
        http_factory: Callable[[], httpx.Client] | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._token = token
        self._http = (http_factory or (lambda: httpx.Client(timeout=5.0)))()
        self._sleep = sleep

    def __enter__(self) -> "DiscordClient":
        return self

    def __exit__(self, *exc_info: Any) -> None:
        self._http.close()

    def send(self, channel_id: str, message: OutgoingMessage) -> PostedMessage:
        data = self._request(
            "POST", f"/channels/{channel_id}/messages", json=render_payload(message)
        )
        return PostedMessage(channel_id=channel_id, message_id=str(data["id"]))

    def edit(self, posted: PostedMessage, message: OutgoingMessage) -> None:
        self._request(
            "PATCH",
            f"/channels/{posted.channel_id}/messages/{posted.message_id}",
            json=render_payload(message),
        )

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        headers = {"Authorization": f"Bot {self._token}"}
        for attempt in range(2):
            try:
                response = self._http.request(
                    method, API_BASE + path, headers=headers, **kwargs
                )
            except httpx.HTTPError as exc:
                raise ChatError(f"Discord request failed: {exc}") from exc
            if response.status_code == 429 and attempt == 0:
                retry_after = float(response.json().get("retry_after", 1.0))
                if retry_after > MAX_RATE_LIMIT_WAIT_SECONDS:
                    break
                logger.info("Discord rate limited; retrying in %.1fs", retry_after)
                self._sleep(retry_after)
                continue
            if response.is_error:
                raise ChatError(
                    f"Discord {method} {path} -> {response.status_code}: {response.text[:200]}"
                )
            return response.json() if response.content else None
        raise ChatError(f"Discord {method} {path} rate limited")
