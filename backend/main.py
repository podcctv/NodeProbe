from pathlib import Path

from datetime import datetime, timezone, timedelta

import re
import os
import secrets
import hashlib
import hmac
import logging
import socket
from zoneinfo import ZoneInfo

from fastapi import (
    FastAPI,
    Depends,
    Request,
    Form,
    HTTPException,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    HTMLResponse,
    FileResponse,
    RedirectResponse,
    StreamingResponse,
)
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
import requests
import subprocess
import tempfile
from starlette.middleware.sessions import SessionMiddleware

from . import models, schemas, database

# Ensure the database schema is up to date before serving requests.
database.migrate()

app = FastAPI()

app.add_middleware(SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", "nodeprobe-secret"))

logger = logging.getLogger("uvicorn.error")

templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent / "templates"))


def mask_ip(ip: str | None) -> str | None:
    """Partially mask an IPv4 address, gracefully handling ``None`` values.

    The previous implementation assumed ``ip`` was always a string which caused
    ``AttributeError`` when ``None`` was passed (e.g. when a test record had a
    null ``client_ip``).  This version returns the input unchanged if it is
    falsy and only performs masking for valid dotted IPv4 strings.
    """

    if not ip:
        return ip

    parts = ip.split(".")
    if len(parts) == 4:
        return f"{parts[0]}.***.***.{parts[3]}"
    return ip


def to_shanghai(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(ZoneInfo("Asia/Shanghai"))


def short_ts(ts):
    if isinstance(ts, datetime):
        ts = to_shanghai(ts)
        return ts.strftime("%Y-%m-%d %H:%M:%S")
    return ts


templates.env.filters["mask_ip"] = mask_ip
templates.env.filters["short_ts"] = short_ts


@app.on_event("startup")
def create_default_user():
    db = database.SessionLocal()
    host_ip = os.environ.get("SERVER_IP") or socket.gethostbyname(socket.gethostname())
    try:
        user = db.query(models.User).first()
        if not user:
            last_octet = host_ip.split(".")[-1]
            password = f"nodeprobe{last_octet}"
            user = models.User(
                username="NodeProbe",
                password_hash=hash_password(password),
            )
            db.add(user)
            db.commit()
            logger.info(
                "Initial admin credentials - username: NodeProbe password: %s",
                password,
            )
        logger.info(
            "Login help: visit http://%s:8380/ to access the dashboard.",
            host_ip,
        )
    finally:
        db.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}${hashed}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hashed = stored.split("$", 1)
    except ValueError:
        return False
    check = hashlib.sha256((salt + password).encode()).hexdigest()
    return hmac.compare_digest(check, hashed)

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


def get_current_user(
    request: Request, db: Session = Depends(get_db)
) -> models.User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user


def require_active_user(user: models.User = Depends(get_current_user)) -> models.User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Password change required"
        )
    return user


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


@app.get("/admin/login", response_class=HTMLResponse, include_in_schema=False)
def login_form(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/admin/register", response_class=HTMLResponse, include_in_schema=False)
def register_form(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})


@app.post("/admin/register", include_in_schema=False)
def register(
    request: Request,
    username: str = Form(...),
    db: Session = Depends(get_db),
):
    if db.query(models.User).filter_by(username=username).first():
        return templates.TemplateResponse(
            "register.html",
            {"request": request, "error": "Username already exists"},
            status_code=400,
        )
    ip = request.client.host or "0.0.0.0"
    last = ip.split(".")[-1]
    password = f"nodeprobe{last}"
    user = models.User(
        username=username,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.commit()
    return templates.TemplateResponse(
        "register_success.html",
        {"request": request, "username": username, "password": password},
    )


@app.post("/admin/login", include_in_schema=False)
def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter_by(username=username).first()
    if not user or not verify_password(password, user.password_hash):
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "error": "Invalid credentials"},
            status_code=400,
        )
    request.session["user_id"] = user.id
    if user.must_change_password:
        return RedirectResponse("/admin/password", status_code=303)
    return RedirectResponse("/admin", status_code=303)


@app.get("/admin/logout", include_in_schema=False)
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/admin/login", status_code=303)


@app.get("/admin/password", response_class=HTMLResponse, include_in_schema=False)
def password_form(
    request: Request, user: models.User = Depends(get_current_user)
):
    return templates.TemplateResponse("change_password.html", {"request": request})


@app.post("/admin/password", include_in_schema=False)
def change_password(
    request: Request,
    password: str = Form(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    user.password_hash = hash_password(password)
    user.must_change_password = False
    db.commit()
    return RedirectResponse("/admin", status_code=303)


@app.get("/admin", response_class=HTMLResponse, include_in_schema=False)
def admin_page(request: Request, user: models.User = Depends(require_active_user)):
    return templates.TemplateResponse("admin.html", {"request": request, "user": user})


@app.get("/", include_in_schema=False)
def root():
    """Redirect visitors to the dashboard page."""
    return RedirectResponse("/probe")


@app.get("/probe", response_class=HTMLResponse, include_in_schema=False)
def probe_page(request: Request, db: Session = Depends(get_db)):
    """Dashboard homepage.

    Records basic information about the visiting client and renders the main
    dashboard template.  Recent test data is loaded asynchronously via the
    ``/tests`` API which aggregates records from the last ten minutes.
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

    return templates.TemplateResponse(
        "index.html", {"request": request, "info": db_record}
    )
@app.get("/api")
def api_root():
    """Simple health check endpoint for programmatic access."""
    return {"message": "NodeProbe API is running"}


@app.get("/tests", response_model=schemas.TestsResponse)
def read_tests(request: Request, db: Session = Depends(get_db)):
    """Return aggregated test records for the last ten minutes.

    Multiple tests from the same ``client_ip`` within the last ten minutes are
    collapsed into a single entry with average ``ping_ms``,
    ``download_mbps`` and ``upload_mbps`` values computed directly in the
    database.  The most recent ``timestamp`` for each IP is retained so that
    results remain chronologically ordered.
    """

    ten_min_ago = datetime.utcnow() - timedelta(minutes=10)
    q = (
        db.query(
            func.max(models.TestRecord.id).label("id"),
            models.TestRecord.client_ip,
            func.max(models.TestRecord.location).label("location"),
            func.max(models.TestRecord.asn).label("asn"),
            func.max(models.TestRecord.isp).label("isp"),
            func.min(models.TestRecord.ping_min_ms).label("ping_min_ms"),
            func.avg(models.TestRecord.ping_ms).label("ping_ms"),
            func.max(models.TestRecord.ping_max_ms).label("ping_max_ms"),
            func.avg(models.TestRecord.download_mbps).label("download_mbps"),
            func.avg(models.TestRecord.upload_mbps).label("upload_mbps"),
            func.max(models.TestRecord.timestamp).label("timestamp"),
            func.max(models.TestRecord.test_target).label("test_target"),
        )
        .filter(models.TestRecord.timestamp >= ten_min_ago)
        .group_by(models.TestRecord.client_ip)
        .order_by(func.max(models.TestRecord.timestamp).desc())
    )

    rows = q.all()
    if not rows:
        return {"message": "No recent test records found", "records": []}

    records = [schemas.TestRecord.model_validate(dict(row._mapping)) for row in rows]
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
            data.setdefault("ping_min_ms", ping_ms)
            data.setdefault("ping_max_ms", ping_ms)
    else:
        data.setdefault("ping_min_ms", data["ping_ms"])
        data.setdefault("ping_max_ms", data["ping_ms"])

    ten_min_ago = datetime.utcnow() - timedelta(minutes=10)
    existing_records = (
        db.query(models.TestRecord)
        .filter(
            models.TestRecord.client_ip == client_ip,
            models.TestRecord.timestamp >= ten_min_ago,
        )
        .all()
    )

    if existing_records:
        values_ping = [r.ping_ms for r in existing_records if r.ping_ms is not None]
        if data.get("ping_ms") is not None:
            values_ping.append(data["ping_ms"])
        values_down = [r.download_mbps for r in existing_records if r.download_mbps is not None]
        if data.get("download_mbps") is not None:
            values_down.append(data["download_mbps"])
        values_up = [r.upload_mbps for r in existing_records if r.upload_mbps is not None]
        if data.get("upload_mbps") is not None:
            values_up.append(data["upload_mbps"])

        for r in existing_records:
            db.delete(r)

        averaged = {
            "client_ip": client_ip,
            "location": data.get("location") or existing_records[0].location,
            "asn": data.get("asn") or existing_records[0].asn,
            "isp": data.get("isp") or existing_records[0].isp,
            "ping_ms": sum(values_ping) / len(values_ping) if values_ping else None,
            "download_mbps": sum(values_down) / len(values_down) if values_down else None,
            "upload_mbps": sum(values_up) / len(values_up) if values_up else None,
            "speedtest_type": data.get("speedtest_type") or existing_records[0].speedtest_type,
            "mtr_result": data.get("mtr_result") or existing_records[0].mtr_result,
            "iperf_result": data.get("iperf_result") or existing_records[0].iperf_result,
            "test_target": data.get("test_target") or existing_records[0].test_target,
        }
        db_record = models.TestRecord(**averaged)
        db.add(db_record)
        db.commit()
        db.refresh(db_record)
        return db_record

    db_record = models.TestRecord(**data)
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record


@app.get(
    "/admin/tests", response_model=schemas.TestsResponse, include_in_schema=False
)
def admin_read_tests(
    db: Session = Depends(get_db), user: models.User = Depends(require_active_user)
):
    records = db.query(models.TestRecord).all()
    return {"records": records}


@app.post(
    "/admin/tests", response_model=schemas.TestRecord, include_in_schema=False
)
def admin_create_test(
    record: schemas.TestRecordCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_active_user),
):
    db_record = models.TestRecord(**record.dict())
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record


@app.put(
    "/admin/tests/{test_id}", response_model=schemas.TestRecord, include_in_schema=False
)
def admin_update_test(
    test_id: int,
    record: schemas.TestRecordUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_active_user),
):
    db_record = db.get(models.TestRecord, test_id)
    if not db_record:
        raise HTTPException(status_code=404, detail="Record not found")
    for key, value in record.dict(exclude_unset=True).items():
        setattr(db_record, key, value)
    db.commit()
    db.refresh(db_record)
    return db_record


@app.delete("/admin/tests", include_in_schema=False)
def admin_delete_tests(
    payload: schemas.IDList,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_active_user),
):
    q = db.query(models.TestRecord).filter(models.TestRecord.id.in_(payload.ids))
    deleted = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


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
            summary = re.search(r"(?:rtt|round-trip).*? = ([0-9.]+)/([0-9.]+)/([0-9.]+)/", result.stdout)
            if summary:
                data["ping_min_ms"] = float(summary.group(1))
                data["ping_ms"] = float(summary.group(2))
                data["ping_max_ms"] = float(summary.group(3))
            else:
                match = re.search(r"time[=<]([0-9.]+) ms", result.stdout)
                if match:
                    data["ping_ms"] = float(match.group(1))
            if "ping_ms" in data:
                data.setdefault("ping_min_ms", data["ping_ms"])
                data.setdefault("ping_max_ms", data["ping_ms"])
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


@app.get("/speedtest/download")
def speedtest_download(size: int = 1_000_000):
    """Send ``size`` bytes to the client for download speed testing."""

    def generate():
        chunk = b"0" * 65536
        remaining = size
        while remaining > 0:
            to_send = chunk if remaining >= len(chunk) else b"0" * remaining
            yield to_send
            remaining -= len(to_send)

    headers = {"Content-Length": str(size)}
    return StreamingResponse(generate(), media_type="application/octet-stream", headers=headers)


@app.post("/speedtest/upload")
async def speedtest_upload(request: Request):
    """Receive data from the client and report the size for upload testing."""

    data = await request.body()
    return {"received": len(data)}
