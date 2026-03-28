import json
import time
import logging
import httpx
from typing import Optional, List

logger = logging.getLogger("ledger.ai")

# ── Settings Cache ──

_settings_cache = {}
_settings_cache_time = 0
CACHE_TTL = 30


def get_settings() -> dict:
    global _settings_cache, _settings_cache_time
    if time.time() - _settings_cache_time < CACHE_TTL and _settings_cache:
        return _settings_cache
    try:
        from database import SessionLocal
        from models import Setting
        db = SessionLocal()
        _settings_cache = {s.key: s.value for s in db.query(Setting).all()}
        _settings_cache_time = time.time()
        db.close()
    except Exception:
        pass
    return _settings_cache


def clear_settings_cache():
    global _settings_cache, _settings_cache_time
    _settings_cache = {}
    _settings_cache_time = 0


def get_setting(key: str, default: str = "") -> str:
    settings = get_settings()
    defaults = {
        "ai_enabled": "true",
        "ai_provider": "litellm",
        "classification_model": "gemini/gemini-2.5-flash",
        "profile_model": "gemini/gemini-2.5-flash",
        "ollama_base_url": "http://192.168.1.200:11434",
        "litellm_base_url": "http://192.168.1.100:4000",
        "litellm_api_key": "sk-olympus-litellm-master",
        "confidence_auto_resolve": "0.85",
        "confidence_suggest": "0.60",
    }
    return settings.get(key, defaults.get(key, default))


def get_confidence_auto_resolve() -> float:
    return float(get_setting("confidence_auto_resolve", "0.85"))


def get_confidence_suggest() -> float:
    return float(get_setting("confidence_suggest", "0.60"))


# ── AI Call Abstraction ──

def _call_ai(messages: list, model_key: str = "classification_model",
             format_json: bool = True) -> Optional[str]:
    """Call AI provider based on settings. Returns raw content string."""
    if get_setting("ai_enabled") != "true":
        return None

    provider = get_setting("ai_provider", "litellm")
    model = get_setting(model_key)

    try:
        if provider == "litellm":
            base_url = get_setting("litellm_base_url", "http://192.168.1.100:4000")
            api_key = get_setting("litellm_api_key", "")
            body = {
                "model": model,
                "messages": messages,
            }
            if format_json:
                body["response_format"] = {"type": "json_object"}
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            resp = httpx.post(
                f"{base_url}/v1/chat/completions",
                json=body,
                headers=headers,
                timeout=60.0,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        else:
            # Ollama
            base_url = get_setting("ollama_base_url", "http://192.168.1.200:11434")
            body = {
                "model": model,
                "messages": messages,
                "stream": False,
            }
            if format_json:
                body["format"] = "json"
            resp = httpx.post(
                f"{base_url}/api/chat",
                json=body,
                timeout=60.0,
            )
            resp.raise_for_status()
            return resp.json().get("message", {}).get("content", "")
    except Exception as e:
        logger.warning(f"AI call failed ({provider}/{model}): {e}")
        return None


# ── Classification ──

def classify_capture(raw_text: str, people_names: List[str], project_names: List[str],
                     open_items_context: str = "") -> Optional[dict]:
    """Call AI to classify a capture item. Returns parsed JSON or None."""
    system_prompt = """You are a classification engine for a personal productivity tool. Given a captured text note, classify it and return ONLY a JSON object (no markdown, no preamble).

Categories for item_type:
- "followup" = something to ask or check on with a person
- "todo" = a task for the user to do themselves
- "reminder" = time-sensitive, must do or check by a deadline
- "discussion" = something to tell or share with someone
- "goal" = long-horizon objective
- "profile_update" = information about a person to store (e.g. "John has 2 kids")
- "note" = general information, no action implied

Categories for urgency:
- "today" = must handle today
- "this_week" = handle this week
- "this_month" = handle this month
- "someday" = no time pressure

Return JSON: {"item_type": "...", "urgency": "...", "linked_people": [...], "linked_projects": [...], "confidence": 0.0-1.0, "resolution_candidates": [...]}

linked_people should contain display names from the known people list that are mentioned or implied.
linked_projects should contain project names from the known projects list that are mentioned or implied.
resolution_candidates should contain UUIDs of open items this might resolve (if text is past-tense or completion-like)."""

    user_prompt = f"""Known people: {', '.join(people_names) if people_names else 'None'}
Known projects: {', '.join(project_names) if project_names else 'None'}
{f'Open items for resolution matching: {open_items_context}' if open_items_context else ''}

Captured text: "{raw_text}"
"""

    content = _call_ai(
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        model_key="classification_model",
        format_json=True,
    )
    if not content:
        return None
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.warning(f"AI returned non-JSON: {content[:200]}")
        return None


# ── Profile Update Parsing ──

def parse_profile_update(raw_text: str, current_profile: dict) -> dict:
    """Parse a profile update into a structured field and extracted value."""

    children_str = ', '.join(current_profile.get('children', [])) or 'None'
    pets_str = ', '.join(current_profile.get('pets', [])) or 'None'

    prompt = f"""Extract structured profile information from this text about a person.

Profile fields: spouse, anniversary, children, pets, birthday, hobbies, location, general

Current children: {children_str}
Current pets: {pets_str}

Text: "{raw_text}"

Return ONLY a JSON object:
{{"field": "one of: spouse, anniversary, children, pets, birthday, hobbies, location, general", "value": "the extracted value only"}}

Examples:
"has a daughter named Susan" → {{"field": "children", "value": "Susan"}}
"wife is Sarah" → {{"field": "spouse", "value": "Sarah"}}
"lives in Austin Texas" → {{"field": "location", "value": "Austin, TX"}}
"birthday is March 3" → {{"field": "birthday", "value": "March 3"}}
"has a golden retriever named Max" → {{"field": "pets", "value": "Max (golden retriever)"}}
"enjoys golf and fishing" → {{"field": "hobbies", "value": "Golf, fishing"}}
"anniversary is June 15" → {{"field": "anniversary", "value": "June 15"}}

For children/pets, return ONLY the name (and type for pets). Do not repeat existing entries.
For general catch-all info that doesn't fit a field, use "general"."""

    content = _call_ai(
        [{"role": "user", "content": prompt}],
        model_key="profile_model",
        format_json=True,
    )
    if content:
        try:
            result = json.loads(content)
            if result.get("field") and result.get("value"):
                return result
        except json.JSONDecodeError:
            pass

    # Keyword fallback
    text_lower = raw_text.lower()
    if any(w in text_lower for w in ['daughter', 'son', 'child', 'kid', 'baby']):
        return {"field": "children", "value": raw_text}
    if any(w in text_lower for w in ['wife', 'husband', 'spouse', 'partner', 'married to']):
        return {"field": "spouse", "value": raw_text}
    if any(w in text_lower for w in ['dog', 'cat', 'pet', 'puppy', 'kitten', 'fish', 'bird']):
        return {"field": "pets", "value": raw_text}
    if any(w in text_lower for w in ['birthday', 'born on', 'born in']):
        return {"field": "birthday", "value": raw_text}
    if 'anniversary' in text_lower:
        return {"field": "anniversary", "value": raw_text}
    if any(w in text_lower for w in ['hobby', 'hobbies', 'enjoys', 'likes to', 'plays', 'fan of']):
        return {"field": "hobbies", "value": raw_text}
    if any(w in text_lower for w in ['lives in', 'moved to', 'based in', 'located in']):
        return {"field": "location", "value": raw_text}

    return {"field": "general", "value": raw_text}


# ── Meeting Summary ──

def generate_meeting_summary(context_name: str, context_notes: str,
                              items: list) -> Optional[str]:
    """Generate a structured meeting summary from item data."""
    resolved = [i for i in items if i.status and i.status.value == "done"]
    added = [i for i in items if i.status and i.status.value == "open"]

    lines = [f"Meeting with {context_name}"]
    lines.append("")

    if resolved:
        lines.append("Discussed / Completed:")
        for i in resolved:
            lines.append(f"  • {i.raw_text}")

    if added:
        lines.append("")
        lines.append("Added / Needs Action:")
        for i in added:
            lines.append(f"  • {i.raw_text}")

    if not resolved and not added:
        lines.append("General sync — no items added or completed.")

    return "\n".join(lines)
