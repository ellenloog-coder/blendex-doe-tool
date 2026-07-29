"""Regression tests for DOE Expert Decision Engine v1.0."""

from __future__ import annotations

import unittest

from doe_expert_engine.engine.decision_engine import recommend_design


class BackboneV1Tests(unittest.TestCase):
    def assert_recommended(self, goal: str, factors: int, budget: int, design_type: str) -> None:
        result = recommend_design(goal, factors, budget)
        self.assertEqual(result["decision_status"], "RECOMMENDED")
        self.assertFalse(result["fallback"])
        self.assertEqual(result["design_type"], design_type)

    def test_tc01_screening_3_10(self) -> None:
        self.assert_recommended("screening", 3, 10, "full_factorial")

    def test_tc02_screening_6_18(self) -> None:
        self.assert_recommended("screening", 6, 18, "frac_factorial_resV")

    def test_tc03_screening_9_22(self) -> None:
        self.assert_recommended("screening", 9, 22, "plackett_burman")

    def test_tc04_screening_15_30(self) -> None:
        self.assert_recommended("screening", 15, 30, "plackett_burman_large")

    def test_tc05_optimization_3_15(self) -> None:
        self.assert_recommended("optimization", 3, 15, "full_factorial_ccd")

    def test_tc06_optimization_6_25(self) -> None:
        self.assert_recommended("optimization", 6, 25, "ccd")

    def test_tc07_optimization_6_100(self) -> None:
        self.assert_recommended("optimization", 6, 100, "ccd")

    def test_tc08_optimization_10_40(self) -> None:
        self.assert_recommended("optimization", 10, 40, "box_behnken")

    def test_tc09_robustness_3_15(self) -> None:
        self.assert_recommended("robustness", 3, 15, "taguchi_oa")

    def test_tc10_robustness_9_30(self) -> None:
        self.assert_recommended("robustness", 9, 30, "taguchi_large")

    def test_tc11_optimization_6_10_fallback(self) -> None:
        result = recommend_design("optimization", 6, 10)
        self.assertEqual(result["decision_status"], "FALLBACK_RECOMMENDED")
        self.assertTrue(result["fallback"])
        self.assertIn("迫降", result["display_name"])

    def test_tc12_optimization_18_50_forced_screening(self) -> None:
        result = recommend_design("optimization", 18, 50)
        self.assertEqual(result["decision_status"], "FALLBACK_RECOMMENDED")
        self.assertEqual(result["design_type"], "plackett_burman_large")
        self.assertIn("迫降", result["display_name"])

    def test_tc13_screening_25_50_expert_required(self) -> None:
        result = recommend_design("screening", 25, 50)
        self.assertEqual(result["decision_status"], "EXPERT_REVIEW_REQUIRED")
        self.assertEqual(result["design_type"], "EXPERT_REQUIRED")

    def test_tc14_reason_includes_budget_suffix(self) -> None:
        result = recommend_design("optimization", 6, 25)
        self.assertIn("(建议实验次数 ≤ 30)", result["engineering_reason"])

    def test_tc15_context_reserved_not_used(self) -> None:
        result = recommend_design("optimization", 6, 25, context={"response_type": "continuous"})
        self.assertEqual(result["decision_status"], "RECOMMENDED")
        self.assertFalse(result["context_used"])


if __name__ == "__main__":
    unittest.main()
