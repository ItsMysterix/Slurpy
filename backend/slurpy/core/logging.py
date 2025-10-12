from __future__ import annotations

import logging
import sys
from typing import Literal, Optional

try:
    import uvicorn
except Exception:  # pragma: no cover
    uvicorn = None  # type: ignore


def _json_formatter(record: logging.LogRecord) -> str:
    import json, time
    payload = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
        "level": record.levelname,
        "logger": record.name,
        "msg": record.getMessage(),
    }
    if record.exc_info:
        payload["exc_info"] = logging.Formatter().formatException(record.exc_info)
    return json.dumps(payload, ensure_ascii=False)


class JsonStreamHandler(logging.StreamHandler):
    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        return _json_formatter(record)


def setup_logging(level: int = logging.INFO, fmt: Literal["console", "json"] = "console") -> None:
    """
    Configure root + uvicorn loggers. Idempotent.
    """
    root = logging.getLogger()
    if getattr(root, "_slurpy_logging_inited", False):
        return

    # clear existing handlers
    for h in list(root.handlers):
        root.removeHandler(h)

    handler: logging.Handler
    if fmt == "json":
        handler = JsonStreamHandler(stream=sys.stdout)
        formatter = logging.Formatter("%(message)s")  # json already formatted
    else:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            "[%(levelname)s] %(asctime)s %(name)s: %(message)s",
            datefmt="%H:%M:%S",
        )
    handler.setFormatter(formatter)

    root.setLevel(level)
    root.addHandler(handler)

    # align uvicorn if present
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        logger = logging.getLogger(name)
        logger.setLevel(level)
        # wipe uvicorn default handlers so we don't double log
        for h in list(logger.handlers):
            logger.removeHandler(h)
        logger.addHandler(handler)

    root._slurpy_logging_inited = True  # type: ignore[attr-defined]
