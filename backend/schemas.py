from datetime import datetime
from pydantic import BaseModel


class TestRecordBase(BaseModel):
    client_ip: str | None = None
    location: str | None = None
    asn: str | None = None
    isp: str | None = None
    ping_ms: float | None = None
    mtr_result: str | None = None
    iperf_result: str | None = None
    test_target: str | None = None


class TestRecordCreate(TestRecordBase):
    pass


class TestRecord(TestRecordBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
