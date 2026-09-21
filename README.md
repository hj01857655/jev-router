# Jev Router — 智能工单路由器

用 [Jev](https://typesafe.ai) 的结构化决策 API 并行处理客服工单：一次调用同时判断路由、优先级、紧急度、可自动回复性、情绪分、复杂度。

## 安装

```bash
git clone https://github.com/hj01857655/jev-router.git
cd jev-router
```

零依赖，只需要 Node.js 18+。

## 配置

```bash
export TYPESAFE_API_KEY="apikey_xxx"  # 从 https://typesafe.ai 获取
```

## 用法

### 单条工单

```bash
# 命令行参数
node index.mjs route --subject "我要退款" --body "订单 #123 扣了两次钱"

# stdin 管道
echo '{"subject":"密码忘了","body":"重置邮件收不到"}' | node index.mjs route
```

### 批量处理

```bash
# 从 JSON 文件
node index.mjs batch --file tickets.json

# 从 JSONL 文件
node index.mjs batch --file tickets.jsonl

# stdin 管道
cat tickets.jsonl | node index.mjs batch
```

### HTTP API 服务

```bash
node index.mjs serve --port 3456
```

```bash
# 单条
curl -X POST http://localhost:3456/route \
  -H "Content-Type: application/json" \
  -d '{"subject":"紧急退款","body":"扣了三次款！立刻退钱！"}'

# 批量
curl -X POST http://localhost:3456/batch \
  -H "Content-Type: application/json" \
  -d '[{"subject":"...","body":"..."}, ...]'

# 健康检查
curl http://localhost:3456/health
```

### 输出格式

```bash
node index.mjs batch --file tickets.json --format pretty  # 终端渲染（默认）
node index.mjs batch --file tickets.json --format json    # JSON 数组
node index.mjs batch --file tickets.json --format jsonl   # JSON Lines
```

### 并发控制

```bash
node index.mjs batch --file big.json --concurrency 5  # 默认 10
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

## 项目结构

```
src/
├── jev.mjs      # Jev API 客户端（重试、超时、错误处理）
├── router.mjs   # 问题构建 + 结果映射 + 批量并发
├── render.mjs   # 终端渲染 + JSON/JSONL 输出
├── server.mjs   # HTTP API 服务模式
└── cli.mjs      # CLI 入口 + stdin 管道
```

## 费用

Jev 定价 $0.0578/百万输入 token，输出免费。处理 10 张工单约 $0.002。
