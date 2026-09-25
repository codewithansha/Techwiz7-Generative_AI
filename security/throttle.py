"""Login throttling (SRS deliverable 10: brute-force / unauthorized-access tests).

After MAX_FAILURES wrong passwords for one account from one client within WINDOW seconds,
further attempts for that pair are refused with 429 until LOCKOUT seconds have passed.
A successful login clears the counter. State is per process, which suits a single
container; a multi-instance deployment would move it to Redis.
"""

from __future__ import annotations

import threading
import time

MAX_FAILURES = 5
WINDOW = 300
LOCKOUT = 300

_lock = threading.Lock()
_failures: dict[tuple[str, str], list[float]] = {}
_locked_until: dict[tuple[str, str], float] = {}


def _key(email: str, client: str) -> tuple[str, str]:
    return ((email or "").strip().lower(), client or "unknown")


def retry_after(email: str, client: str) -> int:
    """Seconds until this account/client pair may try again (0 = allowed)."""
    with _lock:
        until = _locked_until.get(_key(email, client), 0)
    return max(0, int(until - time.monotonic()) + (1 if until > time.monotonic() else 0))


def record_failure(email: str, client: str) -> None:
    key, now = _key(email, client), time.monotonic()
    with _lock:
        recent = [t for t in _failures.get(key, []) if now - t < WINDOW] + [now]
        _failures[key] = recent
        if len(recent) >= MAX_FAILURES:
            _locked_until[key] = now + LOCKOUT
            _failures[key] = []


def record_success(email: str, client: str) -> None:
    key = _key(email, client)
    with _lock:
        _failures.pop(key, None)
        _locked_until.pop(key, None)


def reset() -> None:
    with _lock:
        _failures.clear()
        _locked_until.clear()
