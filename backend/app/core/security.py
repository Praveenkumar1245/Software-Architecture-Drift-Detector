import hashlib
import secrets
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError

# Modern Argon2id Password Hasher
_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16
)

def hash_password(plain_password: str) -> str:
    """Hashes a plain text password using modern Argon2id."""
    return _hasher.hash(plain_password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain text password against an Argon2id hash."""
    try:
        return _hasher.verify(hashed_password, plain_password)
    except (VerifyMismatchError, InvalidHashError):
        return False

def generate_secure_token(length_bytes: int = 32) -> str:
    """Generates a cryptographically random URL-safe token."""
    return secrets.token_urlsafe(length_bytes)

def generate_numeric_otp(digits: int = 6) -> str:
    """Generates a cryptographically secure random N-digit numeric OTP."""
    upper = 10 ** digits
    val = secrets.randbelow(upper)
    return f"{val:0{digits}d}"

def hash_token(raw_token: str) -> str:
    """Hashes a single-use token or session token using SHA-256 for safe DB storage."""
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()
