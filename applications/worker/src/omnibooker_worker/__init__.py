"""Omnibooker background worker package."""

from __future__ import annotations

import sys
from pathlib import Path

__all__ = ["__version__"]

__version__ = "0.1.0"


def _ensure_backend_on_path() -> None:
    package_dir = Path(__file__).resolve().parent
    repo_root = package_dir.parents[3]
    backend_src = repo_root / "applications" / "backend" / "src"
    backend_path = str(backend_src)
    if backend_src.exists() and backend_path not in sys.path:
        sys.path.append(backend_path)


_ensure_backend_on_path()
