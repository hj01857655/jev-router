#!/usr/bin/env node
/**
 * Jev Router — 智能工单路由器
 * 
 * 用 Jev 的三种原语并行判断每张工单：
 * - Choice: 路由到哪个团队
 * - Choice: 优先级 P0-P3
 * - Noul:   是否紧急
 * - Noul:   能否自动回复
 * - Score:  情绪负面程度 (0=正面, 1=极度负面)
 * - Score:  需要人工判断的复杂度 (0=简单, 1=极复杂)
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 配置 ───
const TYPESAFE_KEY = process.env.TYPESAFE_API_KEY;
if (!TYPESAFE_KEY) {
  console.error("请设置环境变量 TYPESAFE_API_KEY");
  process.exit(1);
}
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

// ─── Jev 调用 ───
async function jevDecide(state, questions) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TYPESAFE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, state, questions }),
  });
  if (!res.ok) {
    throw new Error(`Jev API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.answers;
}

// ─── 构建问题 ───
function buildQuestions(ticket) {
  return {
    // 路由：该派给哪个团队
    route: {
      type: "choice",
      instructions: "这张工单应该路由到哪个团队？",
      criteria: {
        billing: "付款、退款、发票、订阅、扣款相关",
        security: "账号被盗、密码问题、安全漏洞、可疑活动",
        engineering: "API bug、SDK 问题、系统错误、功能异常、404",
        product: "功能请求、UI 改进、产品建议、使用咨询",
        support: "一般使用问题、配置帮助、操作指引",
        sales: "合作咨询、企业版、定价、商务沟通",
      },
    },
    // 优先级
    priority: {
      type: "choice",
      instructions: "这张工单的优先级是什么？P0=立即处理，P3=有空再看",
      criteria: {
        P0: "资金损失、安全问题、生产环境故障、数据丢失风险",
        P1: "影响使用但可绕过，需要尽快处理",
        P2: "一般问题或建议，正常工作流处理",
        P3: "低优先级，不紧急",
      },
    },
    // 是否紧急（noul = 布尔判断 + 概率）
    urgent: {
      type: "noul",
      instructions: "工单表达了紧急性或要求立即处理",
    },
    // 能否自动回复
    autoReply: {
      type: "noul",
      instructions: "这个问题足够简单，可以用模板自动回复解决",
    },
    // 情绪负面程度
    sentiment: {
      type: "score",
      instructions: "工单的负面情绪程度",
      criteria: ["友好、正面、礼貌", "愤怒、辱骂、威胁投诉"],
    },
    // 复杂度
    complexity: {
      type: "score",
      instructions: "需要人工深入判断的复杂程度",
      criteria: ["一眼能答的简单问题", "需要调查分析、跨团队协调"],
    },
  };
}

// ─── 处理单张工单 ───
async function routeTicket(ticket) {
  const state = {
    id: ticket.id,
    subject: ticket.subject,
    body: ticket.body,
  };
  const questions = buildQuestions(ticket);
  const answers = await jevDecide(state, questions);

  return {
    id: ticket.id,
    subject: ticket.subject,
    route: answers.route.choice,
    routeConfidence: answers.route.confidence,
    priority: answers.priority.choice,
    urgent: answers.urgent.noul,
    autoReply: answers.autoReply.noul,
    sentiment: answers.sentiment.score,
    complexity: answers.complexity.score,
  };
}

// ─── 渲染 ───
const ROUTE_EMOJI = {
  billing: "💰", security: "🔒", engineering: "🔧",
  product: "✨", support: "💬", sales: "🤝",
};
const PRIORITY_COLOR = {
  P0: "\x1b[91m", P1: "\x1b[93m", P2: "\x1b[92m", P3: "\x1b[90m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function bar(value, width = 20) {
  const filled = Math.round(value * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function renderResult(r) {
  const emoji = ROUTE_EMOJI[r.route] || "❓";
  const pColor = PRIORITY_COLOR[r.priority] || "";
  const urgentTag = r.urgent > 0.7 ? `${BOLD}\x1b[91m⚠ 紧急${RESET}` : "";
  const autoTag = r.autoReply > 0.7 ? `${DIM}🤖 可自动回复${RESET}` : "";

  console.log(`\n${BOLD}┌─ ${r.id} ${r.subject}${RESET}`);
  console.log(`│  路由: ${emoji} ${r.route} ${DIM}(置信度 ${(r.routeConfidence * 100).toFixed(0)}%)${RESET}`);
  console.log(`│  优先级: ${pColor}${r.priority}${RESET}  ${urgentTag}  ${autoTag}`);
  console.log(`│  情绪:   ${bar(r.sentiment)} ${r.sentiment.toFixed(2)}`);
  console.log(`│  复杂度: ${bar(r.complexity)} ${r.complexity.toFixed(2)}`);
  console.log(`${BOLD}└${RESET}`);
}

function renderSummary(results) {
  console.log(`\n${BOLD}═══ 汇总 ═══${RESET}\n`);

  // 按团队统计
  const byRoute = {};
  for (const r of results) byRoute[r.route] = (byRoute[r.route] || 0) + 1;
  console.log(`${BOLD}团队分配:${RESET}`);
  for (const [team, count] of Object.entries(byRoute).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ROUTE_EMOJI[team]} ${team.padEnd(12)} ${count} 张`);
  }

  // 按优先级统计
  const byPriority = {};
  for (const r of results) byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
  console.log(`\n${BOLD}优先级分布:${RESET}`);
  for (const p of ["P0", "P1", "P2", "P3"]) {
    if (byPriority[p]) {
      console.log(`  ${PRIORITY_COLOR[p]}${p}${RESET} ${byPriority[p]} 张`);
    }
  }

  // 紧急工单
  const urgent = results.filter((r) => r.urgent > 0.7);
  console.log(`\n${BOLD}紧急工单: ${urgent.length} 张${RESET}`);
  for (const r of urgent) console.log(`  ⚠ ${r.id} ${r.subject}`);

  // 可自动回复
  const auto = results.filter((r) => r.autoReply > 0.7);
  console.log(`\n${BOLD}可自动回复: ${auto.length} 张${RESET}`);
  for (const r of auto) console.log(`  🤖 ${r.id} ${r.subject}`);

  // 平均情绪
  const avgSentiment = results.reduce((s, r) => s + r.sentiment, 0) / results.length;
  console.log(`\n${BOLD}平均负面情绪: ${avgSentiment.toFixed(2)}${RESET}`);
}

// ─── 主流程 ───
async function main() {
  const ticketsPath = join(__dirname, "tickets.json");
  const tickets = JSON.parse(readFileSync(ticketsPath, "utf8"));

  console.log(`${BOLD}╔══════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║   Jev Router — 智能工单路由器        ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════╝${RESET}`);
  console.log(`${DIM}处理 ${tickets.length} 张工单，每张并行 6 个判断...${RESET}`);

  const start = Date.now();

  // 并行处理所有工单
  const results = await Promise.all(tickets.map(routeTicket));

  const elapsed = Date.now() - start;

  // 渲染每张工单
  for (const r of results) renderResult(r);

  // 汇总
  renderSummary(results);

  console.log(`\n${DIM}耗时 ${elapsed}ms | 平均 ${(elapsed / tickets.length).toFixed(0)}ms/张 | 6 个判断/张${RESET}`);
  console.log(`${DIM}总判断次数: ${tickets.length * 6} | Jev 调用次数: ${tickets.length} (并行)${RESET}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
