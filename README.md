# Web DOE 公测候选基线

## 唯一公测入口

公测只使用：

`DOE Engineering Decision Support Tool V7.9.2.html`

该文件是当前唯一公测入口，包含数据输入、DOE 设计生成、实验执行与响应录入、统计分析、报告预览/打印与 CSV 模板下载、示例研究库以及中英文界面切换。

其余 `DOE_MVP_Demo_V7_*.html` 文件为历史演示版本，仅用于留档和回归参考，不作为公测入口，也不应与主版本混合部署。V7.9.2 当前为单文件前端；其中“专家推荐”功能可选调用同源的 FastAPI 后端，后端不可用时前端提供明确的本地 fallback。`context` 当前仅被接收并记录，尚未参与决策路由或推荐结果。

推荐启动方式：

```bash
python3 -m http.server 8000
```

然后打开：

`http://127.0.0.1:8000/DOE%20Engineering%20Decision%20Support%20Tool%20V7.9.2.html`

如需使用专家推荐 API，另开终端运行：

```bash
uvicorn doe_expert_engine.api.app:app --reload
```

当前前端通过同源 `POST /recommend-design` 调用该 API；本地静态使用不依赖后端。

### 公测 API 最小防护

- `GET /health` 返回 `{"status":"ok","service":"doe-expert-engine","version":"1.2"}`，不执行 DOE 计算，也不暴露路径或配置。
- `POST /recommend-design` 只接受 `application/json`，请求体上限 64 KiB；`goal` 长度 1–32，因素数 1–64，预算 1–100000，`context` 最多 20 个键且最多 8 KiB。未知字段会被拒绝。
- 计算接口按客户端地址做进程内限流：默认每 60 秒 60 次，超限返回 429 和 `Retry-After: 60`。健康检查不受该限流影响。该机制适合 5–20 名受控用户，不是分布式或企业级防护；多进程部署时每个进程各自计数。
- 默认不开放跨域。需要跨域时设置 `DOE_ALLOWED_ORIGINS` 为逗号分隔的明确 origin allowlist，不使用 `*`，也不信任任意 `X-Forwarded-For`。
- 错误响应统一为 `error.code`、`error.message`、`error.request_id`；5xx 不向客户端返回 traceback、绝对路径或内部异常细节。
- 服务端日志只记录 request id、方法、路径、状态码、耗时和错误类别，不记录完整请求体、响应数据、`context`、Authorization、Cookie 或用户导入数据。

该 API 仍是无状态计算：不保存或上传用户实验数据，也不调用外部服务。因此本轮小范围公测不要求完整账户鉴权；如果 API 被部署到公网，仍应保持同源部署或配置明确的 origin allowlist，并保留上述限流。

---

# DOE Expert Decision Engine v1.2

Modular Python backend for CSV-backed DOE design recommendation.

## Requirements

- Python 3.x
- Standard library for the decision engine
- FastAPI for the HTTP API layer

## Main API

```python
from doe_expert_engine.engine.decision_engine import recommend_design

result = recommend_design(
    goal="optimization",
    num_factors=6,
    user_budget=100,
    context={"response_type": "continuous"},
)
```

`context` is reserved for future use and is not used for routing. The response always includes `context_used: False`.

## Architecture

- `knowledge/backbone_v1.csv` stores all design rules.
- `engine/recommender.py` performs normal matching only.
- `engine/fallback_engine.py` handles fallback and expert-review responses.
- `engine/explanation_engine.py` builds engineering explanations from matched rules.
- `engine/backbone_loader.py` manages CSV loading, version metadata, and runtime reloads.
- `engine/decision_engine.py` orchestrates the modules and exposes the public API.
- `api/app.py` exposes the decision engine through FastAPI.
- `models/schemas.py` defines typed rule structures.

## Governance Metadata

Every decision response includes traceability and audit metadata:

```json
{
  "trace": {
    "rule_id": "R006",
    "rule_source": "backbone_v1.csv",
    "fallback_reason": null
  },
  "engine_version": "1.0",
  "backbone_version": "v1.0",
  "generator_version": "1.0",
  "log_record": {
    "timestamp": "2026-07-20T12:00:00+00:00",
    "input": {
      "goal": "optimization",
      "num_factors": 6,
      "user_budget": 25,
      "context": {
        "response_type": "continuous"
      }
    },
    "matched_rule": {},
    "fallback": false,
    "decision_status": "RECOMMENDED",
    "engine_version": "1.0",
    "backbone_version": "v1.0"
  }
}
```

Reload a CSV backbone with:

```python
from doe_expert_engine.engine.backbone_loader import BackboneLoader

BackboneLoader.reload("backbone_v1.csv")
```

## HTTP API

Run the app with an ASGI server such as `uvicorn`:

```bash
uvicorn doe_expert_engine.api.app:app --reload
```

### Endpoint

`POST /recommend-design`

### Request Format

```json
{
  "goal": "optimization",
  "num_factors": 6,
  "user_budget": 25,
  "context": {
    "response_type": "continuous"
  }
}
```

### Response Format

```json
{
  "design_type": "ccd",
  "display_name": "中心复合设计 CCD",
  "engineering_reason": "中等数量连续因子适合使用 CCD 建立二次响应面并寻找最优区间。 (建议实验次数 ≤ 30)",
  "decision_status": "RECOMMENDED",
  "fallback": false,
  "warnings": [],
  "next_actions": ["确认轴点可执行", "规划重复中心点"],
  "context_used": false,
  "trace": {
    "rule_id": "R006",
    "rule_source": "backbone_v1.csv",
    "fallback_reason": null
  },
  "engine_version": "1.0",
  "backbone_version": "v1.0",
  "generator_version": "1.0",
  "log_record": {
    "timestamp": "2026-07-20T12:00:00+00:00",
    "input": {
      "goal": "optimization",
      "num_factors": 6,
      "user_budget": 25,
      "context": {
        "response_type": "continuous"
      }
    },
    "matched_rule": {},
    "fallback": false,
    "decision_status": "RECOMMENDED",
    "engine_version": "1.0",
    "backbone_version": "v1.0"
  }
}
```

## Run Tests

```bash
python -m unittest discover
```
