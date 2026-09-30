"""Resolve JIN_HOME for standalone skill scripts.

Skill scripts may run outside the Jin process (system Python, nix env,
CI) where ``jin_constants`` is not importable.  This module provides the
same ``get_jin_home()`` contract without requiring it on ``sys.path``.

When ``jin_constants`` IS available it is used directly so profile
resolution and any future enhancements are picked up automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from jin_constants import get_jin_home as get_jin_home
except (ModuleNotFoundError, ImportError):

    def get_jin_home() -> Path:
        """Return the Jin home directory (default: ``~/.jin``)."""
        val = os.environ.get("JIN_HOME", "").strip()
        return Path(val) if val else Path.home() / ".jin"
