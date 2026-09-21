/**
 * 输出渲染 — pretty / json / jsonl
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[91m";
const YELLOW = "\x1b[93m";
const GREEN = "\x1b[92m";
const GRAY = "\x1b[90m";

const ROUTE_EMOJI = {
  billing: "💰", security: "🔒", engineering: "🔧",
  product: "✨", support: "💬", sales: "🤝",
};
const PRIORITY_COLOR = { P0: RED, P1: YELLOW, P2: GREEN, P3: GRAY };

function bar(value, width = 20) {
  const filled = Math.round(value * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/** 单条 pretty 输出 */
export function renderTicket(r) {
  if (r.error) {
    console.log(`\n${RED}✖ ${r.id || "?"} ${r.subject}${RESET} — ${r.error}`);
    return;
  }
  const emoji = ROUTE_EMOJI[r.route] || "❓";
  const pColor = PRIORITY_COLOR[r.priority] || "";
  const urgentTag = r.urgent > 0.7 ? `${BOLD}${RED}⚠ 紧急${RESET}` : "";
  const autoTag = r.autoReply > 0.7 ? `${DIM}🤖 可自动回复${RESET}` : "";

  console.log(`\n${BOLD}┌─ ${r.id || "?"} ${r.subject}${RESET}`);
  console.log(`│  路由: ${emoji} ${r.route} ${DIM}(置信度 ${(r.routeConfidence * 100).toFixed(0)}%)${RESET}`);
  console.log(`│  优先级: ${pColor}${r.priority}${RESET}  ${urgentTag}  ${autoTag}`);
  console.log(`│  情绪:   ${bar(r.sentiment)} ${r.sentiment.toFixed(2)}`);
  console.log(`│  复杂度: ${bar(r.complexity)} ${r.complexity.toFixed(2)}`);
  console.log(`${BOLD}└${RESET}`);
}

/** 批量 pretty 输出 + 汇总 */
export function renderBatch(results, elapsedMs) {
  for (const r of results) renderTicket(r);
  renderSummary(results);
  const ok = results.filter((r) => !r.error).length;
  console.log(`\n${DIM}耗时 ${elapsedMs}ms | ${ok}/${results.length} 成功 | 6 判断/张${RESET}`);
}

function renderSummary(results) {
  const ok = results.filter((r) => !r.error);
  console.log(`\n${BOLD}═══ 汇总 ═══${RESET}\n`);

  const byRoute = {};
  for (const r of ok) byRoute[r.route] = (byRoute[r.route] || 0) + 1;
  console.log(`${BOLD}团队分配:${RESET}`);
  for (const [team, count] of Object.entries(byRoute).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ROUTE_EMOJI[team] || "❓"} ${team.padEnd(12)} ${count} 张`);
  }

  const byPriority = {};
  for (const r of ok) byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
  console.log(`\n${BOLD}优先级分布:${RESET}`);
  for (const p of ["P0", "P1", "P2", "P3"]) {
    if (byPriority[p]) console.log(`  ${PRIORITY_COLOR[p]}${p}${RESET} ${byPriority[p]} 张`);
  }

  const urgent = ok.filter((r) => r.urgent > 0.7);
  console.log(`\n${BOLD}紧急: ${urgent.length} 张${RESET}`);
  for (const r of urgent) console.log(`  ⚠ ${r.id || "?"} ${r.subject}`);

  const auto = ok.filter((r) => r.autoReply > 0.7);
  console.log(`\n${BOLD}可自动回复: ${auto.length} 张${RESET}`);
  for (const r of auto) console.log(`  🤖 ${r.id || "?"} ${r.subject}`);

  if (ok.length > 0) {
    const avgSent = ok.reduce((s, r) => s + r.sentiment, 0) / ok.length;
    console.log(`\n${BOLD}平均负面情绪: ${avgSent.toFixed(2)}${RESET}`);
  }
}

/** JSON 输出（整个数组一个 JSON） */
export function renderJSON(results) {
  console.log(JSON.stringify(results, null, 2));
}

/** JSONL 输出（每行一个 JSON） */
export function renderJSONL(results) {
  for (const r of results) console.log(JSON.stringify(r));
}
