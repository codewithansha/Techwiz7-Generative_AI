"""Idempotent schema upgrades for databases created before a column existed.

``Base.metadata.create_all`` creates missing tables but never adds columns to existing
ones. These statements do, safely, on every start (PostgreSQL ``ADD COLUMN IF NOT EXISTS``).
Alembic remains available for managed migrations; this keeps a fresh ``git pull`` working.
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine

COLUMNS = {
    "complaints": [
        "incident_date DATE",
        "first_responded_at TIMESTAMPTZ",
        "sla_risk_percent INTEGER DEFAULT 75",
        "category VARCHAR(128)",
        "subcategory VARCHAR(128)",
        "urgency VARCHAR(16)",
        "priority VARCHAR(4)",
        "sentiment VARCHAR(32)",
        "escalation_required BOOLEAN DEFAULT false",
        "pending_review BOOLEAN DEFAULT false",
        "needs_reanalysis BOOLEAN DEFAULT false",
    ],
    "complaint_attachments": [
        "extracted_text TEXT",
        "facts JSONB",
    ],
}
INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_complaints_category ON complaints (category)",
    "CREATE INDEX IF NOT EXISTS ix_complaints_priority ON complaints (priority)",
    "CREATE INDEX IF NOT EXISTS ix_complaints_pending_review ON complaints (pending_review)",
    "CREATE INDEX IF NOT EXISTS ix_complaints_status ON complaints (status)",
    "CREATE INDEX IF NOT EXISTS ix_complaints_customer_id ON complaints (customer_id)",
    "CREATE INDEX IF NOT EXISTS ix_validation_results_complaint_id ON validation_results (complaint_id)",
    "CREATE INDEX IF NOT EXISTS ix_genai_runs_complaint_id ON genai_runs (complaint_id)",
    "CREATE INDEX IF NOT EXISTS ix_comparisons_complaint_id ON comparisons (complaint_id)",
]


def upgrade(engine: Engine) -> None:
    with engine.begin() as conn:
        for table, columns in COLUMNS.items():
            for column in columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column}"))
        for statement in INDEXES:
            conn.execute(text(statement))
