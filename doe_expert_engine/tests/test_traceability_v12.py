"""Traceability and audit tests for DOE Expert Decision Engine v1.2."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
import unittest

from doe_expert_engine.engine.decision_engine import recommend_design


class TraceabilityV12Tests(unittest.TestCase):
    def test_tc_a01_same_input_has_identical_decision_result(self) -> None:
        first = recommend_design("optimization", 6, 25, context={"response_type": "continuous"})
        second = recommend_design("optimization", 6, 25, context={"response_type": "continuous"})

        self.assertEqual(_without_runtime_timestamp(first), _without_runtime_timestamp(second))

    def test_tc_a02_trace_rule_id_exists(self) -> None:
        result = recommend_design("optimization", 6, 25)

        self.assertEqual(result["trace"]["rule_id"], "R006")
        self.assertEqual(result["trace"]["rule_source"], "backbone_v1.csv")

    def test_tc_a03_fallback_reason_correct(self) -> None:
        result = recommend_design("optimization", 6, 10)

        self.assertEqual(result["decision_status"], "FALLBACK_RECOMMENDED")
        self.assertEqual(result["trace"]["fallback_reason"], "BUDGET_INSUFFICIENT")

    def test_tc_a04_version_fields_exist(self) -> None:
        result = recommend_design("screening", 3, 10)

        self.assertEqual(result["engine_version"], "1.0")
        self.assertEqual(result["backbone_version"], "v1.0")
        self.assertEqual(result["generator_version"], "1.0")

    def test_tc_a05_log_timestamp_exists_and_is_iso8601(self) -> None:
        result = recommend_design("screening", 3, 10)
        timestamp = result["log_record"]["timestamp"]

        self.assertTrue(timestamp)
        datetime.fromisoformat(timestamp)


def _without_runtime_timestamp(result: dict) -> dict:
    normalized = deepcopy(result)
    normalized["log_record"]["timestamp"] = "<runtime>"
    return normalized


if __name__ == "__main__":
    unittest.main()
