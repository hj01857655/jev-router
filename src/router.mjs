/**
 * 工单路由逻辑 — 问题构建 + 结果映射 + 批量并发
 */

import { JevClient } from "./jev.mjs";

// ─── 问题模板 ───
export function buildQuestions(ticket) {
  return {
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
    urgent: {
      type: "noul",
      instructions: "工单表达了紧急性或要求立即处理",
    },
    autoReply: {
      type: "noul",
      instructions: "这个问题足够简单，可以用模板自动回复解决",
    },
    sentiment: {
      type: "score",
      instructions: "工单的负面情绪程度",
      criteria: ["友好、正面、礼貌", "愤怒、辱骂、威胁投诉"],
    },
    complexity: {
      type: "score",
      instructions: "需要人工深入判断的复杂程度",
      criteria: ["一眼能答的简单问题", "需要调查分析、跨团队协调"],
    },
  };
}

// ─── 结果映射 ───
export function mapResult(ticket, answers) {
  return {
    id: ticket.id || null,
    subject: ticket.subject || "",
    route: answers.route?.choice ?? "unknown",
    routeConfidence: answers.route?.confidence ?? 0,
    priority: answers.priority?.choice ?? "P3",
    urgent: answers.urgent?.noul ?? 0,
    autoReply: answers.autoReply?.noul ?? 0,
    sentiment: answers.sentiment?.score ?? 0,
    complexity: answers.complexity?.score ?? 0,
  };
}

// ─── 单条路由 ───
export async function routeTicket(ticket, client) {
  const state = {
    id: ticket.id,
    subject: ticket.subject,
    body: ticket.body,
  };
  const answers = await client.decide(state, buildQuestions(ticket));
  return mapResult(ticket, answers);
}

// ─── 批量路由（并发控制）───
export async function routeBatch(tickets, client, concurrency = 10) {
  const results = new Array(tickets.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tickets.length) break;
      try {
        results[i] = await routeTicket(tickets[i], client);
      } catch (err) {
        results[i] = {
          id: tickets[i].id || null,
          subject: tickets[i].subject || "",
          error: err.message,
        };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tickets.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── 工厂 ───
export function createClient(apiKey, opts) {
  return new JevClient(apiKey, opts);
}
