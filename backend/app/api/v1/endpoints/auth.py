import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.api.deps import (
    get_current_user,
    get_current_user_optional,
    get_session_token_from_request
)
from backend.app.models.user import User
from backend.app.schemas.auth import (
    UserRegister,
    UserLogin,
    UserResponse,
    EmailVerifyRequest,
    ResendVerificationRequest,
    PasswordResetRequest,
    PasswordResetConfirm,
    VerifySignupOTPRequest,
    ResendSignupOTPRequest,
    VerifyResetOTPRequest,
    ResendResetOTPRequest,
    VerifyResetOTPResponse,
    AuthStatusResponse,
    MessageResponse
)
from backend.app.services.auth_service import AuthService
from backend.app.services.email_service import EmailService

logger = logging.getLogger("drift_detector.api.auth")

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
@router.post("/register/", status_code=status.HTTP_201_CREATED)
@router.post("/signup", status_code=status.HTTP_201_CREATED)
@router.post("/signup/", status_code=status.HTTP_201_CREATED)
def register(
    data: UserRegister,
    db: Session = Depends(get_db)
):
    """
    Register a new user account with unverified status.
    A 6-digit Email OTP is generated and dispatched to the user's registered email address.
    """
    user, email_result = AuthService.register_user(db, data)
    
    dev_action_url = None
    if email_result.get("method") == "development_mailbox":
        dev_action_url = email_result.get("action_url")
        msg = "Account created. (Development Mailbox Mode: verification OTP saved to data/mailbox/)."
    else:
        msg = "Account created. A 6-digit verification code has been sent to your email."

    return {
        "message": msg,
        "user_id": user.id,
        "email": user.email,
        "email_delivery": email_result.get("method"),
        "dev_verification_url": dev_action_url
    }

@router.post("/verify-signup-otp", response_model=MessageResponse)
@router.post("/verify-signup-otp/", response_model=MessageResponse)
def verify_signup_otp(
    data: VerifySignupOTPRequest,
    db: Session = Depends(get_db)
):
    """
    Verify 6-digit Email OTP for user signup.
    Enforces 5-minute expiration, max 5 attempts, and single-use invalidation.
    Activates the user account upon success.
    """
    res = AuthService.verify_signup_otp(db, data.email, data.otp)
    return MessageResponse(message=res["message"])

@router.post("/resend-signup-otp", response_model=MessageResponse)
@router.post("/resend-signup-otp/", response_model=MessageResponse)
def resend_signup_otp(
    data: ResendSignupOTPRequest,
    db: Session = Depends(get_db)
):
    """
    Resends a fresh 6-digit OTP for signup verification with a 60-second cooldown.
    """
    res = AuthService.resend_signup_otp(db, data.email)
    return MessageResponse(
        message=res["message"],
        detail=res.get("detail"),
        email_sent=res.get("email_sent")
    )

@router.post("/verify-email", response_model=MessageResponse)
@router.post("/verify-email/", response_model=MessageResponse)
def verify_email_post(
    data: EmailVerifyRequest,
    db: Session = Depends(get_db)
):
    """
    Validate an email verification token or 6-digit OTP.
    Only after successful verification can the user log in.
    """
    user = AuthService.verify_email(db, data.token)
    return MessageResponse(
        message=f"Email address {user.email} verified successfully. You may now log in."
    )

@router.get("/verify-email", response_model=MessageResponse)
@router.get("/verify-email/", response_model=MessageResponse)
def verify_email_get(
    token: str,
    db: Session = Depends(get_db)
):
    """
    GET handler for email verification links.
    """
    user = AuthService.verify_email(db, token)
    return MessageResponse(
        message=f"Email address {user.email} verified successfully. You may now log in."
    )

@router.post("/resend-verification", response_model=MessageResponse)
@router.post("/resend-verification/", response_model=MessageResponse)
def resend_verification(
    data: ResendVerificationRequest,
    db: Session = Depends(get_db)
):
    """
    Re-sends an email verification OTP/link with rate limiting.
    """
    res = AuthService.resend_verification(db, data.email)
    return MessageResponse(
        message=res["message"],
        detail=res.get("detail"),
        email_sent=res.get("email_sent")
    )

@router.post("/login")
@router.post("/login/")
def login(
    credentials: UserLogin,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Authenticate a user. Requires that the email has been verified.
    Establishes a secure HttpOnly session cookie.
    """
    try:
        user = AuthService.authenticate_user(db, credentials)

        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("User-Agent")

        raw_token, expires_at, max_age = AuthService.create_session(
            db=db,
            user=user,
            remember_me=credentials.remember_me,
            ip_address=ip_address,
            user_agent=user_agent
        )

        # Set secure HttpOnly cookie
        response.set_cookie(
            key=settings.SESSION_COOKIE_NAME,
            value=raw_token,
            max_age=max_age,
            expires=expires_at,
            path="/",
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite=settings.COOKIE_SAMESITE
        )

        return {
            "message": "Signed in successfully",
            "user": UserResponse.model_validate(user),
            "session_token": raw_token,
            "expires_at": expires_at.isoformat()
        }
    except HTTPException:
        raise
    except SQLAlchemyError as db_err:
        logger.error(f"Database connectivity failure during login attempt: {db_err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service is temporarily unavailable. Please try again later."
        )
    except Exception as exc:
        logger.error(f"Unexpected error during authentication: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing your authentication request."
        )

@router.get("/login")
@router.get("/login/")
def login_get_help():
    """
    Informative endpoint for GET /login to provide actionable error response
    if inspected or called with GET method.
    """
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="The login route requires an HTTP POST request with a JSON payload containing 'email' and 'password'."
    )

@router.post("/logout", response_model=MessageResponse)
@router.post("/logout/", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Terminates the session and clears the session cookie.
    """
    token = get_session_token_from_request(request)
    if token:
        AuthService.invalidate_session(db, token)

    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/"
    )
    return MessageResponse(message="Signed out successfully")

@router.get("/me", response_model=UserResponse)
@router.get("/me/", response_model=UserResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """
    Returns the profile of the currently authenticated user.
    """
    return current_user

@router.get("/status", response_model=AuthStatusResponse)
@router.get("/status/", response_model=AuthStatusResponse)
def get_auth_status(
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Non-blocking endpoint to check whether the current browser session is authenticated.
    """
    if current_user:
        return AuthStatusResponse(
            authenticated=True,
            user=UserResponse.model_validate(current_user)
        )
    return AuthStatusResponse(authenticated=False, user=None)

@router.post("/forgot-password", response_model=MessageResponse)
@router.post("/forgot-password/", response_model=MessageResponse)
@router.post("/forgot-password-otp", response_model=MessageResponse)
@router.post("/forgot-password-otp/", response_model=MessageResponse)
def forgot_password(
    data: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """
    Initiates password reset flow by sending a 6-digit Email OTP.
    Returns generic response to prevent account enumeration.
    """
    res = AuthService.request_forgot_password_otp(db, data.email)
    return MessageResponse(
        message=res["message"],
        detail=res.get("detail"),
        email_sent=res.get("email_sent")
    )

@router.post("/verify-reset-otp", response_model=VerifyResetOTPResponse)
@router.post("/verify-reset-otp/", response_model=VerifyResetOTPResponse)
def verify_reset_otp(
    data: VerifyResetOTPRequest,
    db: Session = Depends(get_db)
):
    """
    Validates a 6-digit numeric OTP for password reset.
    On success, invalidates the OTP and returns a single-use reset token for setting the new password.
    """
    res = AuthService.verify_reset_otp(db, data.email, data.otp)
    return VerifyResetOTPResponse(
        message=res["message"],
        email=res["email"],
        reset_token=res["reset_token"]
    )

@router.post("/resend-reset-otp", response_model=MessageResponse)
@router.post("/resend-reset-otp/", response_model=MessageResponse)
def resend_reset_otp(
    data: ResendResetOTPRequest,
    db: Session = Depends(get_db)
):
    """
    Resends a fresh 6-digit password reset OTP with a 60-second cooldown rate limit.
    """
    res = AuthService.resend_reset_otp(db, data.email)
    return MessageResponse(
        message=res["message"],
        detail=res.get("detail"),
        email_sent=res.get("email_sent")
    )

@router.post("/reset-password", response_model=MessageResponse)
@router.post("/reset-password/", response_model=MessageResponse)
def reset_password(
    data: PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """
    Consumes verified reset token and updates user password with Argon2id.
    Invalidates all existing sessions.
    """
    token_to_use = data.reset_token or data.token
    if not token_to_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid reset token is required."
        )

    user = AuthService.reset_password_with_token(
        db=db,
        token=token_to_use,
        new_password=data.new_password,
        email=data.email
    )
    return MessageResponse(
        message="Password Updated Successfully! Your password has been changed. You can now log in using your new password."
    )

@router.get("/dev/mailbox/latest")
def get_latest_dev_email():
    """
    Development helper to inspect the latest captured verification or reset email.
    """
    email_data = EmailService.get_latest_dev_email()
    if not email_data:
        raise HTTPException(status_code=404, detail="No emails found in mailbox.")
    return email_data
