import os
import sys
import pytest
from pathlib import Path

# Ensure project root is on sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

os.environ["EMAIL_TEST_MODE"] = "true"

from fastapi.testclient import TestClient
from backend.app.core.config import settings
settings.EMAIL_TEST_MODE = True

from backend.app.main import app
from backend.app.core.database import SessionLocal, Base, engine

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    settings.ensure_directories()
    Base.metadata.create_all(bind=engine)
    yield

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def client():
    return TestClient(app)
