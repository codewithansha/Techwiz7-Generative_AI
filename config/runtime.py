"""Thresholds an administrator can change while the app runs.

Each key falls back to the value in config/settings.py (.env) until an override is saved
in the ``app_settings`` table. Reads are per request, so a change applies to the next
analysis without a restart.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from config.settings import get_settings
from database.models import AppSetting

# key -> (type, minimum, maximum, description)
THRESHOLDS: dict[str, tuple[type, float, float, str]] = {
    "high_value_threshold": (float, 1, 100_000_000, "Disputed amount (PKR) that escalates to a department manager"),
    "repeat_similarity_threshold": (int, 30, 100, "Wording similarity (%) that marks a complaint as a repeat"),
}


def get_threshold(db: Session | None, key: str):
    kind = THRESHOLDS[key][0]
    default = getattr(get_settings(), key)
    if db is None or not isinstance(db, Session):
        return kind(default)  # offline evaluation (e.g. the dataset checker) has no settings table
    row = db.get(AppSetting, key)
    return kind(row.value) if row is not None and row.value is not None else kind(default)


def all_thresholds(db: Session) -> dict:
    return {key: get_threshold(db, key) for key in THRESHOLDS}


def set_threshold(db: Session, key: str, value, user_id: int | None) -> object:
    if key not in THRESHOLDS:
        raise KeyError(key)
    kind, low, high, _ = THRESHOLDS[key]
    number = kind(value)
    if not low <= number <= high:
        raise ValueError(f"{key} must be between {low:g} and {high:g}.")
    row = db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key)
        db.add(row)
    row.value = number
    row.updated_by_id = user_id
    return number
