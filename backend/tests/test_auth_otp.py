import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.user import User, EmailOTP
from backend.app.services.email_service import EmailService

def test_unverified_user_cannot_login(client: TestClient):
    """Unverified account login is blocked with 403 Forbidden."""
    email = f"unverified.{uuid.uuid4().hex[:6]}@test.com"
    pwd = "StrongPassword123!"
    r = client.post("/api/v1/auth/signup", json={"email": email, "password": pwd, "full_name": "Unverified Test"})
    assert r.status_code == 201

    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    assert login_res.status_code == 403
    assert "not verified" in login_res.json()["detail"].lower()

def test_signup_and_verify_otp_flow(client: TestClient, db: Session):
    """User signup -> 6-digit OTP delivery -> verification -> successful login."""
    email = f"verify.{uuid.uuid4().hex[:6]}@test.com"
    pwd = "StrongPassword123!"
    r = client.post("/api/v1/auth/signup", json={"email": email, "password": pwd, "full_name": "Verify Test"})
    assert r.status_code == 201

    # Fetch OTP from dev mailbox
    mail = EmailService.get_latest_dev_email(email=email, email_type="signup_otp")
    assert mail is not None
    otp = mail["token"]
    assert len(otp) == 6 and otp.isdigit()

    # Verify with correct OTP
    v_res = client.post("/api/v1/auth/verify-signup-otp", json={"email": email, "otp": otp})
    assert v_res.status_code == 200
    assert "verified" in v_res.json()["message"].lower()

    # Confirm user is verified in DB
    user = db.query(User).filter(User.email == email).first()
    assert user is not None
    assert user.is_verified is True

    # User can now login
    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    assert login_res.status_code == 200
    assert login_res.json()["user"]["email"] == email

def test_incorrect_otp_handling(client: TestClient):
    """Entering wrong OTP is rejected and remaining attempts are shown."""
    email = f"wrongotp.{uuid.uuid4().hex[:6]}@test.com"
    pwd = "StrongPassword123!"
    client.post("/api/v1/auth/signup", json={"email": email, "password": pwd, "full_name": "Wrong OTP Test"})

    v_res = client.post("/api/v1/auth/verify-signup-otp", json={"email": email, "otp": "999999"})
    assert v_res.status_code == 400
    assert "attempt(s) remaining" in v_res.json()["detail"]

def test_expired_otp_handling(client: TestClient, db: Session):
    """Expired OTPs (>5 minutes) are rejected."""
    email = f"expired.{uuid.uuid4().hex[:6]}@test.com"
    pwd = "StrongPassword123!"
    client.post("/api/v1/auth/signup", json={"email": email, "password": pwd, "full_name": "Expired OTP Test"})

    user = db.query(User).filter(User.email == email).first()
    otp_record = db.query(EmailOTP).filter(EmailOTP.user_id == user.id, EmailOTP.purpose == "SIGNUP").first()
    assert otp_record is not None

    # Manually expire OTP
    otp_record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    db.commit()

    mail = EmailService.get_latest_dev_email(email=email, email_type="signup_otp")
    v_res = client.post("/api/v1/auth/verify-signup-otp", json={"email": email, "otp": mail["token"]})
    assert v_res.status_code == 400
    assert "expired" in v_res.json()["detail"].lower()

def test_resend_otp_rate_limiting(client: TestClient):
    """Immediate OTP resend request within 60s cooldown is rate-limited (HTTP 429)."""
    email = f"resend.{uuid.uuid4().hex[:6]}@test.com"
    pwd = "StrongPassword123!"
    client.post("/api/v1/auth/signup", json={"email": email, "password": pwd})

    # Immediate resend should trigger 429 Too Many Requests
    r_res = client.post("/api/v1/auth/resend-signup-otp", json={"email": email})
    assert r_res.status_code == 429
    assert "seconds before requesting" in r_res.json()["detail"]

def test_incorrect_password_handling(client: TestClient):
    """Login with wrong password returns HTTP 401 Unauthorized."""
    email = f"user.{uuid.uuid4().hex[:6]}@test.com"
    pwd = "CorrectPassword123!"
    client.post("/api/v1/auth/signup", json={"email": email, "password": pwd})
    mail = EmailService.get_latest_dev_email(email=email, email_type="signup_otp")
    client.post("/api/v1/auth/verify-signup-otp", json={"email": email, "otp": mail["token"]})

    bad_login = client.post("/api/v1/auth/login", json={"email": email, "password": "WrongPassword999!"})
    assert bad_login.status_code == 401
    assert "invalid email or password" in bad_login.json()["detail"].lower()

def test_forgot_password_and_reset_flow(client: TestClient):
    """Forgot password -> 6-digit OTP -> verify reset OTP -> reset password -> old rejected, new accepted."""
    email = f"pwdreset.{uuid.uuid4().hex[:6]}@test.com"
    old_pwd = "OldPassword123!"
    new_pwd = "NewPassword456!@"

    # 1. Signup & verify
    client.post("/api/v1/auth/signup", json={"email": email, "password": old_pwd})
    mail = EmailService.get_latest_dev_email(email=email, email_type="signup_otp")
    client.post("/api/v1/auth/verify-signup-otp", json={"email": email, "otp": mail["token"]})

    # 2. Request forgot password OTP
    fp_res = client.post("/api/v1/auth/forgot-password-otp", json={"email": email})
    assert fp_res.status_code == 200

    # 3. Fetch reset OTP from dev mailbox
    reset_mail = EmailService.get_latest_dev_email(email=email, email_type="reset_otp")
    assert reset_mail is not None
    reset_otp = reset_mail["token"]

    # 4. Verify reset OTP to get reset authorization token
    v_reset = client.post("/api/v1/auth/verify-reset-otp", json={"email": email, "otp": reset_otp})
    assert v_reset.status_code == 200
    reset_token = v_reset.json()["reset_token"]
    assert reset_token is not None

    # 5. Set new password
    set_pwd = client.post("/api/v1/auth/reset-password", json={
        "token": reset_token,
        "new_password": new_pwd,
        "confirm_password": new_pwd,
        "email": email
    })
    assert set_pwd.status_code == 200

    # 6. Verify old password fails
    old_login = client.post("/api/v1/auth/login", json={"email": email, "password": old_pwd})
    assert old_login.status_code == 401

    # 7. Verify new password succeeds
    new_login = client.post("/api/v1/auth/login", json={"email": email, "password": new_pwd})
    assert new_login.status_code == 200
    assert new_login.json()["user"]["email"] == email
