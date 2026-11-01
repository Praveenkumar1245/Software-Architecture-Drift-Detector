import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["EMAIL_TEST_MODE"] = "true"

from fastapi.testclient import TestClient
from backend.app.core.config import settings
settings.EMAIL_TEST_MODE = True
from backend.app.main import app
from backend.app.core.database import SessionLocal
from backend.app.models.user import User, EmailOTP
from backend.app.services.email_service import EmailService

client = TestClient(app)

def run_tests():
    print("=" * 70)
    print("STARTING 13 SCENARIO OTP AUTHENTICATION TEST SUITE")
    print("=" * 70)
    passed = 0
    total = 13

    # =========================================================================
    # SCENARIO 12: Login with unverified account fails (HTTP 403)
    # =========================================================================
    print("\n--- Test 12: Unverified user cannot log in (HTTP 403) ---")
    u12_email = f"unverified.{uuid.uuid4().hex[:6]}@test.com"
    u12_pwd = "Password123!@#"
    r = client.post("/api/v1/auth/signup", json={"email": u12_email, "password": u12_pwd, "full_name": "Unverified User"})
    assert r.status_code == 201, f"Signup failed: {r.text}"
    
    # Attempt login before OTP verification
    login_attempt = client.post("/api/v1/auth/login", json={"email": u12_email, "password": u12_pwd})
    assert login_attempt.status_code == 403, f"Expected 403 Forbidden, got {login_attempt.status_code}: {login_attempt.text}"
    assert "not verified" in login_attempt.json()["detail"].lower()
    print("[PASS] Scenario 12: Unverified account login blocked with 403 Forbidden.")
    passed += 1

    # =========================================================================
    # SCENARIO 1: New user signup + correct OTP -> verified & activated
    # =========================================================================
    print("\n--- Test 1: New user signup + correct OTP ---")
    u1_email = f"user1.{uuid.uuid4().hex[:6]}@test.com"
    u1_pwd = "Password123!@#"
    r1 = client.post("/api/v1/auth/signup", json={"email": u1_email, "password": u1_pwd, "full_name": "User One"})
    assert r1.status_code == 201

    # Retrieve generated OTP from DB
    db = SessionLocal()
    user1 = db.query(User).filter(User.email == u1_email).first()
    assert user1 is not None
    assert user1.is_verified is False
    
    # Dev mailbox captures the email
    mail1 = EmailService.get_latest_dev_email(email=u1_email, email_type="signup_otp")
    assert mail1 is not None
    otp1 = mail1["token"]
    assert len(otp1) == 6 and otp1.isdigit()

    # Verify signup OTP
    v1 = client.post("/api/v1/auth/verify-signup-otp", json={"email": u1_email, "otp": otp1})
    assert v1.status_code == 200, f"Verification failed: {v1.text}"
    assert "verified successfully" in v1.json()["message"].lower()

    # Check user is now verified
    db.refresh(user1)
    assert user1.is_verified is True
    print(f"[PASS] Scenario 1: New user signed up, entered correct OTP ({otp1}), account verified.")
    passed += 1
    db.close()

    # =========================================================================
    # SCENARIO 2: Signup + incorrect OTP -> rejected, attempts counter decremented
    # =========================================================================
    print("\n--- Test 2: Signup + incorrect OTP ---")
    u2_email = f"user2.{uuid.uuid4().hex[:6]}@test.com"
    u2_pwd = "Password123!@#"
    client.post("/api/v1/auth/signup", json={"email": u2_email, "password": u2_pwd, "full_name": "User Two"})
    
    # Try wrong OTP
    v2 = client.post("/api/v1/auth/verify-signup-otp", json={"email": u2_email, "otp": "000000"})
    assert v2.status_code == 400
    assert "4 attempt(s) remaining" in v2.json()["detail"]
    print("[PASS] Scenario 2: Incorrect OTP rejected with remaining attempts counter.")
    passed += 1

    # =========================================================================
    # SCENARIO 3: Signup + expired OTP (> 5 minutes) -> rejected
    # =========================================================================
    print("\n--- Test 3: Signup + expired OTP ---")
    u3_email = f"user3.{uuid.uuid4().hex[:6]}@test.com"
    client.post("/api/v1/auth/signup", json={"email": u3_email, "password": "Password123!@#", "full_name": "User Three"})
    
    db = SessionLocal()
    user3 = db.query(User).filter(User.email == u3_email).first()
    otp_record3 = db.query(EmailOTP).filter(EmailOTP.user_id == user3.id, EmailOTP.purpose == "SIGNUP").first()
    # Force expiration back by 10 minutes
    otp_record3.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    db.commit()
    
    mail3 = EmailService.get_latest_dev_email(email=u3_email, email_type="signup_otp")
    v3 = client.post("/api/v1/auth/verify-signup-otp", json={"email": u3_email, "otp": mail3["token"]})
    assert v3.status_code == 400
    assert "expired" in v3.json()["detail"].lower()
    print("[PASS] Scenario 3: Expired OTP rejected with 400 Bad Request.")
    passed += 1
    db.close()

    # =========================================================================
    # SCENARIO 4: Signup + reused OTP -> rejected
    # =========================================================================
    print("\n--- Test 4: Signup + reused OTP ---")
    # Re-using otp1 from Scenario 1
    v4 = client.post("/api/v1/auth/verify-signup-otp", json={"email": u1_email, "otp": otp1})
    # Account already verified or OTP already used
    assert v4.status_code in (200, 400)
    # Testing re-use on active unverified user where OTP used_at is set:
    db = SessionLocal()
    u4_email = f"user4.{uuid.uuid4().hex[:6]}@test.com"
    client.post("/api/v1/auth/signup", json={"email": u4_email, "password": "Password123!@#"})
    mail4 = EmailService.get_latest_dev_email(email=u4_email, email_type="signup_otp")
    otp4 = mail4["token"]
    user4 = db.query(User).filter(User.email == u4_email).first()
    otp_rec4 = db.query(EmailOTP).filter(EmailOTP.user_id == user4.id, EmailOTP.purpose == "SIGNUP").first()
    otp_rec4.used_at = datetime.now(timezone.utc)
    db.commit()

    v4_try = client.post("/api/v1/auth/verify-signup-otp", json={"email": u4_email, "otp": otp4})
    assert v4_try.status_code == 400
    assert "no active verification code" in v4_try.json()["detail"].lower() or "expired" in v4_try.json()["detail"].lower()
    print("[PASS] Scenario 4: Reused OTP rejected.")
    passed += 1
    db.close()

    # =========================================================================
    # SCENARIO 5: Forgot password + correct OTP -> verified, reset_token returned
    # =========================================================================
    print("\n--- Test 5: Forgot password + correct OTP ---")
    fp = client.post("/api/v1/auth/forgot-password", json={"email": u1_email})
    assert fp.status_code == 200

    mail_fp = EmailService.get_latest_dev_email(email=u1_email, email_type="reset_otp")
    assert mail_fp is not None
    otp_fp = mail_fp["token"]
    assert len(otp_fp) == 6 and otp_fp.isdigit()

    v_fp = client.post("/api/v1/auth/verify-reset-otp", json={"email": u1_email, "otp": otp_fp})
    assert v_fp.status_code == 200
    reset_token = v_fp.json()["reset_token"]
    assert reset_token is not None and len(reset_token) > 20
    print(f"[PASS] Scenario 5: Forgot password OTP verified, reset token issued ({reset_token[:10]}...).")
    passed += 1

    # =========================================================================
    # SCENARIO 6: Forgot password + incorrect OTP -> rejected
    # =========================================================================
    print("\n--- Test 6: Forgot password + incorrect OTP ---")
    u6_email = f"user6.{uuid.uuid4().hex[:6]}@test.com"
    client.post("/api/v1/auth/signup", json={"email": u6_email, "password": "Password123!@#"})
    m6 = EmailService.get_latest_dev_email(email=u6_email, email_type="signup_otp")
    client.post("/api/v1/auth/verify-signup-otp", json={"email": u6_email, "otp": m6["token"]})
    
    client.post("/api/v1/auth/forgot-password", json={"email": u6_email})
    v6_wrong = client.post("/api/v1/auth/verify-reset-otp", json={"email": u6_email, "otp": "999999"})
    assert v6_wrong.status_code == 400
    assert "4 attempt(s) remaining" in v6_wrong.json()["detail"]
    print("[PASS] Scenario 6: Incorrect reset OTP rejected.")
    passed += 1

    # =========================================================================
    # SCENARIO 7: Forgot password + expired OTP -> rejected
    # =========================================================================
    print("\n--- Test 7: Forgot password + expired OTP ---")
    db = SessionLocal()
    u6_user = db.query(User).filter(User.email == u6_email).first()
    otp_rec6 = db.query(EmailOTP).filter(EmailOTP.user_id == u6_user.id, EmailOTP.purpose == "PASSWORD_RESET").first()
    otp_rec6.expires_at = datetime.now(timezone.utc) - timedelta(minutes=15)
    db.commit()

    m6_reset = EmailService.get_latest_dev_email(email=u6_email, email_type="reset_otp")
    v6_exp = client.post("/api/v1/auth/verify-reset-otp", json={"email": u6_email, "otp": m6_reset["token"]})
    assert v6_exp.status_code == 400
    assert "expired" in v6_exp.json()["detail"].lower()
    print("[PASS] Scenario 7: Expired reset OTP rejected.")
    passed += 1
    db.close()

    # =========================================================================
    # SCENARIO 8: Password validation requirements (< 8 chars) in Set New Password
    # =========================================================================
    print("\n--- Test 8: Password validation requirements ---")
    r8 = client.post("/api/v1/auth/reset-password", json={
        "email": u1_email,
        "reset_token": reset_token,
        "new_password": "short"
    })
    assert r8.status_code == 422 or r8.status_code == 400
    print("[PASS] Scenario 8: Weak/short password rejected.")
    passed += 1

    # =========================================================================
    # SCENARIO 9: Successful password update using reset_token
    # =========================================================================
    print("\n--- Test 9: Successful password update ---")
    new_pwd = "BrandNewPassword2026!#"
    r9 = client.post("/api/v1/auth/reset-password", json={
        "email": u1_email,
        "reset_token": reset_token,
        "new_password": new_pwd
    })
    assert r9.status_code == 200, f"Password reset failed: {r9.text}"
    assert "password updated successfully" in r9.json()["message"].lower()
    print("[PASS] Scenario 9: Password updated successfully.")
    passed += 1

    # =========================================================================
    # SCENARIO 10: Login with new password succeeds
    # =========================================================================
    print("\n--- Test 10: Login with new password succeeds ---")
    r10 = client.post("/api/v1/auth/login", json={"email": u1_email, "password": new_pwd})
    assert r10.status_code == 200
    assert "signed in successfully" in r10.json()["message"].lower()
    print("[PASS] Scenario 10: Authenticated successfully with new password.")
    passed += 1

    # =========================================================================
    # SCENARIO 11: Login with old password fails
    # =========================================================================
    print("\n--- Test 11: Login with old password fails ---")
    r11 = client.post("/api/v1/auth/login", json={"email": u1_email, "password": u1_pwd})
    assert r11.status_code == 401
    print("[PASS] Scenario 11: Login with old password rejected with 401 Unauthorized.")
    passed += 1

    # =========================================================================
    # SCENARIO 13: Resend OTP cooldown and attempt limits
    # =========================================================================
    print("\n--- Test 13: Resend OTP cooldown (60s) & 5 failed attempts limit ---")
    u13_email = f"user13.{uuid.uuid4().hex[:6]}@test.com"
    client.post("/api/v1/auth/signup", json={"email": u13_email, "password": "Password123!@#"})
    
    # Immediate resend attempt within 60 seconds must return HTTP 429
    resend_imm = client.post("/api/v1/auth/resend-signup-otp", json={"email": u13_email})
    assert resend_imm.status_code == 429, f"Expected 429 Too Many Requests, got {resend_imm.status_code}: {resend_imm.text}"
    assert "please wait" in resend_imm.json()["detail"].lower()
    print("  Sub-test A: 60-second cooldown rate limit enforced (429 Too Many Requests).")

    # Now test 5 failed attempts limit
    for attempt in range(1, 5):
        resp = client.post("/api/v1/auth/verify-signup-otp", json={"email": u13_email, "otp": "111111"})
        assert resp.status_code == 400
        assert f"{5 - attempt} attempt(s) remaining" in resp.json()["detail"]

    # 5th failed attempt:
    resp5 = client.post("/api/v1/auth/verify-signup-otp", json={"email": u13_email, "otp": "111111"})
    assert resp5.status_code == 400
    assert "maximum" in resp5.json()["detail"].lower()

    # 6th attempt should also reject because max attempts reached
    resp6 = client.post("/api/v1/auth/verify-signup-otp", json={"email": u13_email, "otp": "111111"})
    assert resp6.status_code == 400
    assert "maximum" in resp6.json()["detail"].lower()
    print("  Sub-test B: Maximum 5 failed attempts limit strictly enforced.")
    print("[PASS] Scenario 13: Resend cooldown & max attempts limit verified.")
    passed += 1

    print("\n" + "=" * 70)
    print(f"ALL {passed}/{total} AUTHENTICATION OTP SCENARIOS PASSED PERFECTLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
