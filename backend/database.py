"""Database configuration for the NodeProbe backend.

This module sets up the SQLAlchemy engine and session factory.  It ensures the
SQLite database file lives inside the repository's ``data`` directory regardless
of the current working directory from which the application is launched.  The
directory is created automatically if it does not already exist so that hitting
API endpoints such as ``/tests`` doesn't fail with a missing database error.
"""

from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

# Determine an absolute path to the ``data`` directory (two levels up from this
# file) and ensure it exists.  This allows the backend to run from any working
# directory or Docker context without failing to locate the database file.
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR / 'nodeprobe.db'}"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def migrate() -> None:
    """Ensure database schema matches the current SQLAlchemy models.

    SQLite's ``CREATE TABLE`` statement does not add new columns to an
    existing table, so deployments that created the database before new
    fields were introduced can fail with ``OperationalError`` when the
    application attempts to insert those columns.  This helper performs a
    lightweight migration by adding any missing columns defined on the
    ``TestRecord`` model.
    """

    # Import here to avoid circular imports during module initialisation.
    from . import models

    # Create any tables that don't yet exist.
    models.Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    existing = {col["name"] for col in inspector.get_columns(models.TestRecord.__tablename__)}

    # Add any columns that are present on the model but missing from the DB.
    with engine.begin() as conn:
        for column in models.TestRecord.__table__.columns:
            if column.name not in existing:
                coltype = column.type.compile(engine.dialect)
                conn.execute(
                    text(
                        f"ALTER TABLE {models.TestRecord.__tablename__} "
                        f"ADD COLUMN {column.name} {coltype}"
                    )
                )
