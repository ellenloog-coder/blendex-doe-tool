"""Shared data structures for the DOE expert decision engine."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class DesignRule:
    """A single recommendation rule loaded from the CSV backbone."""

    rule_id: str
    goal: str
    design_type: str
    display_name: str
    factor_min: int
    factor_max: int
    budget_min: int
    budget_max: int
    engineering_reason: str
    warnings: List[str]
    next_actions: List[str]
    is_fallback_candidate: bool

    @property
    def factor_coverage(self) -> int:
        return self.factor_max - self.factor_min

    def supports_factor_count(self, num_factors: int) -> bool:
        return self.factor_min <= num_factors <= self.factor_max

    def supports_budget(self, user_budget: int) -> bool:
        return user_budget >= self.budget_min

    def to_dict(self) -> Dict[str, object]:
        return {
            "rule_id": self.rule_id,
            "goal": self.goal,
            "design_type": self.design_type,
            "display_name": self.display_name,
            "factor_min": self.factor_min,
            "factor_max": self.factor_max,
            "budget_min": self.budget_min,
            "budget_max": self.budget_max,
            "engineering_reason": self.engineering_reason,
            "warnings": list(self.warnings),
            "next_actions": list(self.next_actions),
            "is_fallback_candidate": self.is_fallback_candidate,
        }
