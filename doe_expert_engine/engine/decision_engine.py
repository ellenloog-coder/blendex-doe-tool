"""Public API orchestration for the DOE expert decision engine."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Optional

from doe_expert_engine.engine.backbone_loader import BackboneLoader
from doe_expert_engine.engine.explanation_engine import build_explanation
from doe_expert_engine.engine.fallback_engine import build_fallback_response
from doe_expert_engine.engine.recommender import match_rule


ENGINE_VERSION = "1.0"
GENERATOR_VERSION = "1.0"


def recommend_design(
    goal: str,
    num_factors: int,
    user_budget: int,
    context: Optional[dict] = None,
) -> Dict[str, object]:
    """Recommend a DOE design using only CSV-backed rule matching."""

    input_record = {
        "goal": goal,
        "num_factors": num_factors,
        "user_budget": user_budget,
        "context": context,
    }
    rules = BackboneLoader.rules()
    matched_rule = match_rule(goal, num_factors, user_budget, rules)
    if matched_rule is None:
        response = build_fallback_response(goal, num_factors, user_budget, rules)
        return _with_governance(response, input_record)

    explanation = build_explanation(matched_rule)
    response = {
        "design_type": matched_rule.design_type,
        "display_name": matched_rule.display_name,
        "engineering_reason": explanation["engineering_reason"],
        "matched_rule": matched_rule.to_dict(),
        "decision_status": "RECOMMENDED",
        "fallback": False,
        "warnings": explanation["warnings"],
        "next_actions": explanation["next_actions"],
        "context_used": False,
    }
    return _with_governance(response, input_record)


def _with_governance(response: Dict[str, object], input_record: Dict[str, object]) -> Dict[str, object]:
    matched_rule = response.get("matched_rule")
    rule_id = ""
    matched_rule_record: Dict[str, object] = {}
    if isinstance(matched_rule, dict):
        rule_id = str(matched_rule.get("rule_id", ""))
        matched_rule_record = dict(matched_rule)

    backbone_version = BackboneLoader.backbone_version()
    response["trace"] = {
        "rule_id": rule_id,
        "rule_source": BackboneLoader.rule_source(),
        "fallback_reason": response.pop("fallback_reason", None),
    }
    response["engine_version"] = ENGINE_VERSION
    response["backbone_version"] = backbone_version
    response["generator_version"] = GENERATOR_VERSION
    response["log_record"] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "input": dict(input_record),
        "matched_rule": matched_rule_record,
        "fallback": response["fallback"],
        "decision_status": response["decision_status"],
        "engine_version": ENGINE_VERSION,
        "backbone_version": backbone_version,
    }
    return response
