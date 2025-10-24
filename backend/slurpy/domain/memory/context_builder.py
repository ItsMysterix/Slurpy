# backend/slurpy/domain/memory/context_builder.py
from datetime import datetime, timedelta, timezone

def select_context(messages, plan: str):
    """
    messages: list[dict] with keys { "text": str, "ts": datetime, ... }
    plan: "free" | "pro" | "elite"
    """
    if plan in ("pro", "elite"):
        window = None
    else:
        window = datetime.now(timezone.utc) - timedelta(days=1)

    filtered = (
        [m for m in messages if m["ts"] >= window]
        if window else messages
    )

    # (optional) also cap token length here
    return filtered
