import httpx
import uuid

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_full_auth_otp_lifecycle():
    print("=" * 60)
    print("TESTING FULL AUTHENTICATION & OTP LIFECYCLE (LIVE BACKEND)")
    print("=" * 60)

    client = httpx.Client(base_url=BASE_URL, timeout=10.0)
    uid = uuid.uuid4().hex[:6]
    email = f"auth.audit.{uid}@drift-detector.org"
    password = "InitialPassword123!"
    new_password = "UpdatedPassword456!"

    # 1. Signup
    print(f"1. Submitting Signup for {email}...")
    signup_res = client.post("/auth/register", json={
        "email": email,
        "password": password,
        "full_name": "Audit Security User"
    })
    assert signup_res.status_code == 201, f"Signup failed: {signup_res.status_code} {signup_res.text}"
    print(f"   [PASS] Signup succeeded: status {signup_res.status_code}")

    # 2. Unverified login rejection
    print("2. Verifying unverified login is rejected...")
    unverified_login = client.post("/auth/login", json={
        "email": email,
        "password": password
    })
    assert unverified_login.status_code in (401, 403), f"Unverified login was not blocked: {unverified_login.text}"
    print(f"   [PASS] Unverified user login blocked ({unverified_login.status_code})")

    # 3. Retrieve captured OTP token
    print("3. Fetching OTP token from development test capture...")
    dev_email = client.get("/auth/dev/mailbox/latest").json()
    assert dev_email.get("recipient") == email, f"Expected {email}, got {dev_email.get('recipient')}"
    otp_code = dev_email.get("token")
    assert otp_code and len(otp_code) == 6, f"Invalid OTP code: {otp_code}"
    print(f"   [PASS] 6-digit OTP captured: {otp_code}")

    # 4. Verify OTP
    print(f"4. Verifying signup OTP ({otp_code})...")
    verify_res = client.post("/auth/verify-signup-otp", json={
        "email": email,
        "otp": otp_code
    })
    assert verify_res.status_code == 200, f"OTP verification failed: {verify_res.status_code} {verify_res.text}"
    print("   [PASS] Signup OTP verified successfully")

    # 5. Login with original password
    print("5. Logging in with verified account...")
    login_res = client.post("/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_res.status_code == 200, f"Login failed: {login_res.status_code} {login_res.text}"
    auth_data = login_res.json()
    token = auth_data["session_token"]
    assert token, "Session token missing"
    print("   [PASS] Logged in successfully, session token received")

    # 6. Forgot-password OTP request
    print("6. Requesting forgot-password OTP...")
    forgot_res = client.post("/auth/forgot-password", json={"email": email})
    assert forgot_res.status_code == 200, f"Forgot password request failed: {forgot_res.text}"
    print("   [PASS] Forgot-password OTP dispatched")

    # 7. Fetch reset OTP
    dev_reset = client.get("/auth/dev/mailbox/latest").json()
    reset_otp = dev_reset.get("token")
    assert reset_otp and len(reset_otp) == 6, f"Invalid reset OTP: {reset_otp}"
    print(f"   [PASS] Reset OTP captured: {reset_otp}")

    # 8. Verify reset OTP
    print("8. Verifying reset OTP...")
    verify_reset_res = client.post("/auth/verify-reset-otp", json={
        "email": email,
        "otp": reset_otp
    })
    assert verify_reset_res.status_code == 200, f"Reset OTP verification failed: {verify_reset_res.text}"
    reset_token = verify_reset_res.json()["reset_token"]
    assert reset_token, "Reset token missing"
    print("   [PASS] Reset OTP verified, received single-use reset token")

    # 9. Reset password with new password
    print("9. Resetting password...")
    reset_confirm_res = client.post("/auth/reset-password", json={
        "email": email,
        "reset_token": reset_token,
        "new_password": new_password
    })
    assert reset_confirm_res.status_code == 200, f"Password reset failed: {reset_confirm_res.text}"
    print("   [PASS] Password updated successfully")

    # 10. Old password rejected
    print("10. Confirming old password is now rejected...")
    old_login = client.post("/auth/login", json={
        "email": email,
        "password": password
    })
    assert old_login.status_code in (401, 403), f"Old password was accepted: {old_login.text}"
    print("   [PASS] Old password correctly rejected (401)")

    # 11. New password accepted
    print("11. Logging in with new password...")
    new_login = client.post("/auth/login", json={
        "email": email,
        "password": new_password
    })
    assert new_login.status_code == 200, f"New password login failed: {new_login.text}"
    assert new_login.json()["user"]["email"] == email
    print("   [PASS] New password authenticated successfully")

    print("=" * 60)
    print("ALL 11 AUTHENTICATION & OTP LIFECYCLE CHECKS PASSED")
    print("=" * 60)

if __name__ == "__main__":
    test_full_auth_otp_lifecycle()
