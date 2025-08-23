# scripts/export_slurpy_metrics.py
import os
import json
import argparse
from pathlib import Path
from datetime import datetime, timedelta, timezone
import datetime as dt
import pandas as pd
from sqlalchemy import create_engine, text, inspect
import matplotlib.pyplot as plt

# ---------- Config ----------
DEFAULT_DB = "sqlite:///slurpy_insights.db"
DB_URL = os.getenv("DATABASE_URL", DEFAULT_DB)

OUT = Path("exports")
OUT_DATA = OUT / "data"
OUT_CHARTS = OUT / "charts"
for p in [OUT_DATA, OUT_CHARTS]:
    p.mkdir(parents=True, exist_ok=True)

# ---------- Helpers ----------
def resolve_table_name(engine, candidates):
    insp = inspect(engine)
    names = [t for t in insp.get_table_names()]
    lower = {n.lower(): n for n in names}
    for cand in candidates:
        if cand in names:              # exact
            return cand
        if cand.lower() in lower:      # case-insensitive
            return lower[cand.lower()]
    return None

def parse_topics(series: pd.Series) -> pd.Series:
    def _norm(v):
        if v is None:
            return []
        if isinstance(v, list):
            return [x for x in v if isinstance(x, str)]
        if isinstance(v, str):
            # try json; else comma split
            try:
                arr = json.loads(v)
                if isinstance(arr, list):
                    return [x for x in arr if isinstance(x, str)]
            except Exception:
                return [s.strip() for s in v.split(",") if s.strip()]
        return []
    return series.apply(_norm)

def to_local_date(ts: pd.Timestamp) -> dt.date:
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    return ts.tz_convert("UTC").date()

# ---------- Load data ----------
def load_frames(engine, user_id, since, until):
    # likely Prisma model table names:
    chat_msg_tbl = resolve_table_name(engine, ["ChatMessage", "chat_messages", "chatmessage"])
    chat_sess_tbl = resolve_table_name(engine, ["ChatSession", "chat_sessions", "chatsession"])
    mood_tbl      = resolve_table_name(engine, ["MoodLog", "MoodEntry", "MoodCalendar", "mood_log", "mood_entry", "mood_calendar"])

    if not chat_msg_tbl or not chat_sess_tbl:
        raise SystemExit("Chat tables not found. Check your database connection or table names.")

    params = {"since": since, "until": until}
    user_clause = ""
    if user_id:
        user_clause = 'AND "userId" = :uid' if "postgresql" in DB_URL or DB_URL.startswith("postgres") else "AND userId = :uid"
        params["uid"] = user_id

    msg_sql = f"""
        SELECT id, "userId" as user_id, "sessionId" as session_id, role, content,
               emotion, intensity, topics, timestamp
        FROM "{chat_msg_tbl}"
        WHERE timestamp >= :since AND timestamp < :until {user_clause}
        ORDER BY timestamp ASC
    """
    sess_sql = f"""
        SELECT "sessionId" as session_id, "userId" as user_id, "startTime" as start_time,
               "endTime" as end_time, duration, "messageCount" as message_count
        FROM "{chat_sess_tbl}"
        WHERE start_time >= :since AND start_time < :until {user_clause}
        ORDER BY start_time ASC
    """

    with engine.begin() as conn:
        messages = pd.read_sql(text(msg_sql), conn, params=params, parse_dates=["timestamp"])
        sessions = pd.read_sql(text(sess_sql), conn, params=params, parse_dates=["start_time","end_time"])

        if mood_tbl:
            mood_sql = f"""
                SELECT date, COALESCE(mood, score) as mood, emotion, "userId" as user_id
                FROM "{mood_tbl}"
                WHERE date >= :since AND date < :until {user_clause}
                ORDER BY date ASC
            """
            mood = pd.read_sql(text(mood_sql), conn, params=params, parse_dates=["date"])
        else:
            mood = pd.DataFrame(columns=["date","mood","emotion","user_id"])

    return messages, sessions, mood

# ---------- Metrics ----------
def compute_metrics(messages, sessions, mood):
    # Topics (robust to json/text/arrays)
    messages["topics_list"] = parse_topics(messages["topics"])
    # Per-day message counts
    if not messages.empty:
        messages["date"] = messages["timestamp"].dt.tz_localize("UTC", nonexistent="shift_forward", ambiguous="NaT").dt.date
    msg_per_day = messages.groupby("date").size().rename("messages").reset_index()

    # Session depth
    sess_depth = sessions[["session_id", "message_count"]].copy()
    sess_depth = sess_depth.dropna()

    # Emotion breakdown
    emo = messages.dropna(subset=["emotion"])
    emo_counts = emo.groupby("emotion").size().rename("count").reset_index().sort_values("count", ascending=False)
    emo_counts["percentage"] = (emo_counts["count"] / emo_counts["count"].sum() * 100).round(1)

    # Weekly mood trend: prefer chat-derived intensity -> otherwise mood log
    def score_row(row):
        # intensity is 0..1; positive emotions boost, negative reduce
        positive = {"joy","happy","grateful","peaceful","calm","content","hopeful","excited","energetic"}
        negative = {"sad","angry","anxious","worried","frustrated","exhausted"}
        e = (row.get("emotion") or "").lower()
        inten = row.get("intensity")
        if pd.isna(inten): return None
        if e in positive:  return min(10, 5 + float(inten) * 5)
        if e in negative:  return max(1, 5 - float(inten) * 4)
        return 5 + (float(inten) - 0.5) * 2

    mood_chat = messages.dropna(subset=["timestamp"]).copy()
    mood_chat["mood_score"] = mood_chat.apply(score_row, axis=1)
    mood_chat = mood_chat.dropna(subset=["mood_score"])
    if not mood_chat.empty:
        mood_chat["date"] = mood_chat["timestamp"].dt.date
        mood_by_day_chat = mood_chat.groupby("date")["mood_score"].mean().round().rename("mood")
    else:
        mood_by_day_chat = pd.Series(dtype=float)

    if not mood.empty:
        mood["date"] = mood["date"].dt.date
        mood_by_day_cal = mood.groupby("date")["mood"].mean().round()
    else:
        mood_by_day_cal = pd.Series(dtype=float)

    # Merge preferring chat, fallback to calendar
    days = pd.date_range(
        start=min([d.min() for d in [messages["timestamp"]] if not messages.empty] + [pd.Timestamp.today().normalize() - pd.Timedelta(days=6)]),
        end=pd.Timestamp.today().normalize(),
        freq="D",
    ).date
    weekly = pd.DataFrame({"date": days})
    weekly["mood"] = weekly["date"].map(mood_by_day_chat.to_dict())
    weekly["mood"] = weekly["mood"].fillna(weekly["date"].map(mood_by_day_cal.to_dict()))
    weekly["mood"] = weekly["mood"].fillna(5).astype(int)
    weekly["day"] = pd.to_datetime(weekly["date"]).dt.day_name().str[:3]

    # Session duration stats
    if not sessions.empty:
        sessions["duration_min"] = sessions.apply(
            lambda r: r["duration"] if pd.notna(r["duration"]) else (
                ((r["end_time"] or pd.Timestamp.utcnow()) - r["start_time"]).total_seconds() / 60.0
            ),
            axis=1
        )
        sess_summary = sessions["duration_min"].describe()[["count","mean","50%","max"]].round(1).rename({"50%":"median"})
    else:
        sess_summary = pd.Series({"count":0,"mean":0,"median":0,"max":0})

    # Topic counts
    all_topics = [t for arr in messages["topics_list"].tolist() for t in arr]
    topic_counts = pd.Series(all_topics).value_counts().head(10).rename_axis("topic").reset_index(name="count") if all_topics else pd.DataFrame(columns=["topic","count"])

    return {
        "messages_per_day": msg_per_day,
        "session_depth": sess_depth,
        "emotion_breakdown": emo_counts,
        "weekly_mood": weekly.tail(7),   # last 7 days
        "session_summary": sess_summary,
        "topic_counts": topic_counts,
    }

# ---------- Charts ----------
def plot_weekly_mood(df):
    plt.figure()
    plt.bar(df["day"], df["mood"])
    plt.title("Weekly Mood Trend (1–10)")
    plt.xlabel("Day")
    plt.ylabel("Mood")
    out = OUT_CHARTS / "weekly_mood.png"
    plt.tight_layout(); plt.savefig(out, dpi=200); plt.close()
    return out

def plot_emotion_breakdown(df):
    plt.figure()
    y = df["emotion"].astype(str).tolist()[::-1]
    x = df["count"].tolist()[::-1]
    plt.barh(y, x)
    plt.title("Emotion Breakdown")
    plt.xlabel("Count")
    out = OUT_CHARTS / "emotion_breakdown.png"
    plt.tight_layout(); plt.savefig(out, dpi=200); plt.close()
    return out

def plot_messages_per_day(df):
    plt.figure()
    plt.plot(pd.to_datetime(df["date"]), df["messages"])
    plt.title("Messages per Day")
    plt.xlabel("Date")
    plt.ylabel("Messages")
    out = OUT_CHARTS / "messages_per_day.png"
    plt.tight_layout(); plt.savefig(out, dpi=200); plt.close()
    return out

def plot_session_depth(df):
    if df.empty: 
        return None
    plt.figure()
    plt.hist(df["message_count"].dropna(), bins=10)
    plt.title("Session Depth (messages per session)")
    plt.xlabel("Messages in Session")
    plt.ylabel("Frequency")
    out = OUT_CHARTS / "session_depth.png"
    plt.tight_layout(); plt.savefig(out, dpi=200); plt.close()
    return out

# ---------- Main ----------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", help="Clerk userId to filter (optional)")
    parser.add_argument("--days", type=int, default=30)
    args = parser.parse_args()

    engine = create_engine(DB_URL, future=True)

    until = datetime.now(timezone.utc)
    since = until - timedelta(days=args.days)

    messages, sessions, mood = load_frames(engine, args.user, since, until)
    metrics = compute_metrics(messages, sessions, mood)

    # Save CSVs
    metrics["messages_per_day"].to_csv(OUT_DATA / "messages_per_day.csv", index=False)
    metrics["weekly_mood"].to_csv(OUT_DATA / "weekly_mood.csv", index=False)
    metrics["emotion_breakdown"].to_csv(OUT_DATA / "emotion_breakdown.csv", index=False)
    metrics["session_depth"].to_csv(OUT_DATA / "session_depth.csv", index=False)
    metrics["topic_counts"].to_csv(OUT_DATA / "top_topics.csv", index=False)
    metrics["session_summary"].to_csv(OUT_DATA / "session_summary.csv")

    # Charts
    charts = []
    if not metrics["weekly_mood"].empty:
      charts.append(plot_weekly_mood(metrics["weekly_mood"]))
    if not metrics["emotion_breakdown"].empty:
      charts.append(plot_emotion_breakdown(metrics["emotion_breakdown"]))
    if not metrics["messages_per_day"].empty:
      charts.append(plot_messages_per_day(metrics["messages_per_day"]))
    if not metrics["session_depth"].empty:
      sd = plot_session_depth(metrics["session_depth"])
      if sd: charts.append(sd)

    print(f"✅ Data saved to {OUT_DATA}")
    print(f"🖼️  Charts saved to {OUT_CHARTS}")
    for c in charts:
        print(" -", c)

if __name__ == "__main__":
    main()
