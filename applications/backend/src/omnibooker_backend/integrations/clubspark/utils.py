from __future__ import annotations

from dataclasses import dataclass

from .models import ResourceSlot, TimeSlot


@dataclass(frozen=True)
class RankedSlot:
    start_time: int
    resource: ResourceSlot


def rank_slots(
    slot_options: list[TimeSlot],
    preferred_times: list[int],
    preferred_courts: list[str],
) -> list[RankedSlot]:
    ranked: list[tuple[int, RankedSlot]] = []
    for time_slot in slot_options:
        time_rank = _index_rank(time_slot.Time, preferred_times)
        for resource in time_slot.Resources:
            court_rank = _index_rank(resource.Name, preferred_courts)
            combined_rank = 100 * time_rank + court_rank
            ranked.append((combined_rank, RankedSlot(time_slot.Time, resource)))

    ranked.sort(key=lambda item: item[0])
    return [candidate for _, candidate in ranked]


def _index_rank(value: int | str, candidates: list[int] | list[str]) -> int:
    if not candidates:
        return 0
    try:
        return candidates.index(value)  # type: ignore[arg-type]
    except ValueError:
        return len(candidates)


def parse_time_to_minutes(timestr: str) -> int:
    hours, minutes = timestr.split(":")
    return int(hours) * 60 + int(minutes)
