from sqlalchemy import Column, Integer, Float, String, DateTime, Boolean
from datetime import datetime
from .database import Base


class TestRecord(Base):
    __tablename__ = "test_records"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    client_ip = Column(String)
    location = Column(String)
    asn = Column(String)
    isp = Column(String)
    ping_ms = Column(Float)
    mtr_result = Column(String)
    iperf_result = Column(String)
    test_target = Column(String)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    must_change_password = Column(Boolean, default=True)
