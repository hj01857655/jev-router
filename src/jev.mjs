/**
 * Jev API 客户端 — 重试、超时、错误处理
 */

const DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";
const MAX_RETRIES = 3;
const TIMEOUT_MS = 15_000;

export class JevClient {
  /**
   * @param {string} apiKey - TypeSafe API Key (apikey_...)
   * @param {{ endpoint?: string, model?: string }} [opts]
   */
  constructor(apiKey, opts = {}) {
    if (!apiKey) throw new Error("TYPESAFE_API_KEY 未设置");
    this.apiKey = apiKey;
    this.endpoint = opts.endpoint || DEFAULT_ENDPOINT;
    this.model = opts.model || DEFAULT_MODEL;
  }

  /**
   * 调 Jev decisions 端点，带重试退避
   * @param {Record<string, unknown>} state
   * @param {Record<string, unknown>} questions
   * @returns {Promise<Record<string, unknown>>} answers
   */
  async decide(state, questions) {
    const body = JSON.stringify({
      model: this.model,
      state,
      questions,
    });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json();
          return data.answers;
        }

        // 429 / 5xx → 重试
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const delay = Math.min(1000 * 2 ** attempt, 8000);
          await sleep(delay);
          continue;
        }

        // 4xx 不重试
        const text = await res.text();
        throw new JevError(`Jev API ${res.status}: ${text}`, res.status);
      } catch (err) {
        if (err instanceof JevError) throw err;
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new JevError(`Jev 请求失败: ${err.message}`, 0);
      }
    }

    throw new JevError("Jev 重试次数耗尽", 0);
  }
}

export class JevError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "JevError";
    this.status = status;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
