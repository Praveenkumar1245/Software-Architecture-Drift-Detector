import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load environment variables from .env if present (root or backend)
for env_candidate in [BASE_DIR.parent / ".env", BASE_DIR / ".env"]:
    if env_candidate.exists():
        load_dotenv(dotenv_path=env_candidate, override=True)
        break

class Settings:
    PROJECT_NAME: str = "Software Architecture Drift Detector"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Database
    _raw_db_url = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'drift_detector.db'}")
    if _raw_db_url.startswith("postgres://"):
        _raw_db_url = _raw_db_url.replace("postgres://", "postgresql://", 1)
    DATABASE_URL: str = _raw_db_url
    
    # Server & Network
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    BACKEND_URL: str = os.getenv("BACKEND_URL", f"http://{os.getenv('HOST', '127.0.0.1')}:{os.getenv('PORT', '8000')}")
    
    # Storage
    DATA_DIR: Path = BASE_DIR / "data"
    UPLOAD_DIR: Path = DATA_DIR / "uploads"
    PROJECTS_DIR: Path = DATA_DIR / "projects"
    REPORTS_DIR: Path = DATA_DIR / "reports"
    MAILBOX_DIR: Path = DATA_DIR / "mailbox"
    
    # Security & Limits
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024  # 50MB
    MAX_EXTRACTED_FILES: int = 2000
    ALLOWED_EXTENSIONS: set = {".zip", ".tar.gz", ".tar"}
    
    # Authentication & Session Security
    SESSION_COOKIE_NAME: str = "drift_session"
    SESSION_DURATION_HOURS: int = 24 * 7   # 7 days
    SESSION_REMEMBER_HOURS: int = 24 * 30  # 30 days
    COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "false").lower() in ("true", "1")
    COOKIE_SAMESITE: str = os.getenv("COOKIE_SAMESITE", "none" if os.getenv("COOKIE_SECURE", "false").lower() in ("true", "1") else "lax")
    VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24
    PASSWORD_RESET_TOKEN_EXPIRE_HOURS: int = 2
    
    # Email Service Configuration (Brevo & SMTP)
    BREVO_API_KEY: str = os.getenv("BREVO_API_KEY", "")
    BREVO_SENDER_EMAIL: str = os.getenv("BREVO_SENDER_EMAIL", "pirajan20012009@gmail.com")
    BREVO_SENDER_NAME: str = os.getenv("BREVO_SENDER_NAME", "Software Architecture Drift Detector")
    
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "pirajan20012009@gmail.com")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Software Architecture Drift Detector")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1")
    SMTP_USE_SSL: bool = os.getenv("SMTP_USE_SSL", "false").lower() in ("true", "1")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    EMAIL_TEST_MODE: bool = os.getenv("EMAIL_TEST_MODE", "true").lower() in ("true", "1")
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://praveenkumar1245.github.io",
    ]
    if os.getenv("FRONTEND_URL") and os.getenv("FRONTEND_URL") not in CORS_ORIGINS:
        CORS_ORIGINS.append(os.getenv("FRONTEND_URL"))
    
    # Optional AI
    AI_ENABLED: bool = os.getenv("AI_ENABLED", "false").lower() in ("true", "1")
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "mock")
    AI_API_KEY: str = os.getenv("AI_API_KEY", "")

    def ensure_directories(self):
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        self.PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
        self.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        self.MAILBOX_DIR.mkdir(parents=True, exist_ok=True)

settings = Settings()
settings.ensure_directories()
