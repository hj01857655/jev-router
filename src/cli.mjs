#!/usr/bin/env node
/**
 * Jev Router CLI
 *
 * 用法:
 *   node index.mjs route --subject "标题" --body "内容"
 *   echo '{"subject":"...","body":"..."}' | node index.mjs route
 *   node index.mjs batch --file tickets.json
 *   cat tickets.jsonl | node index.mjs batch
 *   node index.mjs serve --port 3456
 *
 * 选项:
 *   --format pretty|json|jsonl   输出格式 (默认 pretty)
 *   --concurrency N              并发数 (默认 10)
 *   --port N                     服务端口 (默认 3456)
 *   --file PATH                  从文件读取
 */

import { readFileSync } from "node:fs";
import { createClient, routeTicket, routeBatch } from "./router.mjs";
import { renderTicket, renderBatch, renderJSON, renderJSONL } from "./render.mjs";
import { startServer } from "./server.mjs";

const API_KEY = process.env.TYPESAFE_API_KEY;
if (!API_KEY) {
  console.error("请设置环境变量 TYPESAFE_API_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const cmd = args[0] || "help";

// ─── 参数解析 ───
function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
      flags[key] = val;
    }
  }
  return flags;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function getFormat(flags) {
  return flags.format || "pretty";
}

function output(results, format, elapsed) {
  if (format === "json") renderJSON(results);
  else if (format === "jsonl") renderJSONL(results);
  else renderBatch(results, elapsed);
}

// ─── 命令 ───
async function main() {
  const flags = parseFlags(args.slice(1));
  const client = createClient(API_KEY);
  const format = getFormat(flags);

  switch (cmd) {
    case "route": {
      let ticket;
      if (flags.subject) {
        ticket = { subject: flags.subject, body: flags.body || "" };
      } else {
        const stdin = await readStdin();
        if (!stdin) {
          console.error("用法: node index.mjs route --subject \"标题\" --body \"内容\"");
          console.error("  或: echo '{\"subject\":\"...\"}' | node index.mjs route");
          process.exit(1);
        }
        ticket = JSON.parse(stdin);
      }
      const start = Date.now();
      const result = await routeTicket(ticket, client);
      const elapsed = Date.now() - start;
      if (format === "json") renderJSON([result]);
      else if (format === "jsonl") renderJSONL([result]);
      else renderTicket(result);
      break;
    }

    case "batch": {
      let tickets;
      if (flags.file) {
        const raw = readFileSync(flags.file, "utf8").trim();
        if (flags.file.endsWith(".jsonl")) {
          tickets = raw.split("\n").filter(Boolean).map(JSON.parse);
        } else {
          tickets = JSON.parse(raw);
        }
      } else {
        const stdin = await readStdin();
        if (!stdin) {
          console.error("用法: node index.mjs batch --file tickets.json");
          console.error("  或: cat tickets.jsonl | node index.mjs batch");
          process.exit(1);
        }
        if (stdin.startsWith("[")) {
          tickets = JSON.parse(stdin);
        } else {
          tickets = stdin.split("\n").filter(Boolean).map(JSON.parse);
        }
      }
      const concurrency = parseInt(flags.concurrency) || 10;
      const start = Date.now();
      const results = await routeBatch(tickets, client, concurrency);
      const elapsed = Date.now() - start;
      output(results, format, elapsed);
      break;
    }

    case "serve": {
      const port = parseInt(flags.port) || 3456;
      const concurrency = parseInt(flags.concurrency) || 10;
      startServer(API_KEY, { port, concurrency });
      break;
    }

    default: {
      console.log(`Jev Router — 智能工单路由器

用法:
  node index.mjs route --subject "标题" --body "内容"
  echo '{"subject":"...","body":"..."}' | node index.mjs route
  node index.mjs batch --file tickets.json
  cat tickets.jsonl | node index.mjs batch
  node index.mjs serve --port 3456

选项:
  --format pretty|json|jsonl   输出格式 (默认 pretty)
  --concurrency N              并发数 (默认 10)
  --port N                     服务端口 (默认 3456)
  --file PATH                  从文件读取

环境变量:
  TYPESAFE_API_KEY             TypeSafe API Key (必需)`);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
