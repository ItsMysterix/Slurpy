# safety.py
import re
IMMEDIATE = [r"\bkill myself\b", r"\bsuicide\b", r"\bend my life\b", r"\bwish i were dead\b"]
ELEVATED = [r"\bhurt myself\b", r"\bself[- ]harm\b", r"\bcutting\b", r"\bcan['’]?t cope\b"]

def classify(text: str):
    t = text.lower()
    for pat in IMMEDIATE:
        if re.search(pat, t): return ("immediate", pat)
    for pat in ELEVATED:
        if re.search(pat, t): return ("elevated", pat)
    return (None, None)

def crisis_message(memories=None):
    base = ("I'm concerned about your safety. Please reach out now: call or text 988 in the US, or your local emergency services. "
            "You can also text HOME to 741741 (Crisis Text Line).")
    if memories and any("therap" in m.lower() for m in memories):
        return base + " If you have a therapist or trusted contact, please reach out to them as well."
    return base
