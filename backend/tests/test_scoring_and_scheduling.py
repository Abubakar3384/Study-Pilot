from datetime import datetime, timedelta, timezone

import pytest

from app.errors import RequestValidationAppError
from app.services.scheduling import ReviewState, schedule
from app.services.scoring import QuestionKey, score_quiz

KEYS = [QuestionKey("q1", 0, 4), QuestionKey("q2", 2, 4), QuestionKey("q3", 3, 4)]
NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_all_correct():
    r = score_quiz(KEYS, {"q1": 0, "q2": 2, "q3": 3})
    assert (r.score, r.total, r.percentage) == (3, 3, 100.0)


def test_partial_and_unanswered_count_as_wrong():
    r = score_quiz(KEYS, {"q1": 0, "q2": 1})  # q3 unanswered
    assert (r.score, r.total) == (1, 3)
    assert r.percentage == 33.3
    assert [x.is_correct for x in r.results] == [True, False, False]
    assert r.results[2].selected_index is None


def test_explicit_skip_is_wrong():
    assert score_quiz(KEYS, {"q1": None}).score == 0


def test_unknown_question_rejected():
    with pytest.raises(RequestValidationAppError, match="not in this quiz"):
        score_quiz(KEYS, {"nope": 1})


def test_out_of_range_selection_rejected():
    with pytest.raises(RequestValidationAppError, match="out of range"):
        score_quiz(KEYS, {"q1": 4})


def test_schedule_good_progression():
    s, due = schedule(ReviewState(), "good", NOW)
    assert (s.repetitions, s.interval_days, due) == (1, 1, NOW + timedelta(days=1))
    s, _ = schedule(s, "good", NOW)
    assert s.interval_days == 3
    s, _ = schedule(s, "good", NOW)
    assert s.interval_days == round(3 * 2.5)


def test_schedule_again_resets_and_lowers_ease():
    s, due = schedule(ReviewState(2.5, 10, 4), "again", NOW)
    assert (s.repetitions, s.interval_days, s.ease) == (0, 0, 2.3)
    assert due == NOW + timedelta(minutes=10)


def test_ease_is_bounded():
    s = ReviewState(1.3, 1, 1)
    s, _ = schedule(s, "again", NOW)
    assert s.ease == 1.3
    s = ReviewState(3.0, 1, 2)
    s, _ = schedule(s, "easy", NOW)
    assert s.ease == 3.0
