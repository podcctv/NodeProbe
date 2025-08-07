"""Database configuration for the NodeProbe backend.

This module sets up the SQLAlchemy engine and session factory.  It ensures the
SQLite database file lives inside the repository's ``data`` directory regardless
of the current working directory from which the application is launched.  The
directory is created automatically if it does not already exist so that hitting
API endpoints such as ``/tests`` doesn't fail with a missing database error.
"""

from pathlib import Path

from sqlalchemy import create_engine
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
