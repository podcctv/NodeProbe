from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_homepage_creates_record_and_returns_html():
    res = client.get("/probe")
    assert res.status_code == 200
    assert "<!doctype html>" in res.text.lower()

    res_records = client.get("/tests")
    data = res_records.json()
    assert data.get("records")


def test_homepage_handles_null_client_ip():
    """Ensure homepage renders even if a test record has a NULL client_ip."""
    from backend.database import SessionLocal
    from backend.models import TestRecord, User

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


def test_homepage_uses_forwarded_for_header():
    ip = "127.0.0.2"
    res = client.get("/probe", headers={"X-Forwarded-For": ip})
    assert res.status_code == 200
    res_records = client.get("/tests")
    data = res_records.json()
    ips = [r.get("client_ip") for r in data.get("records", [])]
    assert ip in ips


def test_get_client_ip_handles_missing_client():
    from starlette.requests import Request
    from backend.main import _get_client_ip

    scope = {"type": "http", "headers": []}
    req = Request(scope)
    assert _get_client_ip(req) == ""


def test_ping_endpoint_localhost():
    res = client.get("/ping", params={"host": "127.0.0.1", "count": 1})
    data = res.json()
    assert "output" in data
    assert "ttl" in data["output"]
    assert "ping_ms" in data
    assert "ping_min_ms" in data
    assert "ping_max_ms" in data


def test_create_test_skip_ping():
    res = client.post("/tests?skip_ping=true", json={})
    assert res.status_code == 200
    data = res.json()
    assert data.get("ping_ms") is None


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
    assert res_login.headers["location"] == "/admin"
    res_admin = client.get("/admin")
    assert "Change Password" in res_admin.text

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
    assert data["single_dl_mbps"] == 10.0
    assert data["single_ul_mbps"] == 5.0



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



def test_create_test_merges_recent_records():
    from backend.database import SessionLocal
    from backend.models import TestRecord, User

    db = SessionLocal()
    try:
        db.query(TestRecord).delete()
        db.add(
            TestRecord(
                client_ip="testclient", ping_ms=10, ping_min_ms=8, ping_max_ms=12
            )
        )
        db.commit()
    finally:
        db.close()

    res = client.post(
        "/tests", json={"ping_ms": 20, "ping_min_ms": 18, "ping_max_ms": 22}
    )
    assert res.status_code == 200

    db = SessionLocal()
    try:
        records = db.query(TestRecord).filter_by(client_ip="testclient").all()
        assert len(records) == 1
        assert abs(records[0].ping_ms - 15) < 0.01
        assert abs(records[0].ping_min_ms - 13) < 0.01
        assert abs(records[0].ping_max_ms - 17) < 0.01
    finally:
        db.close()


def test_speedtest_averaging_by_type():
    from backend.database import SessionLocal
    from backend.models import TestRecord

    db = SessionLocal()
    try:
        db.query(TestRecord).delete()
        db.commit()
    finally:
        db.close()

    headers = {"X-Forwarded-For": "9.9.9.9"}

    # Create initial single-thread record
    res_single = client.post(
        "/tests",
        json={
            "speedtest_type": "single",
            "download_mbps": 10,
            "upload_mbps": 5,
        },
        headers=headers,
    )
    assert res_single.status_code == 200

    # Create two multi-thread records to trigger averaging
    client.post(
        "/tests",
        json={
            "speedtest_type": "multi",
            "download_mbps": 40,
            "upload_mbps": 20,
        },
        headers=headers,
    )
    client.post(
        "/tests",
        json={
            "speedtest_type": "multi",
            "download_mbps": 60,
            "upload_mbps": 30,
        },
        headers=headers,
    )

    res = client.get("/tests")
    assert res.status_code == 200
    data = res.json()
    records = [r for r in data["records"] if r["client_ip"] == "9.9.9.9"]
    assert len(records) == 1
    rec = records[0]
    assert rec["single_dl_mbps"] == 10
    assert rec["single_ul_mbps"] == 5
    assert abs(rec["multi_dl_mbps"] - 50) < 0.01
    assert abs(rec["multi_ul_mbps"] - 25) < 0.01


def test_asn_normalization_and_merge():
    from backend.database import SessionLocal
    from backend.models import TestRecord

    db = SessionLocal()
    try:
        db.query(TestRecord).delete()
        db.commit()
    finally:
        db.close()

    headers = {"X-Forwarded-For": "8.8.8.8"}
    payload1 = {
        "asn": "906",
        "isp": "ISP1",
        "location": "Loc1",
        "ping_ms": 10,
        "ping_min_ms": 10,
        "ping_max_ms": 10,
    }
    client.post("/tests?skip_ping=true", json=payload1, headers=headers)

    payload2 = {
        "asn": "AS906",
        "isp": "ISP2",
        "location": "Loc2",
        "ping_ms": 20,
        "ping_min_ms": 20,
        "ping_max_ms": 20,
    }
    client.post("/tests?skip_ping=true", json=payload2, headers=headers)

    res = client.get("/tests")
    assert res.status_code == 200
    data = res.json()
    records = [r for r in data["records"] if r["client_ip"] == "8.8.8.8"]
    assert len(records) == 1
    rec = records[0]
    assert rec["asn"] == "AS906"
    assert abs(rec["ping_ms"] - 15) < 0.01
    assert abs(rec["ping_min_ms"] - 15) < 0.01
    assert abs(rec["ping_max_ms"] - 15) < 0.01


def test_admin_tests_pagination():
    import uuid, re
    from datetime import datetime, timedelta
    from backend.database import SessionLocal
    from backend.models import TestRecord, User

    username = f"user{uuid.uuid4().hex}"
    res = client.post("/admin/register", data={"username": username})
    m = re.search(r"Default Password: ([^<]+)", res.text)
    assert m, res.text
    password = m.group(1)
    client.post(
        "/admin/login",
        data={"username": username, "password": password},
        follow_redirects=False,
    )

    db = SessionLocal()
    try:
        user = db.query(User).filter_by(username=username).first()
        user.must_change_password = False
        db.commit()
        db.query(TestRecord).delete()
        now = datetime.utcnow()
        for i in range(250):
            db.add(TestRecord(client_ip=f"2.2.2.{i}", timestamp=now - timedelta(seconds=i)))
        db.commit()
    finally:
        db.close()

    res = client.get("/admin/tests")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 250
    assert len(data["records"]) == 100

    res2 = client.get("/admin/tests", params={"offset": 200, "limit": 100})
    assert res2.status_code == 200
    data2 = res2.json()
    assert len(data2["records"]) == 50

