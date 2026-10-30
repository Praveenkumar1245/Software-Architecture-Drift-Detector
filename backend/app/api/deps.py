from typing import Optional
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.models.user import User
from backend.app.services.auth_service import AuthService

def get_session_token_from_request(request: Request) -> Optional[str]:
    # 1. Primary: HttpOnly Session Cookie
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if token:
        return token
    
    # 2. Secondary header fallback: Authorization Bearer or X-Session-Token (for API/test flexibility)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    
    x_token = request.headers.get("X-Session-Token")
    if x_token:
        return x_token.strip()

    return None

def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    token = get_session_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in to access this resource."
        )

    user = AuthService.get_user_from_session(db, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or is invalid. Please sign in again."
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address not verified. Please verify your email before accessing this resource."
        )

    return user

def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[User]:
    token = get_session_token_from_request(request)
    if not token:
        return None

    user = AuthService.get_user_from_session(db, token)
    if not user or not user.is_verified:
        return None

    return user
