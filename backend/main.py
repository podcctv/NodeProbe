from pathlib import Path
from datetime import datetime, timezone, timedelta

import re
import os
os.environ.setdefault("LC_CTYPE", "en_US.UTF-8")
os.environ.setdefault("LANG", "en_US.UTF-8")
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
    Query,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    HTMLResponse,
    FileResponse,
    RedirectResponse,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
import requests
import subprocess
import tempfile
from starlette.middleware.sessions import SessionMiddleware

from . import models, schemas, database
from .text_utils import sanitize_banner

# Configure logging so Docker logs include informative startup messages
logging.basicConfig(level=logging.INFO)

# Ensure the database schema is up to date before serving requests.
database.migrate()

app = FastAPI()

app.add_middleware(SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", "nodeprobe-secret"))

logger = logging.getLogger("uvicorn.error")

templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent / "templates"))

# Serve built frontend assets when available
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
assets_dir = frontend_dist / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


ASCII_BANNER = sanitize_banner(
    """
__     ______  ____ _____ _____        ___   _       _   _  ___  ____  _____   ____            _
\ \   / /  _ \/ ___|_   _/ _ \ \      / / \ | |     | \ | |/ _ \|  _ \| ____| |  _ \ _ __ ___ | |__   ___
 \ \ / /| |_) \___ \ | || | | \ \ /\ / /|  \| |     |  \| | | | | | | |  _|   | |_) | '__/ _ \| '_ \ / _ \
  \ V / |  __/ ___) || || |_| |\ V  V / | |\  |     | |\  | |_| | |_| | |___  |  __/| | | (_) | |_) |  __/
   \_/  |_|   |____(_)_| \___/  \_/\_/  |_| \_|     |_| \_|\___/|____/|_____| |_|   |_|  \___/|_.__/ \___|
"""
)


def mask_ip(ip: str | None) -> str | None:
    """Return a partially masked representation of ``ip``.

    This helper is used by the Jinja2 templates when rendering client
    information.  In production the ``client_ip`` column may contain ``NULL``
    values (or other unexpected types) which previously resulted in an
    ``AttributeError`` when ``split`` was called on the non-string object.
    The function now defensively handles ``None`` and non-string inputs and
    provides basic masking for both IPv4 and IPv6 addresses.
    """

    if not ip:
        return ip
    if not isinstance(ip, str):
        ip = str(ip)

    if ":" in ip:
        parts = ip.split(":")
        if len(parts) >= 2:
            return f"{parts[0]}:***:{parts[-1]}"
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


def normalize_asn(asn: str | None) -> str | None:
    """Return a normalized ASN string starting with ``AS``.

    Various geo-IP providers return the autonomous system number in different
    formats (e.g. ``"AS906"``, ``"906"`` or ``"AS906 Network"``).  For the
    purpose of de-duplicating records we treat ``AS906`` and ``906`` as the same
    ASN.  This helper extracts the numeric portion and ensures the value is
    consistently prefixed with ``AS``.
    """

    if not asn:
        return asn

    match = re.search(r"(\d+)", str(asn))
    if match:
        return f"AS{match.group(1)}"
    return str(asn).upper()


@app.on_event("startup")
def create_default_user():
    db = database.SessionLocal()
    host_ip = os.environ.get("SERVER_IP")
    if not host_ip:
        try:
            host_ip = requests.get("https://api.ipify.org", timeout=5).text.strip()
        except Exception:
            host_ip = socket.gethostbyname(socket.gethostname())
    try:
        user = db.query(models.User).first()
        if not user:
            password = get_default_password(host_ip)
            user = models.User(
                username="NodeProbe",
                password_hash=hash_password(password),
            )
            db.add(user)
            db.commit()
            msg = (
                "Initial admin credentials - username: NodeProbe password: %s"
                % password
            )
            logger.info(msg)
        else:
            logger.info("Admin user already exists; no default password generated.")

        log_msg = (
            "Login help: visit http://%s:8380/ to access the dashboard." % host_ip
        )
        logger.info(log_msg)
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


def get_default_password(host_ip: str | None = None) -> str:
    """Return the default admin password based on the host IP or env vars."""

    if not host_ip:
        host_ip = os.environ.get("SERVER_IP")
        if not host_ip:
            try:
                host_ip = requests.get("https://api.ipify.org", timeout=5).text.strip()
            except Exception:
                host_ip = socket.gethostbyname(socket.gethostname())
    last_octet = host_ip.split(".")[-1]
    return os.environ.get("ADMIN_PASSWORD") or f"nodeprobe{last_octet}"

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
            timeout=10,
        )
        if result.returncode == 0:
            match = re.search(r"time[=<]([0-9.]+) ms", result.stdout)
            if match:
                return float(match.group(1))
    except subprocess.TimeoutExpired:
        return None
    except Exception:
        pass
    return None


def _get_client_ip(request: Request) -> str:
    """Retrieve the real client IP from the request.

    Checks common proxy headers (``CF-Connecting-IP`` and ``X-Forwarded-For``)
    before falling back to ``request.client.host``.
    """
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    # ``request.client`` may be ``None`` when running behind certain proxies or in
    # testing environments.  Guard against this to avoid ``AttributeError``
    # causing a 500 response.
    client = request.client
    if not client:
        return ""
    # ``client`` may be a tuple or an object without a ``host`` attribute.
    # Using ``getattr`` avoids raising ``AttributeError`` in those cases and
    # ensures an empty string is returned when the host can't be determined.
    return getattr(client, "host", "")


@app.get("/admin/login", response_class=HTMLResponse, include_in_schema=False)
def login_form(request: Request, db: Session = Depends(get_db)):
    user = db.query(models.User).first()
    default_password = None
    if user:
        default_guess = get_default_password()
        if verify_password(default_guess, user.password_hash):
            default_password = default_guess
    return templates.TemplateResponse(
        "login.html", {"request": request, "default_password": default_password}
    )


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
    ip = _get_client_ip(request) or "0.0.0.0"
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
def admin_page(request: Request, user: models.User = Depends(get_current_user)):
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

    client_ip = _get_client_ip(request)
    user_agent = request.headers.get("user-agent")
    data = {
        "client_ip": client_ip,
        "user_agent": user_agent,
        "test_target": "default",
    }

    ping_ms = _ping(client_ip)
    if ping_ms is not None:
        data["ping_ms"] = ping_ms

    try:
        resp = requests.get(f"https://ipapi.co/{client_ip}/json/", timeout=5)
        if resp.ok:
            geo = resp.json()
            if not geo.get("error"):
                data["location"] = f"{geo.get('city')}, {geo.get('country_name')}"
                data["asn"] = geo.get("asn")
                data["isp"] = geo.get("org")
            else:
                raise ValueError("ipapi error")
        else:
            raise ValueError("ipapi error")
    except Exception:
        try:
            resp = requests.get(f"https://ipwho.is/{client_ip}", timeout=5)
            if resp.ok:
                geo = resp.json()
                if geo.get("success"):
                    data["location"] = f"{geo.get('city')}, {geo.get('country')}"
                    conn = geo.get("connection", {})
                    data["asn"] = conn.get("asn")
                    data["isp"] = conn.get("isp") or conn.get("org")
                else:
                    raise ValueError("ipwho error")
            else:
                raise ValueError("ipwho error")
        except Exception:
            try:
                resp = requests.get(
                    f"http://ip-api.com/json/{client_ip}?fields=status,country,city,as,org",
                    timeout=5,
                )
                if resp.ok:
                    geo = resp.json()
                    if geo.get("status") == "success":
                        data.setdefault(
                            "location", f"{geo.get('city')}, {geo.get('country')}"
                        )
                        data.setdefault("asn", geo.get("as"))
                        data.setdefault("isp", geo.get("org"))
            except Exception:
                pass

    data["asn"] = normalize_asn(data.get("asn"))

    ten_minutes_ago = datetime.utcnow() - timedelta(minutes=10)
    existing = (
        db.query(models.TestRecord)
        .filter(
            models.TestRecord.client_ip == client_ip,
            models.TestRecord.user_agent == user_agent,
            models.TestRecord.timestamp >= ten_minutes_ago,
        )
        .first()
    )

    if existing:
        for key, value in data.items():
            setattr(existing, key, value)
        now = datetime.utcnow()
        existing.timestamp = now
        existing.time_hour = (
            to_shanghai(now)
            .replace(minute=0, second=0, microsecond=0)
            .strftime("%I:00%p")
        )
        existing.date = to_shanghai(now).strftime("%Y-%m-%d")
        db_record = existing
    else:
        now = datetime.utcnow()
        data["timestamp"] = now
        data["time_hour"] = (
            to_shanghai(now)
            .replace(minute=0, second=0, microsecond=0)
            .strftime("%I:00%p")
        )
        data["date"] = to_shanghai(now).strftime("%Y-%m-%d")
        db_record = models.TestRecord(**data)
        db.add(db_record)

    db.commit()
    db.refresh(db_record)

    index_file = frontend_dist / "index.html"
    if index_file.exists():
        return FileResponse(index_file)

    return templates.TemplateResponse(
        "index.html",
        {"request": request, "info": db_record, "ascii_banner": ASCII_BANNER},
    )
@app.get("/api")
def api_root():
    """Simple health check endpoint for programmatic access."""
    return {"message": "NodeProbe API is running"}


@app.get("/tests", response_model=schemas.TestsResponse)
def read_tests(request: Request, db: Session = Depends(get_db)):
    """Return recent test records for up to ten client sessions.

    Records are aggregated per client IP and user agent within the last ten
    minutes, so we simply return the ten most recently updated rows.
    """

    rows = (
        db.query(models.TestRecord)
        .order_by(models.TestRecord.timestamp.desc())
        .limit(10)
        .all()
    )

    for r in rows:
        r.asn = normalize_asn(r.asn)

    if not rows:
        return {"message": "No recent test records found", "records": []}

    return {"records": rows}


@app.post("/tests", response_model=schemas.TestRecord)
def create_test(
    record: schemas.TestRecordCreate,
    request: Request,
    db: Session = Depends(get_db),
    skip_ping: bool = False,
):
    data = record.dict()
    client_ip = _get_client_ip(request)
    user_agent = request.headers.get("user-agent")
    data["client_ip"] = data.get("client_ip") or client_ip
    data["user_agent"] = data.get("user_agent") or user_agent

    if not data.get("location") or not data.get("asn") or not data.get("isp"):
        try:
            resp = requests.get(f"https://ipapi.co/{client_ip}/json/", timeout=5)
            if resp.ok:
                geo = resp.json()
                if not geo.get("error"):
                    data.setdefault(
                        "location", f"{geo.get('city')}, {geo.get('country_name')}"
                    )
                    data.setdefault("asn", geo.get("asn"))
                    data.setdefault("isp", geo.get("org"))
                else:
                    raise ValueError("ipapi error")
            else:
                raise ValueError("ipapi error")
        except Exception:
            try:
                resp = requests.get(f"https://ipwho.is/{client_ip}", timeout=5)
                if resp.ok:
                    geo = resp.json()
                    if geo.get("success"):
                        data.setdefault(
                            "location", f"{geo.get('city')}, {geo.get('country')}"
                        )
                        conn = geo.get("connection", {})
                        data.setdefault("asn", conn.get("asn"))
                        data.setdefault(
                            "isp", conn.get("isp") or conn.get("org")
                        )
                    else:
                        raise ValueError("ipwho error")
                else:
                    raise ValueError("ipwho error")
            except Exception:
                try:
                    resp = requests.get(
                        f"http://ip-api.com/json/{client_ip}?fields=status,country,city,as,org",
                        timeout=5,
                    )
                    if resp.ok:
                        geo = resp.json()
                        if geo.get("status") == "success":
                            data.setdefault(
                                "location", f"{geo.get('city')}, {geo.get('country')}"
                            )
                            data.setdefault("asn", geo.get("as"))
                            data.setdefault("isp", geo.get("org"))
                except Exception:
                    pass

    data["asn"] = normalize_asn(data.get("asn"))
    if not skip_ping:
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
    elif data.get("ping_ms") is not None:
        data.setdefault("ping_min_ms", data["ping_ms"])
        data.setdefault("ping_max_ms", data["ping_ms"])

    speedtest_type = data.pop("speedtest_type", None)
    dl = data.pop("download_mbps", None)
    ul = data.pop("upload_mbps", None)

    if skip_ping and dl is None and ul is None and not any(
        data.get(k) is not None
        for k in ("ping_ms", "ping_min_ms", "ping_max_ms", "mtr_result", "iperf_result")
    ):
        now = datetime.utcnow()
        mapped = {
            "client_ip": client_ip,
            "user_agent": user_agent,
            "location": data.get("location"),
            "asn": data.get("asn"),
            "isp": data.get("isp"),
            "ping_ms": data.get("ping_ms"),
            "ping_min_ms": data.get("ping_min_ms"),
            "ping_max_ms": data.get("ping_max_ms"),
            "single_dl_mbps": None,
            "single_ul_mbps": None,
            "multi_dl_mbps": None,
            "multi_ul_mbps": None,
            "mtr_result": data.get("mtr_result"),
            "iperf_result": data.get("iperf_result"),
            "test_target": data.get("test_target"),
            "timestamp": now,
            "time_hour": (
                to_shanghai(now)
                .replace(minute=0, second=0, microsecond=0)
                .strftime("%I:00%p")
            ),
            "date": to_shanghai(now).strftime("%Y-%m-%d"),
        }
        return schemas.TestRecord(id=0, **mapped)

    ten_minutes_ago = datetime.utcnow() - timedelta(minutes=10)
    existing = (
        db.query(models.TestRecord)
        .filter(
            models.TestRecord.client_ip == client_ip,
            models.TestRecord.user_agent == user_agent,
            models.TestRecord.timestamp >= ten_minutes_ago,
        )
        .first()
    )

    def _avg(a, b):
        if a is None:
            return b
        if b is None:
            return a
        return (a + b) / 2

    if existing:
        if data.get("location"):
            existing.location = data["location"]
        if data.get("asn"):
            existing.asn = normalize_asn(data["asn"])
        if data.get("isp"):
            existing.isp = data["isp"]

        if data.get("ping_ms") is not None:
            existing.ping_ms = _avg(existing.ping_ms, data["ping_ms"])
            existing.ping_min_ms = _avg(existing.ping_min_ms, data["ping_min_ms"])
            existing.ping_max_ms = _avg(existing.ping_max_ms, data["ping_max_ms"])

        if speedtest_type == "single":
            if dl is not None:
                existing.single_dl_mbps = _avg(existing.single_dl_mbps, dl)
            if ul is not None:
                existing.single_ul_mbps = _avg(existing.single_ul_mbps, ul)
        elif speedtest_type == "multi":
            if dl is not None:
                existing.multi_dl_mbps = _avg(existing.multi_dl_mbps, dl)
            if ul is not None:
                existing.multi_ul_mbps = _avg(existing.multi_ul_mbps, ul)

        if data.get("mtr_result"):
            existing.mtr_result = data["mtr_result"]
        if data.get("iperf_result"):
            existing.iperf_result = data["iperf_result"]
        if data.get("test_target"):
            existing.test_target = data["test_target"]

        now = datetime.utcnow()
        existing.timestamp = now
        existing.time_hour = (
            to_shanghai(now)
            .replace(minute=0, second=0, microsecond=0)
            .strftime("%I:00%p")
        )
        existing.date = to_shanghai(now).strftime("%Y-%m-%d")

        db.commit()
        db.refresh(existing)
        return existing

    now = datetime.utcnow()
    mapped = {
        "client_ip": client_ip,
        "user_agent": user_agent,
        "location": data.get("location"),
        "asn": data.get("asn"),
        "isp": data.get("isp"),
        "ping_ms": data.get("ping_ms"),
        "ping_min_ms": data.get("ping_min_ms"),
        "ping_max_ms": data.get("ping_max_ms"),
        "mtr_result": data.get("mtr_result"),
        "iperf_result": data.get("iperf_result"),
        "test_target": data.get("test_target"),
        "timestamp": now,
        "time_hour": (
            to_shanghai(now)
            .replace(minute=0, second=0, microsecond=0)
            .strftime("%I:00%p")
        ),
        "date": to_shanghai(now).strftime("%Y-%m-%d"),
    }
    if speedtest_type == "single":
        mapped["single_dl_mbps"] = dl
        mapped["single_ul_mbps"] = ul
    elif speedtest_type == "multi":
        mapped["multi_dl_mbps"] = dl
        mapped["multi_ul_mbps"] = ul

    db_record = models.TestRecord(**mapped)
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record


@app.get(
    "/admin/tests", response_model=schemas.AdminTestsResponse, include_in_schema=False
)
def admin_read_tests(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_active_user),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
):
    total = db.query(models.TestRecord).count()
    records = (
        db.query(models.TestRecord)
        .order_by(models.TestRecord.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    for r in records:
        r.asn = normalize_asn(r.asn)
    return {"records": records, "total": total}


@app.post(
    "/admin/tests", response_model=schemas.TestRecord, include_in_schema=False
)
def admin_create_test(
    record: schemas.TestRecordUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_active_user),
):
    data = record.dict()
    data["asn"] = normalize_asn(data.get("asn"))
    now = datetime.utcnow()
    data.setdefault("timestamp", now)
    data.setdefault(
        "time_hour",
        (
            to_shanghai(now)
            .replace(minute=0, second=0, microsecond=0)
            .strftime("%I:00%p")
        ),
    )
    data.setdefault("date", to_shanghai(now).strftime("%Y-%m-%d"))
    existing = (
        db.query(models.TestRecord)
        .filter(models.TestRecord.client_ip == data.get("client_ip"))
        .first()
    )
    if existing:
        for key, value in data.items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing
    db_record = models.TestRecord(**data)
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
        if key == "asn":
            value = normalize_asn(value)
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
            timeout=20,
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
    except subprocess.TimeoutExpired:
        return {"error": "Ping timed out"}
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
            timeout=60,
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
    except subprocess.TimeoutExpired as exc:
        return {"error": "Traceroute timed out", "output": exc.output or ""}
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
