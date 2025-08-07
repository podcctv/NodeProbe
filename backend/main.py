from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from . import models, schemas, database

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()


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
def create_test(record: schemas.TestRecordCreate, db: Session = Depends(get_db)):
    db_record = models.TestRecord(**record.dict())
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record
