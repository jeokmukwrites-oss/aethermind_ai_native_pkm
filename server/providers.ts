// Fallback LLM providers, used only when Gemini (server.ts's own 3-model
// rotation) fails entirely. All three are OpenAI-compatible chat/completions
// APIs, so one call implementation covers all of them.

export interface FallbackProvider {
  name: string;
  envKey: string;
  baseUrl: string;
  model: string;
}

// Model ids are verified live against each provider's /models endpoint for
// the configured key — free-tier availability shifts over time, so if a
// provider starts failing with "model not found"/403, re-check its
// /models list rather than guessing a new name.
export const TEXT_PROVIDERS: FallbackProvider[] = [
  { name: "groq", envKey: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  { name: "mistral", envKey: "MISTRAL_API_KEY", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  { name: "openrouter", envKey: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  { name: "nvidia", envKey: "NVIDIA_API_KEY", baseUrl: "https://integrate.api.nvidia.com/v1", model: "meta/llama-3.2-11b-vision-instruct" },
  // HF router requires "<model>:<provider>" — this specific pairing is a
  // confirmed-free route; other providers on the same model may be paid.
  { name: "huggingface", envKey: "HUGGINGFACE_API_KEY", baseUrl: "https://router.huggingface.co/v1", model: "Qwen/Qwen3.8-27B:ovhcloud" },
];

// Same circuit-breaker shape as server.ts's modelCooldowns/getHealthyModels —
// kept here as pure, injectable logic so it's unit testable without network.
const providerCooldowns = new Map<string, number>();

export function isProviderConfigured(provider: FallbackProvider, env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env[provider.envKey];
}

export function getHealthyProviders(
  providers: FallbackProvider[],
  cooldowns: Map<string, number> = providerCooldowns,
  now: number = Date.now()
): FallbackProvider[] {
  const healthy = providers.filter((p) => now > (cooldowns.get(p.name) || 0));
  if (healthy.length === 0) {
    cooldowns.clear();
    return providers;
  }
  const cooling = providers.filter((p) => !healthy.includes(p));
  return [...healthy, ...cooling];
}

export function markProviderCooldown(name: string, cooldowns: Map<string, number> = providerCooldowns, ms = 60_000) {
  cooldowns.set(name, Date.now() + ms);
}

export function clearProviderCooldown(name: string, cooldowns: Map<string, number> = providerCooldowns) {
  cooldowns.delete(name);
}

export function getConfiguredTextProviders(env: NodeJS.ProcessEnv = process.env): FallbackProvider[] {
  const configured = TEXT_PROVIDERS.filter((p) => isProviderConfigured(p, env));
  return getHealthyProviders(configured);
}

interface ChatParams {
  systemPrompt?: string;
  userPrompt: string;
  jsonMode?: boolean;
  temperature?: number;
}

// One OpenAI-compatible /chat/completions call. Throws on any non-2xx or
// network error — callers decide what "failure" means for them.
export async function callProviderChat(
  provider: FallbackProvider,
  { systemPrompt, userPrompt, jsonMode, temperature = 0.4 }: ChatParams,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const apiKey = env[provider.envKey];
  if (!apiKey) throw new Error(`${provider.name}: no API key configured`);

  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    { role: "user", content: userPrompt },
  ];

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${provider.name} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${provider.name}: empty response`);
  return text;
}

// Tries each configured, healthy provider in order (Groq → Mistral →
// OpenRouter). Returns the first success; throws the last error if all fail
// or none are configured.
export async function generateWithProviderFallback(
  params: ChatParams,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ text: string; provider: string }> {
  const providers = getConfiguredTextProviders(env);
  let lastError: any = new Error("No fallback LLM providers configured");

  for (const provider of providers) {
    try {
      const text = await callProviderChat(provider, params, env);
      clearProviderCooldown(provider.name);
      return { text, provider: provider.name };
    } catch (err) {
      lastError = err;
      markProviderCooldown(provider.name);
      console.info(`[Provider Failover] ${provider.name} failed, trying next provider.`, err);
    }
  }

  throw lastError;
}

// Mistral's embeddings API (fallback for Gemini's embedContent). Not part of
// the chat-completions circuit breaker above since it's a single provider,
// not a chain — callers just try/catch it directly.
export async function callMistralEmbedding(text: string, env: NodeJS.ProcessEnv = process.env): Promise<number[]> {
  const apiKey = env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("mistral: no API key configured");

  const res = await fetch("https://api.mistral.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "mistral-embed", input: [text || "empty"] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`mistral embeddings HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data: any = await res.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) throw new Error("mistral: empty embedding");
  return embedding;
}

// Groq's Whisper transcription API (fallback for Gemini's audio transcribe).
export async function callGroqTranscription(
  audioBase64: string,
  mimeType: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error("groq: no API key configured");

  const bytes = Buffer.from(audioBase64, "base64");
  const ext = mimeType.includes("mp3") ? "mp3" : mimeType.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), `audio.${ext}`);
  form.append("model", "whisper-large-v3");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`groq transcription HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data: any = await res.json();
  if (typeof data?.text !== "string") throw new Error("groq: empty transcription");
  return data.text;
}
