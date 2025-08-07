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
    assert "traceroute_127.0.0.1.txt" in disposition
