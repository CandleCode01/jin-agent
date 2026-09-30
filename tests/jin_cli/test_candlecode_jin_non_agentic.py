"""Tests for the CandleCode-Jin-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"jin"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``jin-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "jin" tag namespace.

``is_candlecode_jin_non_agentic`` should only match the actual CandleCode
Jin-3 / Jin-4 chat family.
"""

from __future__ import annotations

import pytest

from jin_cli.model_switch import (
    _JIN_MODEL_WARNING,
    _check_jin_model_warning,
    is_candlecode_jin_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "CandleCode/Jin-3-Llama-3.1-70B",
        "CandleCode/Jin-3-Llama-3.1-405B",
        "jin-3",
        "Jin-3",
        "jin-4",
        "jin-4-405b",
        "jin_4_70b",
        "openrouter/jin3:70b",
        "openrouter/candlecode/jin-4-405b",
        "CandleCode/Jin3",
        "jin-3.1",
    ],
)
def test_matches_real_candlecode_jin_chat_models(model_name: str) -> None:
    assert is_candlecode_jin_non_agentic(model_name), (
        f"expected {model_name!r} to be flagged as CandleCode Jin 3/4"
    )
    assert _check_jin_model_warning(model_name) == _JIN_MODEL_WARNING


