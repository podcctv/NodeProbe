from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_homepage_creates_record_and_returns_html():
    res = client.get("/")
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

        res = client.get("/")
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
