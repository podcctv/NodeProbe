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
