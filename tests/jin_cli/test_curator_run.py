"""Tests for `jin curator run` CLI behavior."""

from __future__ import annotations

from types import SimpleNamespace

def _args(**kwargs):
    values = {
        "dry_run": False,
        "synchrocandlecode": False,
        "background": False,
    }
    values.update(kwargs)
    return SimpleNamespace(**values)

def test_run_defaults_to_synchrocandlecode(monkeypatch, capsys):
    import agent.curator as curator_state
    import jin_cli.curator as curator_cli

    calls = []
    monkeypatch.setattr(curator_state, "is_enabled", lambda: True)
    monkeypatch.setattr(
        curator_state,
        "run_curator_review",
        lambda **kwargs: calls.append(kwargs) or {"auto_transitions": {}},
    )

    assert curator_cli._cmd_run(_args()) == 0

    assert calls[0]["synchrocandlecode"] is True
    assert calls[0]["dry_run"] is False
    assert "background" not in capsys.readouterr().out
