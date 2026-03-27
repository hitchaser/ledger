import os
import json
import logging
import httpx
from typing import Optional, List

logger = logging.getLogger("ledger.ai")

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:14b")
AI_CONFIDENCE_AUTO_RESOLVE = float(os.environ.get("AI_CONFIDENCE_AUTO_RESOLVE", "0.85"))
AI_CONFIDENCE_SUGGEST = float(os.environ.get("AI_CONFIDENCE_SUGGEST", "0.60"))


def classify_capture(raw_text: str, people_names: List[str], project_names: List[str],
                     open_items_context: str = "") -> Optional[dict]:
    """Call Ollama to classify a capture item. Returns parsed JSON or None."""
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

    try:
        resp = httpx.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
                "format": "json",
            },
            timeout=60.0,
        )
        resp.raise_for_status()
        content = resp.json().get("message", {}).get("content", "")
        return json.loads(content)
    except Exception as e:
        logger.warning(f"AI classification failed: {e}")
        return None


def generate_meeting_summary(context_name: str, context_notes: str,
                              items: list) -> Optional[str]:
    """Generate a post-meeting summary via Ollama."""
    resolved = [i for i in items if i.status and i.status.value == "done"]
    added = [i for i in items]
    still_open = [i for i in items if i.status and i.status.value == "open"]

    prompt = f"""Write a brief meeting summary (3-6 sentences) for a meeting about/with {context_name}.

Context: {context_notes[:500] if context_notes else 'No prior context'}

Items resolved during meeting: {', '.join(i.raw_text[:80] for i in resolved) if resolved else 'None'}
Items added during meeting: {', '.join(i.raw_text[:80] for i in added) if added else 'None'}
Still open: {', '.join(i.raw_text[:80] for i in still_open) if still_open else 'None'}

Write a concise, professional summary paragraph."""

    try:
        resp = httpx.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()
    except Exception as e:
        logger.warning(f"AI summary failed: {e}")
        return None
