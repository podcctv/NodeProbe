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


class TestsResponse(BaseModel):
    """Response model for ``GET /tests``.

    When there are no records in the database we return an empty ``records``
    list together with a human friendly ``message`` that guides the user to
    create their first test record.  This prevents the endpoint from appearing
    "empty" when accessed in a browser.
    """

    message: str | None = None
    records: list[TestRecord] = []
