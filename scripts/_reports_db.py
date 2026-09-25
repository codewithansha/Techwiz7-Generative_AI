"""Shared database setup for the report scripts.

The scripts never touch the real dev database. They need DATABASE_URL (or --database-url)
pointing at a disposable database such as ``supportnova_reports``:

    docker exec support-nova-db-1 psql -U supportnova -d postgres -c "CREATE DATABASE supportnova_reports"

This module must be imported (and ``configure`` called) before anything imports
``database.session``, because the engine is created from the settings at import time.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DEFAULT_URL = "postgresql+psycopg://supportnova:supportnova@localhost:5432/supportnova_reports"
PROTECTED = {"supportnova"}  # real dev data
NO_RESET = {"supportnova_scratch"}  # used by a running verification server


def db_name(url: str) -> str:
    return url.rsplit("/", 1)[-1].split("?", 1)[0].lower()


def configure(url: str | None) -> str:
    url = url or os.environ.get("DATABASE_URL") or DEFAULT_URL
    if db_name(url) in PROTECTED:
        raise SystemExit(f"Refusing to use '{db_name(url)}': it holds real dev data. Use supportnova_reports.")
    os.environ["DATABASE_URL"] = url
    from config.settings import get_settings

    get_settings.cache_clear()
    return url


def prepare(reset: bool) -> None:
    """Create or upgrade the schema and seed reference data, exactly as the app does on start."""
    from database.migrations import upgrade
    from database.models import Base
    from database.seed import seed_reference_data
    from database.session import SessionLocal, engine

    name = db_name(str(engine.url))
    if reset:
        if name in PROTECTED | NO_RESET or not any(tag in name for tag in ("reports", "test")):
            raise SystemExit(f"--reset only drops a *_reports or *_test database, not '{name}'.")
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    upgrade(engine)
    db = SessionLocal()
    try:
        seed_reference_data(db)
    finally:
        db.close()
