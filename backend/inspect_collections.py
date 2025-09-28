#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
inspect_collections.py — Quick inspection of local Qdrant (SQLite) artifacts

Default behavior (no args):
  - Looks under ./ed_index_full/collection
  - Lists each collection folder and files with sizes
  - Prints storage.sqlite size, table list, and row counts

Options:
  --base PATH        Base directory (default: ed_index_full)
  --json             Emit JSON summary instead of human text
  --no-counts        Skip COUNT(*) per table (faster on huge DBs)
  --sample N         Show up to N sample rows per table (default: 0)
"""

from __future__ import annotations

import os
import json
import argparse
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Tuple, Union

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _bytes_to_human(n: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    f = float(n)
    for u in units:
        if f < 1024.0:
            return f"{f:.2f} {u}"
        f /= 1024.0
    return f"{f:.2f} PB"

def _safe_dir_list(p: Path) -> List[Path]:
    try:
        return [x for x in p.iterdir()]
    except Exception:
        return []

def _file_info(p: Path) -> Dict[str, Any]:
    try:
        size = p.stat().st_size
    except Exception:
        size = -1
    return {
        "name": p.name,
        "path": str(p),
        "size_bytes": size,
        "size_human": _bytes_to_human(size) if size >= 0 else "unknown",
        "type": "file",
    }

def _dir_info(p: Path) -> Dict[str, Any]:
    # Count direct children files (non-recursive)
    files = 0
    try:
        for child in p.iterdir():
            if child.is_file():
                files += 1
    except Exception:
        pass
    return {
        "name": p.name,
        "path": str(p),
        "files": files,
        "type": "dir",
    }

def _sqlite_tables(conn: sqlite3.Connection) -> List[str]:
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return [r[0] for r in cur.fetchall()]

def _sqlite_table_count(conn: sqlite3.Connection, table: str) -> Union[int, str]:
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM `{table}`")
        (cnt,) = cur.fetchone()
        return int(cnt)
    except Exception as e:
        return f"error: {e}"

def _sqlite_table_sample(conn: sqlite3.Connection, table: str, limit: int) -> List[Tuple[Any, ...]]:
    if limit <= 0:
        return []
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM `{table}` LIMIT ?", (limit,))
        return cur.fetchall()
    except Exception:
        return []

# -----------------------------------------------------------------------------
# Core
# -----------------------------------------------------------------------------
def inspect_collections(
    base_dir: Path,
    include_counts: bool = True,
    sample_rows: int = 0,
) -> Dict[str, Any]:
    """
    Inspect base_dir structure and optional SQLite details.

    Returns a dict summary (safe to JSON serialize).
    """
    collections_dir = base_dir / "collection"
    sqlite_path = base_dir / "storage.sqlite"

    summary: Dict[str, Any] = {
        "base_dir": str(base_dir),
        "collections_dir": str(collections_dir),
        "collections": [],
        "sqlite": {
            "present": sqlite_path.exists(),
            "path": str(sqlite_path),
            "size_bytes": None,
            "size_human": None,
            "tables": [],
        },
        "analysis": {
            "empty_collections": [],
            "notes": [],
        },
    }

    # ---- collections folder
    if not collections_dir.exists():
        summary["analysis"]["notes"].append("Collection directory not found.")
    else:
        for col in _safe_dir_list(collections_dir):
            if not col.is_dir() or col.name.startswith("."):
                continue
            entry = {"name": col.name, "path": str(col), "items": []}
            children = _safe_dir_list(col)
            if not children:
                summary["analysis"]["empty_collections"].append(col.name)
            for child in children:
                if child.is_file():
                    entry["items"].append(_file_info(child))
                elif child.is_dir():
                    entry["items"].append(_dir_info(child))
            summary["collections"].append(entry)

    # ---- sqlite
    if sqlite_path.exists():
        try:
            size = sqlite_path.stat().st_size
            summary["sqlite"]["size_bytes"] = size
            summary["sqlite"]["size_human"] = _bytes_to_human(size)
        except Exception:
            pass

        try:
            conn = sqlite3.connect(str(sqlite_path))
            tables = _sqlite_tables(conn)
            t_entries = []
            for t in tables:
                t_ent: Dict[str, Any] = {"name": t}
                if include_counts:
                    t_ent["count"] = _sqlite_table_count(conn, t)
                sample = _sqlite_table_sample(conn, t, sample_rows)
                if sample:
                    # represent sample rows as strings to avoid huge payloads
                    t_ent["sample"] = [tuple(str(v) for v in row) for row in sample]
                t_entries.append(t_ent)
            summary["sqlite"]["tables"] = t_entries
            conn.close()
        except Exception as e:
            summary["sqlite"]["error"] = f"{type(e).__name__}: {e}"
    else:
        summary["analysis"]["notes"].append("storage.sqlite not found.")

    # ---- heuristics
    if summary["analysis"]["empty_collections"]:
        summary["analysis"]["notes"].append(
            "Empty collections present. Data may exist in storage.sqlite "
            "but not be materialized in on-disk collections."
        )

    return summary

# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------
def _print_human(summary: Dict[str, Any]) -> None:
    base_dir = summary["base_dir"]
    print("🔍 INSPECTING QDRANT COLLECTIONS")
    print("=" * 40)
    print(f"📁 Base dir: {base_dir}")
    print(f"📂 Collections dir: {summary['collections_dir']}")

    # Collections
    cols = summary.get("collections", [])
    if not cols:
        print("❌ No collections found (or directory missing).")
    else:
        for col in cols:
            print(f"\n📦 Collection: {col['name']}")
            items = col.get("items", [])
            if not items:
                print("   ❌ EMPTY DIRECTORY")
            else:
                print("   Contents:")
                for it in items:
                    if it.get("type") == "file":
                        print(f"   📄 {it['name']} ({it.get('size_human', 'unknown')})")
                    else:
                        print(f"   📁 {it['name']}/ ({it.get('files', 0)} files)")

    # SQLite
    print("\n📊 SQLite:")
    sql = summary.get("sqlite", {})
    if not sql.get("present"):
        print("   ❌ storage.sqlite not found")
    else:
        print(f"   Path: {sql.get('path')}")
        if sql.get("size_human"):
            print(f"   Size: {sql.get('size_human')}")
        if "error" in sql:
            print(f"   ❌ Error: {sql['error']}")
        else:
            tables = sql.get("tables", [])
            tnames = [t["name"] for t in tables]
            print(f"   Tables: {tnames}")
            for t in tables:
                line = f"   - {t['name']}"
                if "count" in t:
                    line += f": {t['count']} rows"
                print(line)

    # Analysis
    print("\n🎯 ANALYSIS:")
    notes = summary["analysis"].get("notes", [])
    empties = summary["analysis"].get("empty_collections", [])
    if empties:
        print(f"❌ Empty collections: {empties}")
        print("💡 Data may be in storage.sqlite but not indexed into collection dirs.")
        print("🛠️ Consider re-running ingestion or direct extraction.")
    if notes:
        for n in notes:
            print("•", n)
    if not empties and not notes:
        print("✅ Collections and SQLite look consistent.")

def main() -> int:
    parser = argparse.ArgumentParser(description="Quick inspection of Qdrant collection directories")
    parser.add_argument("--base", default="ed_index_full", help="Base directory containing collection/ and storage.sqlite")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of human-readable output")
    parser.add_argument("--no-counts", action="store_true", help="Skip COUNT(*) for each table (faster)")
    parser.add_argument("--sample", type=int, default=0, help="Show up to N sample rows per table")
    args = parser.parse_args()

    base_dir = Path(args.base)
    summary = inspect_collections(
        base_dir=base_dir,
        include_counts=not args.no_counts,
        sample_rows=args.sample,
    )
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        _print_human(summary)

    # Return non-zero if obvious problems detected
    has_problem = (
        "error" in summary.get("sqlite", {}) or
        not summary.get("sqlite", {}).get("present") or
        bool(summary["analysis"].get("empty_collections"))
    )
    return 1 if has_problem else 0

if __name__ == "__main__":
    raise SystemExit(main())
