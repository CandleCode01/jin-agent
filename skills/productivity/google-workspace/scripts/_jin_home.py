"""Resolve JIN_HOME for standalone skill scripts.

Skill scripts may run outside the Jin process (e.g. system Python,
nix env, CI) where ``jin_constants`` is not importable.  This module
provides the same ``get_jin_home()`` and ``display_jin_home()``
contracts as ``jin_constants`` without requiring it on ``sys.path``.

When ``jin_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``jin_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``JIN_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from jin_constants import display_jin_home as display_jin_home
    from jin_constants import get_jin_home as get_jin_home
except (ModuleNotFoundError, ImportError):

    def get_jin_home() -> Path:
        """Return the Jin home directory (default: ~/.jin).

        Mirrors ``jin_constants.get_jin_home()``."""
        val = os.environ.get("JIN_HOME", "").strip()
        return Path(val) if val else Path.home() / ".jin"

    def display_jin_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``jin_constants.display_jin_home()``."""
        home = get_jin_home()
        try:
            return "~/" + home.relative_to(Path.home()).as_posix()
        except ValueError:
            return str(home)
