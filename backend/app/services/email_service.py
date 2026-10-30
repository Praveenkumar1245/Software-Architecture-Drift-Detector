import os
import json
import logging
import smtplib
import urllib.request
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
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        )

        logger.info(f"Dispatching transactional email to {to_email} via Brevo API...")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            message_id = data.get("messageId", "")
            logger.info(f"Email delivered via Brevo API to {to_email} (messageId: {message_id})")
            return {
                "delivered": True,
                "method": "brevo_api",
                "recipient": to_email,
                "message_id": message_id,
                "message": f"Email delivered to {to_email} via Brevo API"
            }

    @classmethod
    def send_verification_email(cls, email: str, token: str, full_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Sends an email address verification message.
        Contains a secure link and an OTP / token for manual verification.
        """
        verify_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={token}"
        manual_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email"
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
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        manual_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password"
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
        Delivers via Brevo API if configured.
        Falls back to SMTP relay if Brevo API is not set.
        Falls back to development mailbox if EMAIL_TEST_MODE is enabled.
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

        # In unit tests, immediately record to dev mailbox
        if os.environ.get("PYTEST_CURRENT_TEST"):
            dev_res = {
                "delivered": True,
                "method": "development_mailbox",
                "recipient": to_email,
                "action_url": action_url,
                "message": f"Test mode: Email captured to dev mailbox"
            }
            _record_to_mailbox(dev_res)
            return dev_res

        # 1. Brevo REST API v3
        if cls.is_brevo_configured():
            try:
                res = cls._send_via_brevo_api(
                    to_email=to_email,
                    subject=subject,
                    text_content=text_content,
                    html_content=html_content
                )
                _record_to_mailbox(res)
                return res
            except Exception as e:
                logger.error(f"Brevo API delivery failed to {to_email}: {str(e)}")
                if not cls.is_smtp_configured() and not settings.EMAIL_TEST_MODE:
                    # Still record to mailbox so user is not completely blocked
                    fallback_res = {
                        "delivered": False,
                        "method": "development_mailbox",
                        "recipient": to_email,
                        "action_url": action_url,
                        "message": f"Brevo delivery failed ({str(e)}), captured to dev mailbox"
                    }
                    _record_to_mailbox(fallback_res)
                    raise RuntimeError(f"Brevo API delivery failure: {str(e)}")
                logger.warning("Brevo API delivery failed; attempting fallback delivery.")

        # 2. SMTP Delivery (Brevo SMTP relay or custom SMTP)
        if cls.is_smtp_configured():
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
                msg["To"] = to_email

                part1 = MIMEText(text_content, "plain")
                part2 = MIMEText(html_content, "html")
                msg.attach(part1)
                msg.attach(part2)

                logger.info(f"Connecting to SMTP server {settings.SMTP_HOST}:{settings.SMTP_PORT}...")
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
                try:
                    if settings.SMTP_USE_TLS:
                        server.starttls()
                    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
                    logger.info(f"Email successfully sent via SMTP to {to_email}")
                    res = {
                        "delivered": True,
                        "method": "smtp",
                        "recipient": to_email,
                        "message": f"Email delivered to {to_email} via SMTP"
                    }
                    _record_to_mailbox(res)
                    return res
                finally:
                    try:
                        server.quit()
                    except Exception:
                        pass
            except Exception as e:
                logger.error(f"SMTP delivery failed to {to_email}: {str(e)}")
                fallback_res = {
                    "delivered": False,
                    "method": "development_mailbox",
                    "recipient": to_email,
                    "action_url": action_url,
                    "token": token,
                    "message": f"Live delivery failed ({str(e)}), captured to dev mailbox"
                }
                _record_to_mailbox(fallback_res)
                logger.warning(f"Delivery fallback: Email to {to_email} captured to local mailbox directory.")
                return fallback_res

        # 3. Development / Testing Mailbox mode
        if settings.EMAIL_TEST_MODE:
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
                "note": "Development/Testing mode email capture. In production, configure Brevo API or SMTP settings."
            }
            
            with open(data_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
                
            with open(html_file, "w", encoding="utf-8") as f:
                f.write(html_content)
                
            logger.info(f"[DEV MAILBOX] Auth email saved to {data_file}")
            return {
                "delivered": True,
                "method": "development_mailbox",
                "recipient": to_email,
                "mailbox_file": str(data_file),
                "action_url": action_url,
                "message": f"Development mode: Email captured to dev mailbox ({data_file.name})"
            }

        raise RuntimeError(
            "Neither Brevo API nor SMTP is configured and EMAIL_TEST_MODE is disabled. "
            "Please configure BREVO_API_KEY or SMTP credentials."
        )

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
