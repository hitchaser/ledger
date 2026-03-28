from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Setting

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULTS = {
    "ai_enabled": "true",
    "classification_provider": "litellm",
    "classification_model": "gemini/gemini-2.5-flash",
    "profile_provider": "ollama",
    "profile_model": "qwen3-coder:30b",
    "ollama_base_url": "http://192.168.1.200:11434",
    "litellm_base_url": "http://192.168.1.100:4000",
    "litellm_api_key": "sk-olympus-litellm-master",
    "confidence_auto_resolve": "0.85",
    "confidence_suggest": "0.60",
}


SENSITIVE_KEYS = {"litellm_api_key"}


@router.get("")
def get_settings(db: Session = Depends(get_db)):
    settings = {s.key: s.value for s in db.query(Setting).all()}
    result = {**DEFAULTS, **settings}
    # Mask sensitive values
    for key in SENSITIVE_KEYS:
        if key in result and result[key]:
            result[key] = "••••••••"
    return result


@router.put("")
def update_settings(body: dict, db: Session = Depends(get_db)):
    for key, value in body.items():
        if key not in DEFAULTS:
            continue
        setting = db.query(Setting).filter(Setting.key == key).first()
        if setting:
            setting.value = str(value)
        else:
            db.add(Setting(key=key, value=str(value)))
    db.commit()
    # Clear cached settings
    from services.ai_service import clear_settings_cache
    clear_settings_cache()
    settings = {s.key: s.value for s in db.query(Setting).all()}
    return {**DEFAULTS, **settings}
