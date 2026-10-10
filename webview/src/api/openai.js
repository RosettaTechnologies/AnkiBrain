/**
 * Preset OpenAI-compatible endpoints offered by the Settings screen. Each is a
 * base URL that the OpenAI SDK appends `/chat/completions` and `/models` to.
 *
 * Every route here answered `/models` with 200/401/403 (a missing route returns
 * 404), so a preset can always pass "Test connection". Providers that do not
 * expose `/models` (Perplexity) are deliberately absent - the model picker is
 * fed from that route.
 *
 * No preset needs custom headers: AnkiBrain always sends its own User-Agent and
 * the install's stable session id as x-opencode-session (which opencode Go
 * requires and other gateways ignore). The "Extra headers" field is only for
 * endpoints that need something else.
 */

export const OPENAI_BASE_URL_PRESETS = [
  // ── Popular ──────────────────────────────────────────────────────────────
  { label: "OpenAI", url: "https://api.openai.com/v1", group: "Popular" },
  { label: "OpenRouter", url: "https://openrouter.ai/api/v1", group: "Popular" },
  { label: "OpenCode Zen", url: "https://opencode.ai/zen/v1", group: "Popular" },
  { label: "OpenCode Go", url: "https://opencode.ai/zen/go/v1", group: "Popular" },
  { label: "Groq", url: "https://api.groq.com/openai/v1", group: "Popular" },
  { label: "Together AI", url: "https://api.together.xyz/v1", group: "Popular" },
  { label: "Fireworks AI", url: "https://api.fireworks.ai/inference/v1", group: "Popular" },
  { label: "DeepInfra", url: "https://api.deepinfra.com/v1/openai", group: "Popular" },
  { label: "Mistral", url: "https://api.mistral.ai/v1", group: "Popular" },
  { label: "DeepSeek", url: "https://api.deepseek.com/v1", group: "Popular" },
  { label: "xAI (Grok)", url: "https://api.x.ai/v1", group: "Popular" },
  { label: "Google Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai", group: "Popular" },
  { label: "Hugging Face Router", url: "https://router.huggingface.co/v1", group: "Popular" },
  { label: "GitHub Models", url: "https://models.github.ai/inference", group: "Popular" },

  // ── Model providers ──────────────────────────────────────────────────────
  { label: "Moonshot (Kimi)", url: "https://api.moonshot.ai/v1", group: "Model providers" },
  { label: "Moonshot (China)", url: "https://api.moonshot.cn/v1", group: "Model providers" },
  { label: "Z.ai (GLM)", url: "https://api.z.ai/api/paas/v4", group: "Model providers" },
  { label: "Zhipu (China)", url: "https://open.bigmodel.cn/api/paas/v4", group: "Model providers" },
  { label: "Qwen / DashScope", url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", group: "Model providers" },
  { label: "Qwen / DashScope (China)", url: "https://dashscope.aliyuncs.com/compatible-mode/v1", group: "Model providers" },
  { label: "MiniMax", url: "https://api.minimax.io/v1", group: "Model providers" },
  { label: "MiniMax (China)", url: "https://api.minimaxi.chat/v1", group: "Model providers" },
  { label: "Upstage (Solar)", url: "https://api.upstage.ai/v1/solar", group: "Model providers" },
  { label: "Inception Labs", url: "https://api.inceptionlabs.ai/v1", group: "Model providers" },
  { label: "Cohere (compatibility)", url: "https://api.cohere.ai/compatibility/v1", group: "Model providers" },

  // ── Inference clouds ─────────────────────────────────────────────────────
  { label: "Cerebras", url: "https://api.cerebras.ai/v1", group: "Inference clouds" },
  { label: "SambaNova", url: "https://api.sambanova.ai/v1", group: "Inference clouds" },
  { label: "Nebius", url: "https://api.studio.nebius.com/v1", group: "Inference clouds" },
  { label: "Novita AI", url: "https://api.novita.ai/v3/openai", group: "Inference clouds" },
  { label: "Hyperbolic", url: "https://api.hyperbolic.xyz/v1", group: "Inference clouds" },
  { label: "SiliconFlow", url: "https://api.siliconflow.com/v1", group: "Inference clouds" },
  { label: "SiliconFlow (China)", url: "https://api.siliconflow.cn/v1", group: "Inference clouds" },
  { label: "Chutes", url: "https://llm.chutes.ai/v1", group: "Inference clouds" },
  { label: "Featherless", url: "https://api.featherless.ai/v1", group: "Inference clouds" },
  { label: "Baseten", url: "https://inference.baseten.co/v1", group: "Inference clouds" },
  { label: "NVIDIA NIM", url: "https://integrate.api.nvidia.com/v1", group: "Inference clouds" },
  { label: "Scaleway", url: "https://api.scaleway.ai/v1", group: "Inference clouds" },
  { label: "Atlas Cloud", url: "https://api.atlascloud.ai/v1", group: "Inference clouds" },
  { label: "Parasail", url: "https://api.parasail.io/v1", group: "Inference clouds" },
  { label: "Avian", url: "https://api.avian.io/v1", group: "Inference clouds" },
  { label: "RedPill", url: "https://api.redpill.ai/v1", group: "Inference clouds" },
  { label: "GMI Cloud", url: "https://api.gmi-serving.com/v1", group: "Inference clouds" },
  { label: "Arli AI", url: "https://api.arliai.com/v1", group: "Inference clouds" },
  { label: "Morph", url: "https://api.morphllm.com/v1", group: "Inference clouds" },
  { label: "H Company", url: "https://api.hcompany.ai/v1", group: "Inference clouds" },
  { label: "Ollama Cloud", url: "https://ollama.com/v1", group: "Inference clouds" },

  // ── Gateways & aggregators ───────────────────────────────────────────────
  { label: "Vercel AI Gateway", url: "https://ai-gateway.vercel.sh/v1", group: "Gateways & aggregators" },
  { label: "Requesty", url: "https://router.requesty.ai/v1", group: "Gateways & aggregators" },
  { label: "Portkey", url: "https://api.portkey.ai/v1", group: "Gateways & aggregators" },
  { label: "302.AI", url: "https://api.302.ai/v1", group: "Gateways & aggregators" },
  { label: "AI/ML API", url: "https://api.aimlapi.com/v1", group: "Gateways & aggregators" },
  { label: "Nano-GPT", url: "https://nano-gpt.com/api/v1", group: "Gateways & aggregators" },
  { label: "Venice AI", url: "https://api.venice.ai/api/v1", group: "Gateways & aggregators" },
  { label: "Cloudflare AI Gateway", url: "https://gateway.ai.cloudflare.com/v1/YOUR-ACCOUNT/YOUR-GATEWAY/openai", group: "Gateways & aggregators" },
  { label: "Azure OpenAI", url: "https://YOUR-RESOURCE.openai.azure.com/openai/v1", group: "Gateways & aggregators" },

  // ── Local ────────────────────────────────────────────────────────────────
  { label: "Ollama", url: "http://localhost:11434/v1", group: "Local" },
  { label: "LM Studio", url: "http://localhost:1234/v1", group: "Local" },
  { label: "vLLM / llama.cpp / LocalAI", url: "http://localhost:8080/v1", group: "Local" },
  { label: "SGLang", url: "http://localhost:30000/v1", group: "Local" },
  { label: "Jan", url: "http://localhost:1337/v1", group: "Local" },
  { label: "text-generation-webui", url: "http://localhost:5000/v1", group: "Local" },
  { label: "KoboldCpp", url: "http://localhost:5001/v1", group: "Local" },
  { label: "LiteLLM proxy", url: "http://localhost:4000/v1", group: "Local" },
];

/** Presets grouped for <optgroup> rendering, in first-seen order. */
export const OPENAI_BASE_URL_PRESET_GROUPS = OPENAI_BASE_URL_PRESETS.reduce(
  (groups, preset) => {
    const group = preset.group || "Other";
    const existing = groups.find((g) => g.label === group);
    if (existing) existing.presets.push(preset);
    else groups.push({ label: group, presets: [preset] });
    return groups;
  },
  []
);

// Extra request headers are stored as an object but edited as JSON text, so any
// provider's routing headers can be set without a per-provider form.
export function headersToText(headers) {
  if (!headers || Object.keys(headers).length === 0) return "";
  return JSON.stringify(headers, null, 2);
}

export function parseHeadersText(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(
      'Extra headers must be a JSON object, e.g. {"x-opencode-session": "abc123"}.'
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "Extra headers must be a JSON object of header name to value."
    );
  }
  return parsed;
}
