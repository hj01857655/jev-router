/**
 * HTTP API 服务模式 — 零依赖，用 node:http
 */

import { routeTicket, routeBatch, createClient } from "./router.mjs";
import { createServer } from "node:http";

/**
 * @param {string} apiKey
 * @param {{ port?: number, concurrency?: number }} [opts]
 */
export function startServer(apiKey, opts = {}) {
  const port = opts.port || 3456;
  const concurrency = opts.concurrency || 10;
  const client = createClient(apiKey);

  const srv = createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${port}`);

    // GET /health
    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, { status: "ok", model: client.model });
      return;
    }

    // POST /route — 单条
    if (req.method === "POST" && url.pathname === "/route") {
      try {
        const ticket = await readBody(req);
        const result = await routeTicket(ticket, client);
        json(res, 200, result);
      } catch (err) {
        json(res, err.status || 500, { error: err.message });
      }
      return;
    }

    // POST /batch — 批量
    if (req.method === "POST" && url.pathname === "/batch") {
      try {
        const tickets = await readBody(req);
        if (!Array.isArray(tickets)) {
          json(res, 400, { error: "batch 端点需要数组" });
          return;
        }
        const start = Date.now();
        const results = await routeBatch(tickets, client, concurrency);
        const elapsed = Date.now() - start;
        json(res, 200, { results, elapsed, count: results.length });
      } catch (err) {
        json(res, err.status || 500, { error: err.message });
      }
      return;
    }

    json(res, 404, { error: "Not Found" });
  });

  srv.listen(port, () => {
    console.log(`Jev Router API → http://localhost:${port}`);
    console.log(`  POST /route   单条工单路由`);
    console.log(`  POST /batch   批量工单路由`);
    console.log(`  GET  /health  健康检查`);
  });

  return srv;
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
