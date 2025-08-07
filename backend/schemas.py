from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pydantic import BaseModel, field_serializer


class TestRecordBase(BaseModel):
    client_ip: str | None = None
    location: str | None = None
    asn: str | None = None
    isp: str | None = None
    # Average round trip time in milliseconds
    ping_ms: float | None = None
    # Minimum round trip time observed during the ping test
    ping_min_ms: float | None = None
    # Maximum round trip time observed during the ping test
    ping_max_ms: float | None = None
    download_mbps: float | None = None
    upload_mbps: float | None = None
    speedtest_type: str | None = None
    mtr_result: str | None = None
    iperf_result: str | None = None
    test_target: str | None = None


class TestRecordCreate(TestRecordBase):
    pass


class TestRecordUpdate(TestRecordBase):
    pass


class TestRecord(TestRecordBase):
    id: int
    timestamp: datetime

    @field_serializer("timestamp")
    def serialize_timestamp(self, dt: datetime, _info):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(ZoneInfo("Asia/Shanghai"))

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


class IDList(BaseModel):
    ids: list[int]
