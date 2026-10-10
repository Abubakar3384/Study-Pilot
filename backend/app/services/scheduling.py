"""Flashcard spaced repetition: a simplified SM-2.

again -> relearn: repetitions reset, due again in 10 minutes, ease drops
hard  -> small interval growth, ease drops slightly
good  -> 1 day, 3 days, then interval * ease
easy  -> like good with a bonus, ease rises
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

Rating = Literal["again", "hard", "good", "easy"]
MIN_EASE, MAX_EASE = 1.3, 3.0


@dataclass(frozen=True)
class ReviewState:
    ease: float = 2.5
    interval_days: int = 0
    repetitions: int = 0


def schedule(state: ReviewState, rating: Rating, now: datetime) -> tuple[ReviewState, datetime]:
    ease, interval, reps = state.ease, state.interval_days, state.repetitions

    if rating == "again":
        new = ReviewState(max(MIN_EASE, ease - 0.2), 0, 0)
        return new, now + timedelta(minutes=10)

    if rating == "hard":
        ease = max(MIN_EASE, ease - 0.15)
        interval = max(1, round(interval * 1.2))
    elif rating == "good":
        interval = 1 if reps == 0 else 3 if reps == 1 else max(interval + 1, round(interval * ease))
    elif rating == "easy":
        ease = min(MAX_EASE, ease + 0.15)
        interval = 4 if reps == 0 else max(interval + 1, round(interval * ease * 1.3))
    else:
        raise ValueError(f"unknown rating {rating!r}")

    new = ReviewState(round(ease, 2), interval, reps + 1)
    return new, now + timedelta(days=interval)
