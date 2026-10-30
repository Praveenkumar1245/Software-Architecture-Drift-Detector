from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from datetime import datetime

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    full_name: Optional[str] = Field(None, max_length=255)

class UserLogin(BaseModel):
    email: str
    password: str
    remember_me: bool = False

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: Optional[str] = None
    is_verified: bool
    created_at: datetime

class EmailVerifyRequest(BaseModel):
    token: str = Field(..., min_length=1)

class ResendVerificationRequest(BaseModel):
    email: EmailStr

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: Optional[str] = None
    reset_token: Optional[str] = None
    email: Optional[EmailStr] = None
    new_password: str = Field(..., min_length=8, description="Password must be at least 8 characters")

# --- 6-Digit Email OTP Schemas ---
class VerifySignupOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$", description="6-digit numeric OTP")

class ResendSignupOTPRequest(BaseModel):
    email: EmailStr

class VerifyResetOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$", description="6-digit numeric OTP")

class ResendResetOTPRequest(BaseModel):
    email: EmailStr

class VerifyResetOTPResponse(BaseModel):
    message: str
    email: EmailStr
    reset_token: str

class AuthStatusResponse(BaseModel):
    authenticated: bool
    user: Optional[UserResponse] = None

class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None
    email_sent: Optional[bool] = None
