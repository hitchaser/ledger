import os
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

LEDGER_USERNAME = os.environ.get("LEDGER_USERNAME", "hieber")
LEDGER_PASSWORD = os.environ.get("LEDGER_PASSWORD", "Aladdin386!")
SECRET_KEY = os.environ.get("APP_SECRET_KEY", "ldgr-x7k9m2p4-s3cr3t")
SESSION_HOURS = int(os.environ.get("SESSION_DURATION_HOURS", "24"))
COOKIE_NAME = "ledger_session"


def verify_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginRequest, response: Response):
    if body.username != LEDGER_USERNAME or body.password != LEDGER_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = jwt.encode(
        {"sub": body.username, "exp": datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)},
        SECRET_KEY,
        algorithm="HS256",
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=SESSION_HOURS * 3600,
    )
    return {"ok": True, "username": body.username}


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
        return {"username": payload["sub"]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
