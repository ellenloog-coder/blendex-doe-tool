"""Normal CSV-backed matching for DOE design recommendations."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterable, List, Optional

from doe_expert_engine.models.schemas import DesignRule


BACKBONE_PATH = Path(__file__).resolve().parents[1] / "knowledge" / "backbone_v1.csv"


def load_rules(csv_path: Path = BACKBONE_PATH) -> List[DesignRule]:
    with csv_path.open("r", encoding="utf-8", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        return [_row_to_rule(row) for row in reader]


def match_rule(
    goal: str,
    num_factors: int,
    user_budget: int,
    rules: Optional[Iterable[DesignRule]] = None,
) -> Optional[DesignRule]:
    """Match an exact-goal rule using factor range and budget constraints."""

    available_rules = list(rules) if rules is not None else load_rules()
    normalized_goal = goal.strip().lower()
    candidates = [
        rule
        for rule in available_rules
        if rule.goal.lower() == normalized_goal
        and rule.supports_factor_count(num_factors)
        and rule.supports_budget(user_budget)
    ]
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda rule: (
            rule.factor_coverage,
            abs(user_budget - rule.budget_max),
            rule.design_type,
            rule.rule_id,
        ),
    )[0]


def _row_to_rule(row: dict) -> DesignRule:
    return DesignRule(
        rule_id=row["rule_id"],
        goal=row["goal"],
        design_type=row["design_type"],
        display_name=row["display_name"],
        factor_min=int(row["factor_min"]),
        factor_max=int(row["factor_max"]),
        budget_min=int(row["budget_min"]),
        budget_max=int(row["budget_max"]),
        engineering_reason=row["engineering_reason"],
        warnings=_split_list(row.get("warnings", "")),
        next_actions=_split_list(row.get("next_actions", "")),
        is_fallback_candidate=row.get("is_fallback_candidate", "").strip().lower() == "true",
    )


def _split_list(raw_value: str) -> List[str]:
    return [item.strip() for item in raw_value.split(";") if item.strip()]
