from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Protocol


class ButtonStyle(str, enum.Enum):
    primary = "primary"
    secondary = "secondary"
    success = "success"
    danger = "danger"


@dataclass(frozen=True)
class Button:
    custom_id: str
    label: str
    style: ButtonStyle = ButtonStyle.secondary


@dataclass(frozen=True)
class OutgoingMessage:
    """A platform-neutral message; adapters render it for their platform."""

    content: str
    buttons: list[Button] = field(default_factory=list)


@dataclass(frozen=True)
class PostedMessage:
    channel_id: str
    message_id: str


class ChatError(RuntimeError):
    """Raised when a chat platform rejects or fails a request."""


class ChatAdapter(Protocol):
    def send(self, channel_id: str, message: OutgoingMessage) -> PostedMessage: ...

    def edit(self, posted: PostedMessage, message: OutgoingMessage) -> None: ...
