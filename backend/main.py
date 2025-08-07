from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import requests
import subprocess
from . import models, schemas, database

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

# Allow the frontend dev server or any origin to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    """Simple health check endpoint.

    Returns a friendly message indicating the API is running.
    """
    return {"message": "NodeProbe API is running"}


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


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

    db_record = models.TestRecord(**data)
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record


@app.get("/ping")
def run_ping(host: str, count: int = 4):
    """Run a ping test against a host and return the raw output."""
    try:
        result = subprocess.run(
            ["ping", "-c", str(count), host],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return {"output": result.stdout}
        return {"error": result.stderr or "Ping failed"}
    except Exception as exc:
        return {"error": str(exc)}
