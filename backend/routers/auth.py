import os
import io
import json
import time
import base64
import secrets
import jwt
import pyotp
import qrcode
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel
from passlib.hash import bcrypt as bcrypt_hash
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session
from database import get_db
from models import Setting

router = APIRouter(prefix="/api/auth", tags=["auth"])

LEDGER_USERNAME = os.environ.get("LEDGER_USERNAME", "hieber")
_raw_password = os.environ.get("LEDGER_PASSWORD", "Aladdin386!")
SECRET_KEY = os.environ.get("APP_SECRET_KEY", "ldgr-x7k9m2p4-s3cr3t")
SESSION_HOURS = int(os.environ.get("SESSION_DURATION_HOURS", "24"))
TOTP_RESET_TOKEN = os.environ.get("TOTP_RESET_TOKEN", "")
COOKIE_NAME = "ledger_session"

# Phase 2: Password hashing — auto-detect if env var is already bcrypt
if _raw_password.startswith("$2b$") or _raw_password.startswith("$2a$"):
    _password_hash = _raw_password
else:
    _password_hash = bcrypt_hash.hash(_raw_password)

# Fernet key for encrypting TOTP secrets (derived from APP_SECRET_KEY)
import hashlib
_fernet_key = base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest())
_fernet = Fernet(_fernet_key)


def _encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    return _fernet.decrypt(ciphertext.encode()).decode()


# ── Rate Limiting (Phase 1) ──

MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60  # 15 minutes
_rate_limits: dict[str, dict] = {}  # ip -> {attempts, lockout_until}


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str) -> int | None:
    """Returns retry_after seconds if locked out, else None."""
    entry = _rate_limits.get(ip)
    if not entry:
        return None
    if entry.get("lockout_until"):
        remaining = entry["lockout_until"] - time.time()
        if remaining > 0:
            return int(remaining)
        # Lockout expired — reset
        del _rate_limits[ip]
    return None


def _record_failed_attempt(ip: str):
    entry = _rate_limits.setdefault(ip, {"attempts": 0, "lockout_until": None})
    entry["attempts"] += 1
    if entry["attempts"] >= MAX_ATTEMPTS:
        entry["lockout_until"] = time.time() + LOCKOUT_SECONDS


def _reset_rate_limit(ip: str):
    _rate_limits.pop(ip, None)


# ── Token helpers ──

def verify_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])


def _create_session_token(username: str) -> str:
    return jwt.encode(
        {"sub": username, "exp": datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)},
        SECRET_KEY,
        algorithm="HS256",
    )


def _create_pending_token(username: str) -> str:
    return jwt.encode(
        {
            "sub": username,
            "pending_2fa": True,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        SECRET_KEY,
        algorithm="HS256",
    )


# ── TOTP helpers ──

def _get_totp_secret(db: Session) -> str | None:
    setting = db.query(Setting).filter(Setting.key == "totp_secret").first()
    if setting and setting.value:
        try:
            return _decrypt(setting.value)
        except Exception:
            return None
    return None


def _is_totp_enabled(db: Session) -> bool:
    return _get_totp_secret(db) is not None


def _get_backup_codes(db: Session) -> list[str]:
    setting = db.query(Setting).filter(Setting.key == "totp_backup_codes").first()
    if setting and setting.value:
        try:
            return json.loads(setting.value)
        except Exception:
            return []
    return []


def _save_backup_codes(db: Session, hashed_codes: list[str]):
    setting = db.query(Setting).filter(Setting.key == "totp_backup_codes").first()
    val = json.dumps(hashed_codes)
    if setting:
        setting.value = val
    else:
        db.add(Setting(key="totp_backup_codes", value=val))


def _verify_backup_code(db: Session, code: str) -> bool:
    hashed_codes = _get_backup_codes(db)
    for i, h in enumerate(hashed_codes):
        if bcrypt_hash.verify(code, h):
            # Remove used code
            hashed_codes.pop(i)
            _save_backup_codes(db, hashed_codes)
            db.commit()
            return True
    return False


# ── Request models ──

class LoginRequest(BaseModel):
    username: str
    password: str


class TotpVerifyRequest(BaseModel):
    code: str
    pending_token: str


class TotpConfirmRequest(BaseModel):
    code: str
    secret: str


class TotpCodeRequest(BaseModel):
    code: str


class TotpResetRequest(BaseModel):
    reset_token: str


# ── Endpoints ──

@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = _get_client_ip(request)

    # Rate limit check
    retry_after = _check_rate_limit(ip)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {(retry_after + 59) // 60} minutes.",
            headers={"Retry-After": str(retry_after)},
        )

    # Verify credentials (bcrypt)
    if body.username != LEDGER_USERNAME or not bcrypt_hash.verify(body.password, _password_hash):
        _record_failed_attempt(ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    _reset_rate_limit(ip)

    # Check if TOTP is enabled
    if _is_totp_enabled(db):
        pending_token = _create_pending_token(body.username)
        return {"ok": True, "requires_totp": True, "pending_token": pending_token}

    # No TOTP — issue full session
    token = _create_session_token(body.username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=SESSION_HOURS * 3600,
    )
    return {"ok": True, "username": body.username}


@router.post("/verify-totp")
def verify_totp(body: TotpVerifyRequest, response: Response, db: Session = Depends(get_db)):
    # Validate pending token
    try:
        payload = jwt.decode(body.pending_token, SECRET_KEY, algorithms=["HS256"])
        if not payload.get("pending_2fa"):
            raise HTTPException(status_code=401, detail="Invalid pending token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Pending token expired — please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid pending token")

    username = payload["sub"]
    code = body.code.strip()

    # Try TOTP code first
    secret = _get_totp_secret(db)
    if secret:
        totp = pyotp.TOTP(secret)
        if totp.verify(code, valid_window=1):
            token = _create_session_token(username)
            response.set_cookie(
                key=COOKIE_NAME,
                value=token,
                httponly=True,
                secure=True,
                samesite="lax",
                max_age=SESSION_HOURS * 3600,
            )
            return {"ok": True, "username": username}

    # Try backup code
    if len(code) == 8 and _verify_backup_code(db, code):
        token = _create_session_token(username)
        response.set_cookie(
            key=COOKIE_NAME,
            value=token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=SESSION_HOURS * 3600,
        )
        return {"ok": True, "username": username}

    raise HTTPException(status_code=401, detail="Invalid verification code")


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = verify_token(token)
        if payload.get("pending_2fa"):
            raise HTTPException(status_code=401, detail="2FA verification required")
        return {"username": payload["sub"]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")


# ── TOTP Management Endpoints ──

def _require_session(request: Request) -> dict:
    """Require a full session (not pending)."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = verify_token(token)
        if payload.get("pending_2fa"):
            raise HTTPException(status_code=401, detail="Full session required")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")


@router.get("/totp/status")
def totp_status(request: Request, db: Session = Depends(get_db)):
    _require_session(request)
    enabled = _is_totp_enabled(db)
    backup_count = len(_get_backup_codes(db)) if enabled else 0
    return {"enabled": enabled, "backup_codes_remaining": backup_count}


@router.post("/totp/setup")
def totp_setup(request: Request, db: Session = Depends(get_db)):
    _require_session(request)
    if _is_totp_enabled(db):
        raise HTTPException(status_code=400, detail="2FA is already enabled. Disable it first.")

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=LEDGER_USERNAME, issuer_name="Ledger")

    # Generate QR code as base64 PNG
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_b64}",
        "uri": uri,
    }


@router.post("/totp/setup/confirm")
def totp_confirm(body: TotpConfirmRequest, request: Request, db: Session = Depends(get_db)):
    _require_session(request)
    if _is_totp_enabled(db):
        raise HTTPException(status_code=400, detail="2FA is already enabled")

    # Verify the code against the provided secret
    totp = pyotp.TOTP(body.secret)
    if not totp.verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code. Please try again.")

    # Save encrypted secret
    encrypted = _encrypt(body.secret)
    setting = db.query(Setting).filter(Setting.key == "totp_secret").first()
    if setting:
        setting.value = encrypted
    else:
        db.add(Setting(key="totp_secret", value=encrypted))

    # Generate 8 backup codes
    raw_codes = [secrets.token_hex(4) for _ in range(8)]  # 8-char hex codes
    hashed = [bcrypt_hash.hash(c) for c in raw_codes]
    _save_backup_codes(db, hashed)
    db.commit()

    return {"ok": True, "backup_codes": raw_codes}


@router.post("/totp/disable")
def totp_disable(body: TotpCodeRequest, request: Request, db: Session = Depends(get_db)):
    _require_session(request)
    if not _is_totp_enabled(db):
        raise HTTPException(status_code=400, detail="2FA is not enabled")

    # Verify current TOTP code
    secret = _get_totp_secret(db)
    totp = pyotp.TOTP(secret)
    if not totp.verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid TOTP code")

    # Remove TOTP secret and backup codes
    db.query(Setting).filter(Setting.key.in_(["totp_secret", "totp_backup_codes"])).delete(synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.post("/totp/reset")
def totp_reset(body: TotpResetRequest, db: Session = Depends(get_db)):
    """Emergency TOTP reset via TOTP_RESET_TOKEN env var. No session required."""
    if not TOTP_RESET_TOKEN:
        raise HTTPException(status_code=404, detail="Not found")
    if body.reset_token != TOTP_RESET_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid reset token")

    db.query(Setting).filter(Setting.key.in_(["totp_secret", "totp_backup_codes"])).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "message": "2FA has been disabled"}
