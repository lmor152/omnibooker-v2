from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .models import Activity, Slot


@dataclass(frozen=True)
class RankedSlot:
    slot: Slot
    activity: Activity
    rank: float


def rank_slot(
    slot: Slot, *, preferred_times: Sequence[str], preferred_courts: Sequence[str]
) -> float:
    time_rank = _index_rank(slot.starts_at.format_24_hour, preferred_times)
    court_rank = _match_rank(slot.location.name, preferred_courts)
    return time_rank * 100 + court_rank


def _index_rank(value: str | int, candidates: Sequence[str | int]) -> float:
    if not candidates:
        return 0
    try:
        return float(candidates.index(value))  # type: ignore[arg-type]
    except ValueError:
        return float(len(candidates))


def _match_rank(value: str, candidates: Sequence[str]) -> float:
    if not candidates:
        return 0

    for index, candidate in enumerate(candidates):
        if candidate.lower() in value.lower():
            return float(index)
    return float("inf")
