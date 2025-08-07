from pathlib import Path
from datetime import datetime
import re

from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
import requests
import subprocess
import tempfile

from . import models, schemas, database

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent / "templates"))


def mask_ip(ip: str) -> str:
    parts = ip.split(".")
    if len(parts) == 4:
        return f"{parts[0]}.***.***.{parts[3]}"
    return ip


def short_ts(ts):
    if isinstance(ts, datetime):
        return ts.strftime("%Y-%m-%d %H:%M:%S")
    return ts


templates.env.filters["mask_ip"] = mask_ip
templates.env.filters["short_ts"] = short_ts

# Allow the frontend dev server or any origin to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ping(host: str) -> float | None:
    """Return the ping time to ``host`` in milliseconds.

    Returns ``None`` if the command fails or the output cannot be parsed.
    """
    try:
        result = subprocess.run(
            ["ping", "-c", "1", host],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            match = re.search(r"time[=<]([0-9.]+) ms", result.stdout)
            if match:
                return float(match.group(1))
    except Exception:
        pass
    return None


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def read_root(request: Request, db: Session = Depends(get_db)):
    """Default homepage.

    Records basic information about the visiting client and displays recent
    test results.  The page also provides a simple interface for running manual
    ping tests against a host.
    """

    client_ip = request.client.host
    data = {"client_ip": client_ip, "test_target": "default"}

    ping_ms = _ping(client_ip)
    if ping_ms is not None:
        data["ping_ms"] = ping_ms

    try:
        resp = requests.get(f"https://ipapi.co/{client_ip}/json/")
        if resp.ok:
            geo = resp.json()
            data["location"] = f"{geo.get('city')}, {geo.get('country_name')}"
            data["asn"] = geo.get("asn")
            data["isp"] = geo.get("org")
    except Exception:
        pass

    db_record = models.TestRecord(**data)
    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    records = (
        db.query(models.TestRecord)
        .order_by(models.TestRecord.id.desc())
        .limit(5)
        .all()
    )
    return templates.TemplateResponse(
        "index.html", {"request": request, "info": db_record, "records": records}
    )
@app.get("/api")
def api_root():
    """Simple health check endpoint for programmatic access."""
    return {"message": "NodeProbe API is running"}


@app.get("/tests", response_model=schemas.TestsResponse)
def read_tests(request: Request, db: Session = Depends(get_db)):
    """Return all stored test records.

    When the database is empty a default record is created automatically so
    that the endpoint always returns at least one item without requiring a
    manual ``POST`` from the user.
    """

    records = db.query(models.TestRecord).all()
    if not records:
        default_record = models.TestRecord(
            client_ip=request.client.host,
            test_target="default",
        )
        db.add(default_record)
        db.commit()
        db.refresh(default_record)
        records = [default_record]
    return {"records": records}


@app.post("/tests", response_model=schemas.TestRecord)
def create_test(
    record: schemas.TestRecordCreate, request: Request, db: Session = Depends(get_db)
):
    data = record.dict()
    client_ip = request.client.host
    data.setdefault("client_ip", client_ip)

    if not data.get("location") or not data.get("asn") or not data.get("isp"):
        try:
            resp = requests.get(f"https://ipapi.co/{client_ip}/json/")
            if resp.ok:
                geo = resp.json()
                data.setdefault(
                    "location", f"{geo.get('city')}, {geo.get('country_name')}"
                )
                data.setdefault("asn", geo.get("asn"))
                data.setdefault("isp", geo.get("org"))
        except Exception:
            pass

    if not data.get("ping_ms"):
        host = data.get("test_target") or client_ip
        ping_ms = _ping(host)
        if ping_ms is not None:
            data["ping_ms"] = ping_ms

    db_record = models.TestRecord(**data)
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record


@app.get("/ping")
def run_ping(host: str, count: int = 4):
    """Run a ping test against a host and return the raw output.

    The response also includes the parsed round trip time in milliseconds when
    available.  This value can be used by the frontend to record a test result
    via the ``/tests`` API.
    """
    try:
        result = subprocess.run(
            ["ping", "-c", str(count), host],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            data = {"output": result.stdout}
            match = re.search(r"time[=<]([0-9.]+) ms", result.stdout)
            if match:
                data["ping_ms"] = float(match.group(1))
            return data
        return {"error": result.stderr or "Ping failed"}
    except FileNotFoundError:
        return {"error": "ping command not found"}
    except Exception as exc:
        return {"error": str(exc)}


@app.get("/traceroute")
def run_traceroute(host: str, download: bool = False):
    """Run a traceroute and optionally provide the result as a downloadable file."""
    try:
        result = subprocess.run(
            ["traceroute", host],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return {"error": result.stderr or "Traceroute failed"}
        if download:
            with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as tmp:
                tmp.write(result.stdout)
                temp_path = tmp.name
            return FileResponse(
                temp_path,
                filename=f"traceroute_{host}.txt",
                media_type="text/plain",
            )
        return {"output": result.stdout}
    except FileNotFoundError:
        return {"error": "traceroute command not found"}
    except Exception as exc:
        return {"error": str(exc)}


@app.get("/speedtest")
def run_speedtest():
    """Run a basic network speed test.

    The test returns the download and upload speeds in bits per second.  Any
    errors from the underlying ``speedtest`` module are captured and returned to
    the caller so the frontend can display a helpful message.
    """
    try:
        import speedtest  # type: ignore

        st = speedtest.Speedtest()
        download = st.download()
        upload = st.upload()
        return {"download": download, "upload": upload}
    except Exception as exc:
        return {"error": str(exc)}
