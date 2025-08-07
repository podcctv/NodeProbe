from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import requests
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


@app.get("/tests", response_model=list[schemas.TestRecord])
def read_tests(db: Session = Depends(get_db)):
    return db.query(models.TestRecord).all()


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
