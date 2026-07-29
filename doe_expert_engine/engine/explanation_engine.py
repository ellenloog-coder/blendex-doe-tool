"""Generate user-facing explanation fields from a matched CSV rule."""

from __future__ import annotations

from typing import Dict, List

from doe_expert_engine.models.schemas import DesignRule


def build_explanation(matched_rule: DesignRule) -> Dict[str, object]:
    return {
        "engineering_reason": (
            f"{matched_rule.engineering_reason} "
            f"(建议实验次数 ≤ {matched_rule.budget_max})"
        ),
        "warnings": _with_default(matched_rule.warnings),
        "next_actions": _with_default(matched_rule.next_actions),
    }


def _with_default(items: List[str]) -> List[str]:
    return list(items)
