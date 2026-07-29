"""API tests for DOE Expert Decision Engine v1.1."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from doe_expert_engine.api.app import _rate_buckets, _rate_lock, app


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        with _rate_lock:
            _rate_buckets.clear()
        self.client = TestClient(app)

    def test_valid_recommendation_request_returns_200(self) -> None:
        response = self.client.post(
            "/recommend-design",
            json={
                "goal": "optimization",
                "num_factors": 6,
                "user_budget": 25,
                "context": {"response_type": "continuous"},
            },
        )

        self.assertEqual(response.status_code, 200)

    def test_screening_request_returns_correct_design(self) -> None:
        response = self.client.post(
            "/recommend-design",
            json={
                "goal": "screening",
                "num_factors": 3,
                "user_budget": 10,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["design_type"], "full_factorial")

    def test_fallback_request_returns_fallback_status(self) -> None:
        response = self.client.post(
            "/recommend-design",
            json={
                "goal": "optimization",
                "num_factors": 6,
                "user_budget": 10,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["decision_status"], "FALLBACK_RECOMMENDED")

    def test_context_is_accepted(self) -> None:
        response = self.client.post(
            "/recommend-design",
            json={
                "goal": "optimization",
                "num_factors": 6,
                "user_budget": 25,
                "context": {"response_type": "continuous"},
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["context_used"])

    def test_health_is_lightweight_and_not_rate_limited(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertEqual(response.json()["service"], "doe-expert-engine")
        self.assertIn("version", response.json())

    def test_invalid_input_has_stable_error_shape(self) -> None:
        response = self.client.post("/recommend-design", json={"goal": "", "num_factors": 0, "user_budget": -1})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(set(response.json()), {"error"})
        self.assertEqual(set(response.json()["error"]), {"code", "message", "request_id"})
        self.assertEqual(response.json()["error"]["code"], "validation_error")

    def test_unknown_fields_are_rejected(self) -> None:
        response = self.client.post("/recommend-design", json={"goal": "optimization", "num_factors": 6, "user_budget": 25, "unexpected": True})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "validation_error")

    def test_content_type_is_rejected(self) -> None:
        response = self.client.post("/recommend-design", data="{}", headers={"content-type": "text/plain"})
        self.assertEqual(response.status_code, 415)
        self.assertEqual(response.json()["error"]["code"], "unsupported_content_type")

    def test_unknown_origin_is_not_allowed(self) -> None:
        response = self.client.post(
            "/recommend-design",
            json={"goal": "optimization", "num_factors": 6, "user_budget": 25},
            headers={"origin": "https://unknown.example"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_invalid_json_has_stable_error_shape(self) -> None:
        response = self.client.post(
            "/recommend-design",
            content="{invalid",
            headers={"content-type": "application/json"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "validation_error")

    def test_context_limits_are_rejected(self) -> None:
        response = self.client.post("/recommend-design", json={"goal": "optimization", "num_factors": 6, "user_budget": 25, "context": {str(i): i for i in range(21)}})
        self.assertEqual(response.status_code, 422)

    def test_rate_limit_returns_429_and_health_remains_available(self) -> None:
        with patch("doe_expert_engine.api.app.RATE_LIMIT_REQUESTS", 1):
            first = self.client.post("/recommend-design", json={"goal": "optimization", "num_factors": 6, "user_budget": 25})
            second = self.client.post("/recommend-design", json={"goal": "optimization", "num_factors": 6, "user_budget": 25})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.json()["error"]["code"], "rate_limited")
        self.assertEqual(second.headers["Retry-After"], "60")
        self.assertEqual(self.client.get("/health").status_code, 200)


if __name__ == "__main__":
    unittest.main()
