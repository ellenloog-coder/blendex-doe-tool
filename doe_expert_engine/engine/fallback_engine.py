"""Fallback handling for cases where normal matching cannot recommend a rule."""

from __future__ import annotations

from typing import Dict, Iterable, Optional

from doe_expert_engine.engine.explanation_engine import build_explanation
from doe_expert_engine.models.schemas import DesignRule


def build_fallback_response(
    goal: str,
    num_factors: int,
    user_budget: int,
    rules: Iterable[DesignRule],
) -> Dict[str, object]:
    available_rules = list(rules)
    goal_exists = _has_goal(goal, available_rules)
    factor_exists = _has_factor_match(goal, num_factors, available_rules) if goal_exists else False
    normalized_goal = goal.strip().lower()
    goal_is_fallback_family = any(
        rule.goal.lower() == normalized_goal and rule.is_fallback_candidate
        for rule in available_rules
    )

    if not goal_exists or factor_exists or not goal_is_fallback_family:
        fallback_rule = _select_screening_fallback(num_factors, user_budget, available_rules)
        if fallback_rule is not None:
            return _fallback_payload(fallback_rule, _fallback_reason(goal_exists, factor_exists))

    return _expert_required_payload()


def _select_screening_fallback(
    num_factors: int,
    user_budget: int,
    rules: Iterable[DesignRule],
) -> Optional[DesignRule]:
    budget_fit = _match_fallback_rule(num_factors, user_budget, rules, require_budget=True)
    if budget_fit is not None:
        return budget_fit
    return _match_fallback_rule(num_factors, user_budget, rules, require_budget=False)


def _has_goal(goal: str, rules: Iterable[DesignRule]) -> bool:
    normalized_goal = goal.strip().lower()
    return any(rule.goal.lower() == normalized_goal for rule in rules)


def _has_factor_match(goal: str, num_factors: int, rules: Iterable[DesignRule]) -> bool:
    normalized_goal = goal.strip().lower()
    return any(
        rule.goal.lower() == normalized_goal and rule.supports_factor_count(num_factors)
        for rule in rules
    )


def _match_fallback_rule(
    num_factors: int,
    user_budget: int,
    rules: Iterable[DesignRule],
    require_budget: bool,
) -> Optional[DesignRule]:
    candidates = [
        rule
        for rule in rules
        if rule.is_fallback_candidate
        and rule.supports_factor_count(num_factors)
        and (not require_budget or rule.supports_budget(user_budget))
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


def _fallback_reason(goal_exists: bool, factor_exists: bool) -> str:
    if not goal_exists:
        return "GOAL_UNAVAILABLE"
    if factor_exists:
        return "BUDGET_INSUFFICIENT"
    return "GOAL_FACTOR_RANGE_UNAVAILABLE"


def _fallback_payload(matched_rule: DesignRule, fallback_reason: str) -> Dict[str, object]:
    explanation = build_explanation(matched_rule)
    return {
        "design_type": matched_rule.design_type,
        "display_name": f"{matched_rule.display_name}（迫降）",
        "engineering_reason": explanation["engineering_reason"],
        "matched_rule": matched_rule.to_dict(),
        "decision_status": "FALLBACK_RECOMMENDED",
        "fallback": True,
        "warnings": explanation["warnings"],
        "next_actions": explanation["next_actions"],
        "context_used": False,
        "fallback_reason": fallback_reason,
    }


def _expert_required_payload() -> Dict[str, object]:
    return {
        "design_type": "EXPERT_REQUIRED",
        "display_name": "需要统计专家介入",
        "engineering_reason": "当前 CSV 规则无法覆盖该目标、因子数量与预算组合。",
        "matched_rule": None,
        "decision_status": "EXPERT_REVIEW_REQUIRED",
        "fallback": False,
        "warnings": [],
        "next_actions": ["请统计专家评估实验目标、因子范围与可行实验次数。"],
        "context_used": False,
    }
