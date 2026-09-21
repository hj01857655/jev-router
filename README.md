# Jev Router — 智能工单路由器

用 [Jev](https://typesafe.ai) 的结构化决策 API 并行处理客服工单：一次调用同时判断路由、优先级、紧急度、可自动回复性、情绪分、复杂度。

## 快速开始

```bash
# 设置 TypeSafe API Key（从 https://typesafe.ai 获取）
export TYPESAFE_API_KEY="apikey_xxx"

# 运行
node index.mjs
```

## 工作原理

每张工单只调一次 Jev API，并行回答 6 个独立判断：

| 判断 | Jev 原语 | 返回值 |
|---|---|---|
| 路由到哪个团队 | `choice` | billing / security / engineering / product / support / sales |
| 优先级 | `choice` | P0 / P1 / P2 / P3 |
| 是否紧急 | `noul` | 0-1 概率 |
| 能否自动回复 | `noul` | 0-1 概率 |
| 情绪负面程度 | `score` | 0=友好 1=愤怒 |
| 处理复杂度 | `score` | 0=简单 1=复杂 |

10 张工单 × 6 个判断 = 60 个结构化决策，10 次 API 调用（全并行），~1.2 秒完成。

## 自定义

编辑 `tickets.json` 替换为你的工单数据，或修改 `index.mjs` 中的 `buildQuestions()` 调整判断维度。

## 费用

Jev 定价 $0.0578/百万输入 token，输出免费。处理 10 张工单约 $0.002。
