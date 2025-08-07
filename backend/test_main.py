from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_homepage_creates_record_and_returns_html():
    res = client.get("/probe")
    assert res.status_code == 200
    assert "Your Connection Info" in res.text

    res_records = client.get("/tests")
    data = res_records.json()
    assert data.get("records")


def test_homepage_handles_null_client_ip():
    """Ensure homepage renders even if a test record has a NULL client_ip."""
    from backend.database import SessionLocal
    from backend.models import TestRecord

    db = SessionLocal()
    try:
        record = TestRecord(client_ip=None)
        db.add(record)
        db.commit()

        res = client.get("/probe")
        assert res.status_code == 200
    finally:
        # Clean up the record to avoid side effects between tests
        db.delete(record)
        db.commit()
        db.close()


def test_ping_endpoint_localhost():
    res = client.get("/ping", params={"host": "127.0.0.1", "count": 1})
    data = res.json()
    assert "output" in data
    assert "ttl" in data["output"]
    assert "ping_ms" in data
    assert "ping_min_ms" in data
    assert "ping_max_ms" in data


def test_traceroute_endpoint_download():
    res = client.get("/traceroute", params={"host": "127.0.0.1", "download": "true"})
    assert res.status_code == 200
    disposition = res.headers.get("content-disposition", "")
    if disposition:
        assert "traceroute_127.0.0.1.txt" in disposition
    else:
        data = res.json()
        assert "error" in data


def test_speedtest_endpoints():
    size = 1024
    res = client.get("/speedtest/download", params={"size": size})
    assert res.status_code == 200
    assert len(res.content) == size

    res_up = client.post("/speedtest/upload", data=b"x" * size)
    assert res_up.status_code == 200
    data = res_up.json()
    assert data.get("received") == size



def test_register_and_login_requires_password_change():
    import uuid

    username = f"user{uuid.uuid4().hex}"
    res = client.post("/admin/register", data={"username": username})
    assert res.status_code == 200
    import re

    m = re.search(r"Default Password: ([^<]+)", res.text)
    assert m, res.text
    password = m.group(1)
    assert password.startswith("nodeprobe")

    res_login = client.post(
        "/admin/login",
        data={"username": username, "password": password},
        follow_redirects=False,
    )
    assert res_login.status_code == 303
    assert res_login.headers["location"] == "/admin/password"

def test_create_speedtest_record():
    payload = {
        "test_target": "speedtest",
        "speedtest_type": "single",
        "download_mbps": 10.0,
        "upload_mbps": 5.0,
    }
    res = client.post("/tests", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["speedtest_type"] == "single"
    assert data["download_mbps"] == 10.0


def test_recent_tests_return_latest_ten_ips():
    from datetime import datetime, timedelta
    from backend.database import SessionLocal
    from backend.models import TestRecord

    db = SessionLocal()
    try:
        db.query(TestRecord).delete()
        now = datetime.utcnow()
        # Create 12 unique IPs with decreasing timestamps
        for i in range(12):
            db.add(
                TestRecord(
                    client_ip=f"1.1.1.{i}",
                    ping_ms=i,
                    timestamp=now - timedelta(minutes=i),
                )
            )
        # Older duplicate for the most recent IP to ensure latest is chosen
        db.add(
            TestRecord(
                client_ip="1.1.1.0",
                ping_ms=999,
                timestamp=now - timedelta(minutes=30),
            )
        )
        db.commit()
    finally:
        db.close()

    res = client.get("/tests")
    assert res.status_code == 200
    data = res.json()
    assert len(data["records"]) == 10

    ips = [r["client_ip"] for r in data["records"]]
    # Only the ten most recent IPs should be returned
    assert "1.1.1.10" not in ips
    assert "1.1.1.11" not in ips

    # Ensure the latest record for an IP is returned
    rec = next(r for r in data["records"] if r["client_ip"] == "1.1.1.0")
    assert rec["ping_ms"] == 0


def test_create_test_merges_recent_records():
    from backend.database import SessionLocal
    from backend.models import TestRecord

    db = SessionLocal()
    try:
        db.query(TestRecord).delete()
        db.add(TestRecord(client_ip="testclient", ping_ms=10))
        db.commit()
    finally:
        db.close()

    res = client.post("/tests", json={"ping_ms": 20})
    assert res.status_code == 200

    db = SessionLocal()
    try:
        records = db.query(TestRecord).filter_by(client_ip="testclient").all()
        assert len(records) == 1
        assert abs(records[0].ping_ms - 15) < 0.01
    finally:
        db.close()

