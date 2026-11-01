import os
import json
import logging
import smtplib
import urllib.request
import urllib.error
import re
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Dict, Any, Optional

from backend.app.core.config import settings

logger = logging.getLogger("drift_detector.email")

class EmailService:
    @staticmethod
    def is_brevo_configured() -> bool:
        return bool(settings.BREVO_API_KEY and settings.BREVO_API_KEY.strip())

    @staticmethod
    def is_smtp_configured() -> bool:
        return bool(settings.SMTP_HOST and settings.SMTP_HOST.strip())

    @classmethod
    def _send_via_brevo_api(
        cls,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str,
        to_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sends transactional email via Brevo HTTP API v3.
        Returns status dictionary with accepted/rejected state, messageId, or provider error details.
        """
        url = "https://api.brevo.com/v3/smtp/email"
        sender_email = settings.BREVO_SENDER_EMAIL or settings.SMTP_FROM_EMAIL or "pirajan20012009@gmail.com"
        sender_name = settings.BREVO_SENDER_NAME or settings.SMTP_FROM_NAME or "Software Architecture Drift Detector"

        payload = {
            "sender": {
                "name": sender_name,
                "email": sender_email
            },
            "to": [
                {
                    "email": to_email,
                    "name": to_name or to_email.split("@")[0]
                }
            ],
            "subject": subject,
            "htmlContent": html_content,
            "textContent": text_content
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "api-key": settings.BREVO_API_KEY.strip(),
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "SoftwareArchitectureDriftDetector/1.0"
            }
        )

        logger.info(f"Dispatching transactional email to {to_email} via Brevo API...")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
                message_id = data.get("messageId", "")
                logger.info(f"Email accepted via Brevo API for {to_email} (messageId: {message_id})")
                return {
                    "delivered": True,
                    "status": "accepted",
                    "method": "brevo_api",
                    "recipient": to_email,
                    "message_id": message_id,
                    "message": f"Email delivered to {to_email} via Brevo API (messageId: {message_id})"
                }
        except urllib.error.HTTPError as e:
            raw_body = ""
            try:
                raw_body = e.read().decode("utf-8")
                parsed = json.loads(raw_body)
                err_text = parsed.get("message") or parsed.get("detail") or raw_body
            except Exception:
                err_text = str(e)

            # Detect Brevo IP Whitelist restriction
            if "unrecognised IP address" in err_text or "authorised_ips" in err_text:
                ip_match = re.search(r"(\d+\.\d+\.\d+\.\d+)", err_text)
                detected_ip = ip_match.group(1) if ip_match else "your IP"
                diagnostic = (
                    f"Brevo API error (401 Unauthorized): Unrecognised IP address ({detected_ip}). "
                    f"Please add IP {detected_ip} in Brevo at https://app.brevo.com/security/authorised_ips "
                    f"or disable IP restrictions in Brevo Security settings."
                )
            elif e.code == 401:
                diagnostic = f"Brevo API error (401 Unauthorized): Invalid API key or unverified sender {sender_email}."
            elif e.code == 400:
                diagnostic = f"Brevo API error (400 Bad Request): {err_text}"
            else:
                diagnostic = f"Brevo API HTTP {e.code} error: {err_text}"

            logger.error(f"Brevo API delivery failed to {to_email}: {diagnostic}")
            return {
                "delivered": False,
                "status": "failed",
                "method": "brevo_api",
                "recipient": to_email,
                "http_status": e.code,
                "error": diagnostic,
                "message": diagnostic
            }
        except Exception as ex:
            diagnostic = f"Brevo API connection error: {str(ex)}"
            logger.error(f"Brevo API delivery failed to {to_email}: {diagnostic}")
            return {
                "delivered": False,
                "status": "failed",
                "method": "brevo_api",
                "recipient": to_email,
                "error": diagnostic,
                "message": diagnostic
            }

    @classmethod
    def send_verification_email(cls, email: str, token: str, full_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Sends an email address verification message.
        Contains a secure link and an OTP / token for manual verification.
        """
        base_url = settings.get_frontend_action_base_url()
        verify_url = f"{base_url}/verify-email?token={token}"
        manual_url = f"{base_url}/verify-email"
        recipient_name = full_name or email.split('@')[0]
        
        subject = "Verify your email - Software Architecture Drift Detector"
        
        text_content = f"""Hello {recipient_name},

Thank you for registering with the Software Architecture Drift Detector.

Your Verification / OTP Token:
{token}

Verify directly by opening this link:
{verify_url}

Or enter your verification code manually at:
{manual_url}

This code/link is valid for {settings.VERIFICATION_TOKEN_EXPIRE_HOURS} hours and can only be used once.

If you did not create an account, you can safely ignore this email.

Best regards,
The Software Architecture Drift Detector Team
"""

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 40px 20px;
      color: #0f172a;
    }}
    .container {{
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #d8e2ee;
      border-radius: 10px;
      padding: 36px 32px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }}
    .header {{
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }}
    .logo-title {{
      font-size: 18px;
      font-weight: 700;
      color: #03162d;
      letter-spacing: -0.02em;
    }}
    .badge {{
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      color: #009f95;
      background-color: #e6fffa;
      padding: 2px 8px;
      border-radius: 4px;
      margin-top: 4px;
    }}
    h1 {{
      font-size: 20px;
      font-weight: 600;
      color: #03162d;
      margin-top: 0;
      margin-bottom: 16px;
    }}
    p {{
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 20px;
    }}
    .otp-card {{
      background-color: #03162d;
      border: 1px solid #123047;
      border-radius: 8px;
      padding: 16px 20px;
      text-align: center;
      margin: 24px 0;
    }}
    .otp-label {{
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      margin-bottom: 8px;
    }}
    .otp-code {{
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 18px;
      font-weight: 700;
      color: #00d4c7;
      letter-spacing: 1.5px;
      word-break: break-all;
    }}
    .button-container {{
      margin: 24px 0;
      text-align: center;
    }}
    .btn {{
      display: inline-block;
      background-color: #03162d;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 12px 28px;
      border-radius: 8px;
    }}
    .direct-link {{
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
      background-color: #f8fafc;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #d8e2ee;
    }}
    .footer {{
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-title">Software Architecture Drift Detector</div>
      <div class="badge">Enterprise Verification</div>
    </div>
    <h1>Verify your email address</h1>
    <p>Hello {recipient_name},</p>
    <p>Thank you for registering. To access the Software Architecture Drift Detector, please confirm your email address.</p>
    
    <div class="otp-card">
      <div class="otp-label">Your Verification / OTP Token</div>
      <div class="otp-code">{token}</div>
    </div>

    <div class="button-container">
      <a href="{verify_url}" class="btn" target="_blank">Verify Email Address</a>
    </div>

    <p style="font-size: 13px; color: #64748b;">Or paste this link directly into your browser:</p>
    <div class="direct-link">{verify_url}</div>
    
    <p style="font-size: 13px; color: #64748b; margin-top: 16px;">This token expires in {settings.VERIFICATION_TOKEN_EXPIRE_HOURS} hours and can only be used once.</p>
    <div class="footer">
      If you did not request this verification, no action is needed.<br>
      &copy; {datetime.now(timezone.utc).year} Software Architecture Drift Detector.
    </div>
  </div>
</body>
</html>"""

        return cls._send_or_simulate(
            to_email=email,
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            email_type="verification",
            token=token,
            action_url=verify_url,
        )

    @classmethod
    def send_password_reset_email(cls, email: str, token: str, full_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Sends a password reset token link and code.
        """
        base_url = settings.get_frontend_action_base_url()
        reset_url = f"{base_url}/reset-password?token={token}"
        manual_url = f"{base_url}/reset-password"
        recipient_name = full_name or email.split('@')[0]
        
        subject = "Reset your password - Software Architecture Drift Detector"
        
        text_content = f"""Hello {recipient_name},

A password reset was requested for your Software Architecture Drift Detector account.

Your Password Reset / OTP Token:
{token}

Reset your password directly by visiting:
{reset_url}

Or manually enter the reset token at:
{manual_url}

This link is valid for {settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS} hours and can only be used once.

If you did not request a password reset, please ignore this email. Your password remains unchanged.

Best regards,
The Software Architecture Drift Detector Team
"""

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 40px 20px;
      color: #0f172a;
    }}
    .container {{
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #d8e2ee;
      border-radius: 10px;
      padding: 36px 32px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }}
    .header {{
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }}
    .logo-title {{
      font-size: 18px;
      font-weight: 700;
      color: #03162d;
      letter-spacing: -0.02em;
    }}
    h1 {{
      font-size: 20px;
      font-weight: 600;
      color: #03162d;
      margin-top: 0;
      margin-bottom: 16px;
    }}
    p {{
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 20px;
    }}
    .otp-card {{
      background-color: #03162d;
      border: 1px solid #123047;
      border-radius: 8px;
      padding: 16px 20px;
      text-align: center;
      margin: 24px 0;
    }}
    .otp-label {{
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      margin-bottom: 8px;
    }}
    .otp-code {{
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 18px;
      font-weight: 700;
      color: #00d4c7;
      letter-spacing: 1.5px;
      word-break: break-all;
    }}
    .button-container {{
      margin: 24px 0;
      text-align: center;
    }}
    .btn {{
      display: inline-block;
      background-color: #03162d;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 12px 28px;
      border-radius: 8px;
    }}
    .direct-link {{
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
      background-color: #f8fafc;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #d8e2ee;
    }}
    .footer {{
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-title">Software Architecture Drift Detector</div>
    </div>
    <h1>Password Reset Request</h1>
    <p>Hello {recipient_name},</p>
    <p>A password reset was requested for your account. You can use your secure reset token below or click the button.</p>

    <div class="otp-card">
      <div class="otp-label">Password Reset Token / OTP</div>
      <div class="otp-code">{token}</div>
    </div>

    <div class="button-container">
      <a href="{reset_url}" class="btn" target="_blank">Reset Password</a>
    </div>

    <p style="font-size: 13px; color: #64748b;">Or paste this link into your browser:</p>
    <div class="direct-link">{reset_url}</div>
    <p style="font-size: 13px; color: #64748b; margin-top: 16px;">This link is valid for {settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS} hours and can only be used once.</p>
    <div class="footer">
      If you did not request a password reset, you can safely disregard this message. Your password will not change.<br>
      &copy; {datetime.now(timezone.utc).year} Software Architecture Drift Detector.
    </div>
  </div>
</body>
</html>"""

        return cls._send_or_simulate(
            to_email=email,
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            email_type="password_reset",
            token=token,
            action_url=reset_url,
        )

    @classmethod
    def send_otp_email(cls, email: str, otp_code: str, action_name: str = "Account Security", full_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Sends a single-use numeric OTP code for authorization / sensitive actions.
        """
        recipient_name = full_name or email.split('@')[0]
        subject = f"{action_name} Verification Code: {otp_code} - Software Architecture Drift Detector"

        text_content = f"""Hello {recipient_name},

Your single-use verification code for {action_name} is:

{otp_code}

This code is confidential and valid for 10 minutes. Do not share it with anyone.

Best regards,
The Software Architecture Drift Detector Team
"""

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{action_name} Security Code</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 40px 20px;
      color: #0f172a;
    }}
    .container {{
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #d8e2ee;
      border-radius: 10px;
      padding: 36px 32px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }}
    .header {{
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }}
    .logo-title {{
      font-size: 18px;
      font-weight: 700;
      color: #03162d;
    }}
    .badge {{
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      color: #009f95;
      background-color: #e6fffa;
      padding: 2px 8px;
      border-radius: 4px;
      margin-top: 4px;
    }}
    h1 {{
      font-size: 20px;
      font-weight: 600;
      color: #03162d;
      margin-top: 0;
      margin-bottom: 16px;
    }}
    .otp-card {{
      background-color: #03162d;
      border: 1px solid #123047;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }}
    .otp-label {{
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      margin-bottom: 8px;
    }}
    .otp-code {{
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 32px;
      font-weight: 800;
      color: #00d4c7;
      letter-spacing: 6px;
    }}
    .footer {{
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-title">Software Architecture Drift Detector</div>
      <div class="badge">{action_name}</div>
    </div>
    <h1>Single-Use Verification Code</h1>
    <p>Hello {recipient_name},</p>
    <p>Use the verification code below to authorize your request:</p>

    <div class="otp-card">
      <div class="otp-label">Security OTP Code</div>
      <div class="otp-code">{otp_code}</div>
    </div>

    <p style="font-size: 13px; color: #64748b;">This code expires in 10 minutes. If you did not initiate this request, please change your password immediately.</p>
    <div class="footer">
      &copy; {datetime.now(timezone.utc).year} Software Architecture Drift Detector.
    </div>
  </div>
</body>
</html>"""

        return cls._send_or_simulate(
            to_email=email,
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            email_type="otp",
            token=otp_code,
            action_url=""
        )

    @classmethod
    def send_signup_otp_email(cls, email: str, otp_code: str, full_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Sends a 6-digit Email OTP for user signup verification.
        Expires in 5 minutes.
        """
        recipient_name = full_name or email.split('@')[0]
        subject = f"Verify Your Email: {otp_code} - Drift Detector – Architecture Quality"

        text_content = f"""Hello {recipient_name},

Thank you for registering with Drift Detector – Architecture Quality.

Your 6-digit verification code is:
{otp_code}

This code is valid for 5 minutes and can only be used once.

Please enter this verification code on the registration page to activate your account.
If you did not initiate this signup, please ignore this email.

Best regards,
The Drift Detector – Architecture Quality Team
"""

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #F5F7FA;
      margin: 0;
      padding: 40px 20px;
      color: #172B4D;
    }}
    .container {{
      max-width: 540px;
      margin: 0 auto;
      background-color: #FFFFFF;
      border: 1px solid #D8E2EE;
      border-radius: 12px;
      padding: 36px 32px;
      box-shadow: 0 4px 12px rgba(7, 29, 58, 0.05);
    }}
    .header {{
      display: flex;
      align-items: center;
      border-bottom: 2px solid #F5F7FA;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }}
    .brand {{
      font-size: 18px;
      font-weight: 700;
      color: #071D3A;
      letter-spacing: -0.01em;
    }}
    .tagline {{
      font-size: 12px;
      color: #155EEF;
      font-weight: 600;
      margin-top: 2px;
    }}
    h1 {{
      font-size: 24px;
      font-weight: 700;
      color: #071D3A;
      margin: 0 0 12px 0;
    }}
    p {{
      font-size: 15px;
      line-height: 1.6;
      color: #172B4D;
      margin: 0 0 18px 0;
    }}
    .otp-wrapper {{
      background: #071D3A;
      border-radius: 10px;
      padding: 24px 20px;
      text-align: center;
      margin: 28px 0;
    }}
    .otp-label {{
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #8FB4E8;
      margin-bottom: 10px;
    }}
    .otp-display {{
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 38px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: 10px;
      padding-left: 10px;
    }}
    .expiry-note {{
      display: inline-block;
      margin-top: 14px;
      padding: 4px 12px;
      background: rgba(22, 132, 91, 0.2);
      border: 1px solid #16845B;
      color: #2ee59d;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }}
    .notice {{
      background-color: #F5F7FA;
      border-left: 4px solid #155EEF;
      padding: 14px 16px;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      color: #526078;
      line-height: 1.5;
      margin-bottom: 24px;
    }}
    .footer {{
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #E2E8F0;
      font-size: 12px;
      color: #8FB4E8;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="brand">Drift Detector</div>
        <div class="tagline">Architecture Quality Platform</div>
      </div>
    </div>
    <h1>Verify Your Email</h1>
    <p>Hello <strong>{recipient_name}</strong>,</p>
    <p>Thank you for creating an account with <strong>Drift Detector – Architecture Quality</strong>. Use the 6-digit verification code below to verify your email address and activate your account:</p>

    <div class="otp-wrapper">
      <div class="otp-label">Six-Digit Verification Code</div>
      <div class="otp-display">{otp_code}</div>
      <div class="expiry-note">Expires in 5 minutes &bull; Single-use</div>
    </div>

    <div class="notice">
      <strong>Security notice:</strong> Antigravity and Drift Detector will never ask you to disclose this code. If you did not create this account, you can safely disregard this email.
    </div>

    <div class="footer">
      &copy; {datetime.now(timezone.utc).year} Drift Detector – Architecture Quality. All rights reserved.
    </div>
  </div>
</body>
</html>"""

        return cls._send_or_simulate(
            to_email=email,
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            email_type="signup_otp",
            token=otp_code,
            action_url=""
        )

    @classmethod
    def send_password_reset_otp_email(cls, email: str, otp_code: str, full_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Sends a 6-digit Email OTP for password reset.
        Expires in 5 minutes.
        """
        recipient_name = full_name or email.split('@')[0]
        subject = f"Password Reset Code: {otp_code} - Drift Detector – Architecture Quality"

        text_content = f"""Hello {recipient_name},

A password reset was requested for your Drift Detector – Architecture Quality account.

Your 6-digit verification code is:
{otp_code}

This code is valid for 5 minutes and can only be used once.

Please enter this verification code on the password reset page to choose a new password.
If you did not request a password reset, you can safely ignore this email. Your password remains unchanged.

Best regards,
The Drift Detector – Architecture Quality Team
"""

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #F5F7FA;
      margin: 0;
      padding: 40px 20px;
      color: #172B4D;
    }}
    .container {{
      max-width: 540px;
      margin: 0 auto;
      background-color: #FFFFFF;
      border: 1px solid #D8E2EE;
      border-radius: 12px;
      padding: 36px 32px;
      box-shadow: 0 4px 12px rgba(7, 29, 58, 0.05);
    }}
    .header {{
      display: flex;
      align-items: center;
      border-bottom: 2px solid #F5F7FA;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }}
    .brand {{
      font-size: 18px;
      font-weight: 700;
      color: #071D3A;
      letter-spacing: -0.01em;
    }}
    .tagline {{
      font-size: 12px;
      color: #155EEF;
      font-weight: 600;
      margin-top: 2px;
    }}
    h1 {{
      font-size: 24px;
      font-weight: 700;
      color: #071D3A;
      margin: 0 0 12px 0;
    }}
    p {{
      font-size: 15px;
      line-height: 1.6;
      color: #172B4D;
      margin: 0 0 18px 0;
    }}
    .otp-wrapper {{
      background: #071D3A;
      border-radius: 10px;
      padding: 24px 20px;
      text-align: center;
      margin: 28px 0;
    }}
    .otp-label {{
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #8FB4E8;
      margin-bottom: 10px;
    }}
    .otp-display {{
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 38px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: 10px;
      padding-left: 10px;
    }}
    .expiry-note {{
      display: inline-block;
      margin-top: 14px;
      padding: 4px 12px;
      background: rgba(22, 132, 91, 0.2);
      border: 1px solid #16845B;
      color: #2ee59d;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }}
    .notice {{
      background-color: #F5F7FA;
      border-left: 4px solid #155EEF;
      padding: 14px 16px;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      color: #526078;
      line-height: 1.5;
      margin-bottom: 24px;
    }}
    .footer {{
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #E2E8F0;
      font-size: 12px;
      color: #8FB4E8;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="brand">Drift Detector</div>
        <div class="tagline">Architecture Quality Platform</div>
      </div>
    </div>
    <h1>Reset Your Password</h1>
    <p>Hello <strong>{recipient_name}</strong>,</p>
    <p>A password reset was requested for your <strong>Drift Detector – Architecture Quality</strong> account. Use the 6-digit verification code below to proceed with setting a new password:</p>

    <div class="otp-wrapper">
      <div class="otp-label">Six-Digit Password Reset Code</div>
      <div class="otp-display">{otp_code}</div>
      <div class="expiry-note">Expires in 5 minutes &bull; Single-use</div>
    </div>

    <div class="notice">
      <strong>Important:</strong> Never share this code with anyone. If you did not request a password reset, you can safely ignore this email. Your current password remains secure.
    </div>

    <div class="footer">
      &copy; {datetime.now(timezone.utc).year} Drift Detector – Architecture Quality. All rights reserved.
    </div>
  </div>
</body>
</html>"""

        return cls._send_or_simulate(
            to_email=email,
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            email_type="reset_otp",
            token=otp_code,
            action_url=""
        )

    @classmethod
    def _send_via_smtp(
        cls,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str
    ) -> Dict[str, Any]:
        """
        Sends transactional email via SMTP relay (Brevo SMTP, Gmail SMTP, AWS SES, or custom SMTP).
        Supports SSL (port 465) and STARTTLS (port 587, 25, 2525).
        """
        sender_email = settings.SMTP_FROM_EMAIL or settings.BREVO_SENDER_EMAIL or "pirajan20012009@gmail.com"
        sender_name = settings.SMTP_FROM_NAME or settings.BREVO_SENDER_NAME or "Software Architecture Drift Detector"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{sender_name} <{sender_email}>"
        msg["To"] = to_email

        part1 = MIMEText(text_content, "plain")
        part2 = MIMEText(html_content, "html")
        msg.attach(part1)
        msg.attach(part2)

        use_ssl = getattr(settings, "SMTP_USE_SSL", False) or settings.SMTP_PORT == 465
        logger.info(f"Connecting to SMTP server {settings.SMTP_HOST}:{settings.SMTP_PORT} (SSL={use_ssl}, TLS={settings.SMTP_USE_TLS})...")

        server = None
        try:
            if use_ssl:
                server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
            else:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
                if settings.SMTP_USE_TLS:
                    server.starttls()

            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)

            server.sendmail(sender_email, [to_email], msg.as_string())
            logger.info(f"Email successfully accepted by SMTP server for {to_email}")
            return {
                "delivered": True,
                "status": "accepted",
                "method": "smtp",
                "recipient": to_email,
                "message": f"Email successfully accepted by SMTP server ({settings.SMTP_HOST}) for {to_email}"
            }
        except smtplib.SMTPAuthenticationError as auth_err:
            diagnostic = (
                f"SMTP Authentication failed (code 535) for user '{settings.SMTP_USERNAME}'. "
                f"If using Brevo, ensure you use the dedicated SMTP key from Brevo (SMTP & API > SMTP keys), "
                f"not the API key. If using Gmail, use a 16-character Google App Password."
            )
            logger.error(f"SMTP delivery failed to {to_email}: {diagnostic}")
            return {
                "delivered": False,
                "status": "failed",
                "method": "smtp",
                "recipient": to_email,
                "error": diagnostic,
                "message": diagnostic
            }
        except smtplib.SMTPSenderRefused as sender_err:
            diagnostic = f"SMTP sender rejected ({sender_err.smtp_code}): {sender_err.smtp_error.decode() if isinstance(sender_err.smtp_error, bytes) else sender_err.smtp_error}. Check SMTP_FROM_EMAIL."
            logger.error(f"SMTP delivery failed to {to_email}: {diagnostic}")
            return {
                "delivered": False,
                "status": "failed",
                "method": "smtp",
                "recipient": to_email,
                "error": diagnostic,
                "message": diagnostic
            }
        except smtplib.SMTPRecipientsRefused as rec_err:
            diagnostic = f"SMTP recipient rejected: {rec_err}"
            logger.error(f"SMTP delivery failed to {to_email}: {diagnostic}")
            return {
                "delivered": False,
                "status": "failed",
                "method": "smtp",
                "recipient": to_email,
                "error": diagnostic,
                "message": diagnostic
            }
        except Exception as e:
            diagnostic = f"SMTP connection/delivery error ({settings.SMTP_HOST}:{settings.SMTP_PORT}): {str(e)}"
            logger.error(f"SMTP delivery failed to {to_email}: {diagnostic}")
            return {
                "delivered": False,
                "status": "failed",
                "method": "smtp",
                "recipient": to_email,
                "error": diagnostic,
                "message": diagnostic
            }
        finally:
            if server:
                try:
                    server.quit()
                except Exception:
                    pass

    @classmethod
    def _send_or_simulate(
        cls,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str,
        email_type: str,
        token: str,
        action_url: str
    ) -> Dict[str, Any]:
        """
        Attempts real live delivery via Brevo API or SMTP.
        Captures to development mailbox if EMAIL_TEST_MODE is enabled or as fallback audit record.
        Never reports delivered=True if real delivery failed.
        """
        def _record_to_mailbox(delivery_info: Dict[str, Any]):
            try:
                settings.ensure_directories()
                timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
                sanitized_email = to_email.replace("@", "_at_").replace(".", "_")
                file_base = f"{timestamp}_{sanitized_email}_{email_type}"
                data_file = settings.MAILBOX_DIR / f"{file_base}.json"
                html_file = settings.MAILBOX_DIR / f"{file_base}.html"
                payload = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "recipient": to_email,
                    "email_type": email_type,
                    "subject": subject,
                    "action_url": action_url,
                    "token": token,
                    "delivery": delivery_info,
                }
                with open(data_file, "w", encoding="utf-8") as f:
                    json.dump(payload, f, indent=2)
                with open(html_file, "w", encoding="utf-8") as f:
                    f.write(html_content)
            except Exception as ex:
                logger.debug(f"Mailbox recording skipped: {ex}")

        # Unit tests mode
        if os.environ.get("PYTEST_CURRENT_TEST"):
            dev_res = {
                "delivered": True,
                "status": "test_mode",
                "method": "development_mailbox",
                "recipient": to_email,
                "action_url": action_url,
                "token": token,
                "message": "Test mode: Email captured to dev mailbox"
            }
            _record_to_mailbox(dev_res)
            return dev_res

        # Development Mailbox mode (explicitly enabled OR credentials not configured)
        if settings.EMAIL_TEST_MODE or not (cls.is_smtp_configured() or cls.is_brevo_configured()):
            settings.ensure_directories()
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
            sanitized_email = to_email.replace("@", "_at_").replace(".", "_")
            file_base = f"{timestamp}_{sanitized_email}_{email_type}"
            data_file = settings.MAILBOX_DIR / f"{file_base}.json"
            html_file = settings.MAILBOX_DIR / f"{file_base}.html"
            note = (
                "Development mailbox mode enabled via EMAIL_TEST_MODE=true."
                if settings.EMAIL_TEST_MODE
                else "SMTP/Brevo credentials not configured. Captured to development mailbox."
            )
            payload = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "recipient": to_email,
                "email_type": email_type,
                "subject": subject,
                "action_url": action_url,
                "token": token,
                "note": note
            }
            with open(data_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            with open(html_file, "w", encoding="utf-8") as f:
                f.write(html_content)
            logger.info(f"[DEV MAILBOX] Auth email saved to {data_file}")
            return {
                "delivered": True,
                "status": "test_mode",
                "method": "development_mailbox",
                "recipient": to_email,
                "mailbox_file": str(data_file),
                "action_url": action_url,
                "token": token,
                "message": f"Development mode: Email captured to dev mailbox ({data_file.name})"
            }

        provider_errors = []

        # 1. Attempt Brevo REST API v3
        if cls.is_brevo_configured():
            api_res = cls._send_via_brevo_api(
                to_email=to_email,
                subject=subject,
                text_content=text_content,
                html_content=html_content
            )
            if api_res.get("delivered"):
                _record_to_mailbox(api_res)
                return api_res
            provider_errors.append(api_res.get("error", "Brevo API delivery failed"))

        # 2. Attempt SMTP Delivery (Brevo SMTP relay or custom SMTP)
        if cls.is_smtp_configured():
            smtp_res = cls._send_via_smtp(
                to_email=to_email,
                subject=subject,
                text_content=text_content,
                html_content=html_content
            )
            if smtp_res.get("delivered"):
                _record_to_mailbox(smtp_res)
                return smtp_res
            provider_errors.append(smtp_res.get("error", "SMTP delivery failed"))

        # Both attempts failed (or neither was configured)
        combined_error = " | ".join(provider_errors) if provider_errors else (
            "Neither Brevo API nor SMTP is configured. Please configure BREVO_API_KEY or SMTP credentials in .env, "
            "or set EMAIL_TEST_MODE=true for offline development."
        )

        failed_res = {
            "delivered": False,
            "status": "failed",
            "method": "failed",
            "recipient": to_email,
            "error": combined_error,
            "action_url": action_url,
            "token": token,
            "message": f"Live email delivery failed: {combined_error}"
        }
        # Still record to mailbox so token is not lost for recovery
        _record_to_mailbox(failed_res)
        logger.error(f"Live email delivery failed for {to_email}: {combined_error}")
        return failed_res

    @classmethod
    def get_latest_dev_email(cls, email: Optional[str] = None, email_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Helper for automated tests and dev convenience to retrieve the latest captured email.
        """
        settings.ensure_directories()
        json_files = sorted(settings.MAILBOX_DIR.glob("*.json"), key=os.path.getmtime, reverse=True)
        for jf in json_files:
            try:
                with open(jf, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if email and data.get("recipient") != email:
                    continue
                if email_type and data.get("email_type") != email_type:
                    continue
                return data
            except Exception:
                continue
        return None
