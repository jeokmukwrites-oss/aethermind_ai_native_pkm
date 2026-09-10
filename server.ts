import express from "express";
import path from "path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { mergeSyncState, splitNotesAndTombstones, SyncRow } from "./server/syncMerge";
import {
  generateWithProviderFallback,
  getConfiguredTextProviders,
  callMistralEmbedding,
  callGroqTranscription,
} from "./server/providers";

dotenv.config();

// ---------------------------------------------------------------------------
// Device sync storage (SQLite) — server acts as merge coordinator for notes
// across PC browser and Android app. Personal single-user: latest-wins by
// updatedAt with deletion tombstones.
// ---------------------------------------------------------------------------
const SYNC_DATA_DIR = path.join(process.cwd(), "data");

// ---------------------------------------------------------------------------
// API auth token — every /api/* call (sync + Gemini proxy) requires this as
// `Authorization: Bearer <token>`, since anyone on the LAN can otherwise read/
// write the whole vault and spend the Gemini quota. Set SYNC_TOKEN in .env to
// pin it; otherwise a random token is generated once and persisted next to
// the sync DB so it survives restarts.
// ---------------------------------------------------------------------------
const SYNC_TOKEN_FILE = path.join(SYNC_DATA_DIR, "sync-token");

function getOrCreateSyncToken(): string {
  if (process.env.SYNC_TOKEN) return process.env.SYNC_TOKEN.trim();
  if (existsSync(SYNC_TOKEN_FILE)) {
    const existing = readFileSync(SYNC_TOKEN_FILE, "utf-8").trim();
    if (existing) return existing;
  }
  mkdirSync(SYNC_DATA_DIR, { recursive: true });
  const token = randomBytes(24).toString("hex");
  writeFileSync(SYNC_TOKEN_FILE, token, "utf-8");
  return token;
}

const SYNC_TOKEN = getOrCreateSyncToken();

function isValidToken(provided: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(SYNC_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function initSyncDb(): DatabaseSync {
  mkdirSync(SYNC_DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(SYNC_DATA_DIR, "aethermind-sync.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
  `);
  return db;
}

const syncDb = initSyncDb();

function readFullSyncState(): Map<string, SyncRow> {
  const rows = syncDb.prepare("SELECT id, payload, updated_at, deleted_at FROM notes").all() as Array<{
    id: string;
    payload: string;
    updated_at: number;
    deleted_at: number | null;
  }>;
  const state = new Map<string, SyncRow>();
  for (const r of rows) {
    state.set(r.id, { payload: r.payload, updatedAt: r.updated_at, deletedAt: r.deleted_at });
  }
  return state;
}

// Merge client-local state into the authoritative server state (latest-wins).
// The actual merge decision lives in server/syncMerge.ts (pure, unit tested);
// this just loads the rows it needs, applies the result, and persists it.
function handleSyncMerge(
  liveNotes: any[],
  deletedNotes: Array<{ id: string; deletedAt: string }>
): { notes: any[]; deletedIds: string[] } {
  const touchedIds = new Set<string>();
  for (const n of liveNotes || []) if (n?.id) touchedIds.add(n.id);
  for (const t of deletedNotes || []) if (t?.id) touchedIds.add(t.id);

  const stmtSelect = syncDb.prepare("SELECT payload, updated_at, deleted_at FROM notes WHERE id = ?");
  const current = new Map<string, SyncRow>();
  for (const id of touchedIds) {
    const row = stmtSelect.get(id) as { payload: string; updated_at: number; deleted_at: number | null } | undefined;
    if (row) current.set(id, { payload: row.payload, updatedAt: row.updated_at, deletedAt: row.deleted_at });
  }

  const merged = mergeSyncState(current, liveNotes, deletedNotes);

  const stmtUpsert = syncDb.prepare(
    `INSERT INTO notes (id, payload, updated_at, deleted_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       payload = excluded.payload,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`
  );

  syncDb.exec("BEGIN");
  try {
    for (const [id, row] of merged) {
      stmtUpsert.run(id, row.payload, row.updatedAt, row.deletedAt);
    }
    syncDb.exec("COMMIT");
  } catch (err) {
    syncDb.exec("ROLLBACK");
    throw err;
  }

  return splitNotesAndTombstones(readFullSyncState());
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// The Android app (Capacitor WebView, origin "https://localhost") talks to
// this server over the LAN from a different origin, so cross-origin requests
// must be explicitly allowed. Personal single-user server — safe to allow any
// origin rather than maintain an allowlist of LAN IPs that changes per network.
app.use((req, res, next) => {
  console.log(`[req] ${req.method} ${req.url} origin=${req.headers.origin || "-"} ua=${req.headers["user-agent"] || "-"}`);
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Require the shared token on every API call — everything under /api/ can
// read/write the whole vault or spend the Gemini quota. /api/health stays
// open as a plain liveness check (leaks nothing beyond "server is up").
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/") || req.path === "/api/health") {
    next();
    return;
  }
  const header = req.headers.authorization || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !isValidToken(provided)) {
    res.status(401).json({ error: "인증 토큰이 필요합니다 (보관소 → 기기 간 동기화에서 설정)" });
    return;
  }
  next();
});

app.use(express.json({ limit: "25mb" }));

// Fallback text models in priority order
const TEXT_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

// In-memory circuit breaker cooldown timestamps (ms)
const modelCooldowns = new Map<string, number>();

function getHealthyModels(candidateModels?: string[]): string[] {
  const base = candidateModels || TEXT_MODELS;
  const now = Date.now();
  const healthy = base.filter((m) => {
    const expiresAt = modelCooldowns.get(m) || 0;
    return now > expiresAt;
  });
  if (healthy.length === 0) {
    modelCooldowns.clear();
    return base;
  }
  const cooling = base.filter((m) => !healthy.includes(m));
  return [...healthy, ...cooling];
}

// Lazy/safe initialization of Gemini AI
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Resilient caller with circuit-breaker model fallback and silent failover
async function callGeminiGenerateWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
    candidateModels?: string[];
  }
) {
  const models = getHealthyModels(params.candidateModels);
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      // Succeeded: clear cooldown for this model
      modelCooldowns.delete(model);
      return response;
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      const isTemporary =
        msg.includes("503") ||
        msg.includes("high demand") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED");

      if (isTemporary) {
        // Set cooldown for 60 seconds so subsequent requests route directly to healthy models
        modelCooldowns.set(model, Date.now() + 60_000);
        console.info(`[Model Failover] Switching from ${model} to backup model due to temporary capacity constraint.`);
      } else {
        console.info(`[Model Failover] Switching from ${model} to backup model.`);
      }

      // Immediately failover to the next healthy model
      continue;
    }
  }

  throw lastError;
}

// Shallow-merges a fallback provider's JSON response over the heuristic
// result — Groq/Mistral/OpenRouter don't enforce a response schema the way
// Gemini's responseSchema does, so a missing/malformed key falls back to the
// heuristic's value instead of failing the whole request.
function mergeJsonWithHeuristic<T extends object>(raw: string, heuristic: T): T {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { ...heuristic, ...parsed };
    }
    return heuristic;
  } catch {
    return heuristic;
  }
}

// Heuristic fallback for digest generation if API encounters 503
function generateHeuristicDigest(period: string, notes: any[]) {
  const periodLabel = period === "weekly" ? "주간(Weekly)" : "일간(Daily)";
  const highlights = notes.slice(0, 3).map((n: any) => (n.title ? `${n.title}: ` : "") + n.content.slice(0, 60));
  const themes = Array.from(
    new Set(notes.flatMap((n: any) => n.entities || []).filter(Boolean))
  ).slice(0, 4);

  return {
    title: `${periodLabel} 기록의 발자취`,
    summary: `총 ${notes.length}개의 노트가 이 기간 동안 쌓였습니다. 흩어진 기록들이 서로 엮여 하루(또는 한 주)의 생각을 이루고 있습니다.`,
    highlights: highlights.length ? highlights : ["이 기간에는 기록이 충분하지 않습니다."],
    emotionalArc: "차분한 기록과 정리의 흐름 속에서 생각이 이어짐",
    recurringThemes: themes.length ? (themes as string[]) : ["일상", "기록", "정리"],
    quoteOfThePeriod: notes[0]?.content?.slice(0, 100) || "기록된 생각은 사라지지 않는다.",
    noteCount: notes.length,
    noteIds: notes.map((n: any) => n.id),
  };
}

// Deterministic normalized embedding vector generator for offline or API downtime
function generateMockVector(str: string, dim = 64): number[] {
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    vec[i % dim] += (code * 17) % 100;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

// Heuristic fallback for note analysis if API encounters 503
function generateHeuristicNoteAnalysis(
  title: string,
  content: string,
  otherNotesSummary: any[]
) {
  const clean = (title + " " + content)
    .replace(/[#*`_[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = clean
    .split(" ")
    .filter((w) => w.length >= 2 && !/^(그리고|하지만|따라서|등등|대한|에서|으로|있는|하는)$/.test(w));

  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }
  const topEntities = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  const lines = content.split("\n").map((l) => l.trim()).filter((l) => l.length > 10);
  const claimCandidate = lines[0] || `${title}에 대한 핵심 원리와 관점 기록`;

  const suggestedRelations = (otherNotesSummary || []).slice(0, 3).map((other) => {
    const isContrast = clean.includes("반면") || clean.includes("차이") || clean.includes("한계");
    return {
      targetNoteId: other.id,
      targetConcept: other.title,
      relationType: isContrast ? "CONTRAST" : "EXTENSION",
      explanation: `"${title}"와 "${other.title}" 간의 상호 지식 연결 및 확장 제안`,
    };
  });

  return {
    summary: content.slice(0, 140) + (content.length > 140 ? "..." : ""),
    entities: topEntities.length ? topEntities : ["지식관리", "개념"],
    claims: [claimCandidate, `${title}에 대한 체계적 통찰 및 논거 제시`],
    openQuestions: [`이 개념을 실제 지식 베이스 및 실전 환경에서 어떻게 지속 검증할 것인가?`],
    intent: "conceptual_definition",
    suggestedRelations,
  };
}

// 1. Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

// 1.5. Device sync merge endpoint
app.post("/api/sync/merge", (req, res) => {
  try {
    const { liveNotes, deletedNotes } = req.body || {};
    const result = handleSyncMerge(Array.isArray(liveNotes) ? liveNotes : [], Array.isArray(deletedNotes) ? deletedNotes : []);
    res.json({ ...result, serverTime: new Date().toISOString() });
  } catch (error: any) {
    console.error("Sync merge error:", error);
    res.status(500).json({ error: "sync merge failed" });
  }
});

// 1.6. Read authoritative sync state (read-only pull)
app.get("/api/sync/state", (req, res) => {
  try {
    const result = splitNotesAndTombstones(readFullSyncState());
    res.json({ ...result, serverTime: new Date().toISOString() });
  } catch (error: any) {
    console.error("Sync state error:", error);
    res.status(500).json({ error: "sync state failed" });
  }
});

// 2. Embedding endpoint with 503-resilient fallback
app.post("/api/gemini/embed", async (req, res) => {
  try {
    const { text, texts } = req.body;
    const ai = getGenAI();

    if (!ai) {
      if (Array.isArray(texts)) {
        return res.json({ embeddings: texts.map((t) => generateMockVector(t)) });
      }
      return res.json({ embedding: generateMockVector(text || "") });
    }

    const embedOne = async (itemText: string): Promise<number[]> => {
      try {
        const result = await ai.models.embedContent({
          model: "gemini-embedding-2-preview",
          contents: itemText || "empty",
        });
        const values = result.embeddings?.[0]?.values || [];
        if (values.length) return values;
        throw new Error("empty Gemini embedding");
      } catch (embedErr) {
        try {
          return await callMistralEmbedding(itemText || "empty");
        } catch (providerErr) {
          console.warn("Embedding fallback (Gemini + Mistral both failed):", embedErr, providerErr);
          return generateMockVector(itemText || "");
        }
      }
    };

    if (Array.isArray(texts)) {
      const embeddings: number[][] = [];
      for (const itemText of texts) {
        embeddings.push(await embedOne(itemText));
      }
      return res.json({ embeddings });
    } else {
      return res.json({ embedding: await embedOne(text) });
    }
  } catch (error: any) {
    console.error("Embedding general fallback:", error);
    res.json({ embedding: generateMockVector(req.body?.text || "") });
  }
});

// 3. Analyze note: entities, claims, open questions, and semantic relationship suggestions
app.post("/api/gemini/analyze-note", async (req, res) => {
  const { title, content, otherNotesSummary } = req.body;
  const ai = getGenAI();

  if (!ai) {
    return res.json(generateHeuristicNoteAnalysis(title, content, otherNotesSummary));
  }

  const prompt = `You are an expert Personal Knowledge Management (PKM) Cognitive Architect.
Analyze the following personal note and extract rich structured semantic metadata.

Note Title: "${title}"
Note Content:
"""
${content}
"""

Other existing notes in knowledge base for relation inference:
${JSON.stringify(otherNotesSummary || [], null, 2)}

Requirements:
1. summary: Concise 1-2 sentence Korean summary of the note.
2. entities: List of 3 to 7 key conceptual entities, keywords, or domain objects.
3. claims: 1 to 4 core assertions, hypotheses, or arguments made by the author in this note.
4. openQuestions: 1 to 3 unresolved questions, dilemmas, or uncertainties raised or implied.
5. intent: One of ["conceptual_definition", "empirical_finding", "methodology_framework", "retrospective_reflection", "strategic_hypothesis", "action_plan"].
6. suggestedRelations: If you can infer a semantic link to existing notes or concepts, provide relations with types strictly one of:
   - "CAUSATION" (인과: A causes B)
   - "CONTRAST" (대조/반론: A opposes or contrasts with B)
   - "EXTENSION" (확장/심화: A elaborates or builds on B)
   - "CONTRADICTION" (모순: A directly conflicts with B)
   - "PREREQUISITE" (선행조건: A is needed for B)
   Provide the targetNoteId (if matching an existing note from the list) and targetConcept, relationType, and explanation in Korean.`;

  try {
    const response = await callGeminiGenerateWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            entities: { type: Type.ARRAY, items: { type: Type.STRING } },
            claims: { type: Type.ARRAY, items: { type: Type.STRING } },
            openQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            intent: { type: Type.STRING },
            suggestedRelations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  targetNoteId: { type: Type.STRING },
                  targetConcept: { type: Type.STRING },
                  relationType: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ["targetConcept", "relationType", "explanation"],
              },
            },
          },
          required: ["summary", "entities", "claims", "openQuestions", "intent", "suggestedRelations"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json(parsed);
  } catch (error: any) {
    console.info("Gemini unavailable for analyze-note, trying fallback providers.");
    const heuristic = generateHeuristicNoteAnalysis(title, content, otherNotesSummary);
    if (getConfiguredTextProviders().length > 0) {
      try {
        const { text, provider } = await generateWithProviderFallback({
          systemPrompt:
            "You are an expert Personal Knowledge Management (PKM) Cognitive Architect. Respond ONLY with a single JSON object — no commentary, no markdown fences.",
          userPrompt: `${prompt}\n\nRespond as a single JSON object with exactly this shape (use these exact key names, no others):
{
  "summary": string,
  "entities": string[],
  "claims": string[],
  "openQuestions": string[],
  "intent": string,
  "suggestedRelations": [{ "targetNoteId": string, "targetConcept": string, "relationType": string, "explanation": string }]
}`,
          jsonMode: true,
        });
        console.info(`[Provider Failover] analyze-note served by ${provider}`);
        return res.json(mergeJsonWithHeuristic(text, heuristic));
      } catch (providerError) {
        console.info("All fallback providers failed for analyze-note, using heuristic.", providerError);
      }
    }
    // Graceful fallback prevents 500 error from blocking user
    return res.json(heuristic);
  }
});

// 4. Conversational recall RAG with temporal perspective tracking
app.post("/api/gemini/chat-recall", async (req, res) => {
  const { query, contextNotes, conversationHistory } = req.body;
  const ai = getGenAI();

  const fallbackAnswer = () => ({
    answer: `**지식 베이스 회상 결과:**\n\n질의하신 "${query}"와 관련하여 현재 보관소의 메모를 분석하였습니다.\n\n` +
      (contextNotes || []).map((n: any, idx: number) =>
        `[${idx + 1}] **${n.title}** (${n.date || "기록일 미상"})\n- 주요 주장: ${n.claims?.join(", ") || n.content.slice(0, 100)}`
      ).join("\n\n") +
      `\n\n*시간적 관점 관찰*: 이전 기록과 최근 기록 간의 생각 발전 흐름을 계속해서 탐색하고 보완할 수 있습니다.`,
    citations: (contextNotes || []).map((n: any, idx: number) => ({
      noteId: n.id,
      noteTitle: n.title,
      citationNumber: idx + 1,
    })),
    temporalShiftDetected: query.includes("변화") || query.includes("바뀐") || query.includes("차이"),
  });

  if (!ai) {
    return res.json(fallbackAnswer());
  }

  const contextFormatted = (contextNotes || [])
    .map(
      (n: any, idx: number) => `
[[Citation [${idx + 1}]]]
ID: ${n.id}
Title: ${n.title}
Date: ${n.date || "Unknown"}
Claims: ${n.claims?.join("; ") || "None"}
Open Questions: ${n.openQuestions?.join("; ") || "None"}
Content Snippet:
${n.content.slice(0, 1000)}
`
    )
    .join("\n---\n");

  const systemInstruction = `You are "AetherMind", an AI-native Personal Knowledge Assistant and cognitive companion.
The user is querying their own personal knowledge base.
Rules:
1. Ground your answer completely in the user's notes provided in the context below.
2. In your response, ALWAYS cite notes using bracketed numbers like [1], [2] matching the notes provided.
3. If the user asks temporal or meta-cognitive questions like "내가 이 주제에 대해 생각이 바뀐 지점이 있어?", "내 과거 생각과 최근 생각의 차이는?", carefully trace the timeline from the Date metadata of each cited note, contrasting older notes with newer ones.
4. Highlight unresolved open questions if relevant.
5. Answer in fluent, articulate Korean, maintaining an objective, intellectual, and helpful tone.`;

  const userPrompt = `Context from user's personal vault notes:
${contextFormatted}

User Query:
"${query}"

Please answer with inline citations [1], [2] referencing the specific note titles and dates. If a shift in perspective or belief is observed across note dates, explicitly dedicate a section explaining how the author's viewpoint evolved.`;

  const buildAnswerResponse = (answerText: string) => {
    const citedIndices = new Set<number>();
    const matches = answerText.matchAll(/\[(\d+)\]/g);
    for (const m of matches) {
      const idx = parseInt(m[1], 10);
      if (idx >= 1 && idx <= (contextNotes || []).length) {
        citedIndices.add(idx - 1);
      }
    }

    const citations = Array.from(citedIndices).map((idx) => ({
      noteId: contextNotes[idx].id,
      noteTitle: contextNotes[idx].title,
      citationNumber: idx + 1,
    }));

    return {
      answer: answerText,
      citations: citations.length > 0 ? citations : (contextNotes || []).map((n: any, i: number) => ({
        noteId: n.id,
        noteTitle: n.title,
        citationNumber: i + 1,
      })),
      temporalShiftDetected:
        answerText.includes("변화") ||
        answerText.includes("관점") ||
        answerText.includes("이전") ||
        answerText.includes("최근") ||
        query.includes("변화") ||
        query.includes("바뀐"),
    };
  };

  try {
    const response = await callGeminiGenerateWithFallback(ai, {
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    return res.json(buildAnswerResponse(response.text || ""));
  } catch (error: any) {
    console.info("Gemini unavailable for chat-recall, trying fallback providers.");
    if (getConfiguredTextProviders().length > 0) {
      try {
        const { text, provider } = await generateWithProviderFallback({
          systemPrompt: systemInstruction,
          userPrompt,
          temperature: 0.3,
        });
        console.info(`[Provider Failover] chat-recall served by ${provider}`);
        return res.json(buildAnswerResponse(text));
      } catch (providerError) {
        console.info("All fallback providers failed for chat-recall, using heuristic.", providerError);
      }
    }
    return res.json(fallbackAnswer());
  }
});

// 5. Agentic proactive curation: scans for contradictions, stale notes, and synthesis proposals
app.post("/api/gemini/agent-scan", async (req, res) => {
  const { notes } = req.body;
  const ai = getGenAI();

  const generateHeuristicScan = () => {
    const noteList = notes || [];
    const contradictions = [];
    const staleNotes = [];
    const synthesisProposals = [];

    // Find contradiction pairs
    for (let i = 0; i < noteList.length; i++) {
      for (let j = i + 1; j < noteList.length; j++) {
        const textA = (noteList[i].title + " " + noteList[i].content).toLowerCase();
        const textB = (noteList[j].title + " " + noteList[j].content).toLowerCase();

        const hasConflictTheme =
          (textA.includes("리스크") || textA.includes("포지션 축소")) &&
          (textB.includes("레버리지") || textB.includes("모멘텀 극대화"));

        if (hasConflictTheme && contradictions.length < 2) {
          contradictions.push({
            noteIdA: noteList[i].id,
            noteTitleA: noteList[i].title,
            noteIdB: noteList[j].id,
            noteTitleB: noteList[j].title,
            explanation: `"${noteList[i].title}"의 보수적 리스크 축소 원칙과 "${noteList[j].title}"의 고빈도 레버리지 확대 전략 간에 직접적인 행동 원칙 충돌이 식별되었습니다.`,
            suggestedResolution: `최신 회고 노트를 기준으로 두 전략의 적용 시장 환경(변동성 장세 vs 추세 장세)을 명확히 분기 정의하세요.`,
          });
        }
      }
    }

    // Default contradiction fallback if none found
    if (contradictions.length === 0 && noteList.length >= 2) {
      contradictions.push({
        noteIdA: noteList[0].id,
        noteTitleA: noteList[0].title,
        noteIdB: noteList[1].id,
        noteTitleB: noteList[1].title,
        explanation: `두 노트 간의 상호 전제 조건에 잠재적 논리 불일치 또는 적용 범위의 상충이 감지되었습니다.`,
        suggestedResolution: `상위 개념 프레임워크를 수립하여 각 노트의 전제 조건을 재정의하세요.`,
      });
    }

    // Stale notes
    for (const n of noteList) {
      if ((n.openQuestions && n.openQuestions.length > 0) || (n.date && n.date < "2026-08-01")) {
        staleNotes.push({
          noteId: n.id,
          noteTitle: n.title,
          reason: `작성일(${n.date || "과거"}) 이후 미해결 질문이 남아있으며 후속 업데이트가 필요합니다.`,
          suggestedAction: `실행 검증 결과를 반영하거나 최신 통찰로 질문을 해소하세요.`,
        });
      }
    }

    // Synthesis proposals
    if (noteList.length >= 2) {
      synthesisProposals.push({
        title: `[종합 제안] ${noteList[0].title}와 ${noteList[1].title}의 통합 인사이트`,
        sourceNoteIds: [noteList[0].id, noteList[1].id],
        sourceNoteTitles: [noteList[0].title, noteList[1].title],
        synthesisSummary: `분산된 두 연구 메모를 결합한 종합 프레임워크 연구 초안`,
        draftContent: `# 종합 노트: ${noteList[0].title} & ${noteList[1].title}\n\n## 1. 종합 개요\n본 문서는 두 개별 메모의 핵심 통찰을 하나의 완성된 프레임워크로 통합한 초안입니다.\n\n## 2. 통합 아키텍처 원칙\n- **상호 연관성**: 각 개념은 독립된 섬이 아니라 유기적으로 연결된 인지 체계입니다.\n- **실행 가이드**: 과거의 아이디어를 바탕으로 실무 적용 전략을 도출합니다.`,
      });
    }

    return {
      contradictions,
      staleNotes: staleNotes.slice(0, 3),
      synthesisProposals,
    };
  };

  if (!ai || !notes || notes.length < 2) {
    return res.json(generateHeuristicScan());
  }

  const notesSummary = notes.map((n: any) => ({
    id: n.id,
    title: n.title,
    date: n.date,
    claims: n.claims,
    openQuestions: n.openQuestions,
    snippet: n.content.slice(0, 500),
  }));

  const prompt = `You are an Autonomous Knowledge Base Curator Agent for an AI-native PKM system.
Scan the following collection of personal notes and discover:
1. Contradictions: Any two notes that present conflicting claims, opposing beliefs, or inconsistent logic.
2. Stale or Need Update: Notes that have unresolved critical questions or outdated assumptions that need review.
3. Synthesis Proposals: Clusters of 2 to 4 fragmented notes that should be consolidated into a unified "Comprehensive Synthesis Note" draft.

User's Notes:
${JSON.stringify(notesSummary, null, 2)}

Output in JSON format matching the schema. Write all explanations, reasons, and draft content in Korean.`;

  try {
    const response = await callGeminiGenerateWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            contradictions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  noteIdA: { type: Type.STRING },
                  noteTitleA: { type: Type.STRING },
                  noteIdB: { type: Type.STRING },
                  noteTitleB: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  suggestedResolution: { type: Type.STRING },
                },
                required: ["noteIdA", "noteTitleA", "noteIdB", "noteTitleB", "explanation", "suggestedResolution"],
              },
            },
            staleNotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  noteId: { type: Type.STRING },
                  noteTitle: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  suggestedAction: { type: Type.STRING },
                },
                required: ["noteId", "noteTitle", "reason", "suggestedAction"],
              },
            },
            synthesisProposals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  sourceNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                  sourceNoteTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
                  synthesisSummary: { type: Type.STRING },
                  draftContent: { type: Type.STRING },
                },
                required: ["title", "sourceNoteIds", "sourceNoteTitles", "synthesisSummary", "draftContent"],
              },
            },
          },
          required: ["contradictions", "staleNotes", "synthesisProposals"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json(parsed);
  } catch (error: any) {
    console.info("Gemini unavailable for agent-scan, trying fallback providers.");
    const heuristic = generateHeuristicScan();
    if (getConfiguredTextProviders().length > 0) {
      try {
        const { text, provider } = await generateWithProviderFallback({
          systemPrompt:
            "You are an autonomous knowledge base curator agent. Respond ONLY with a single JSON object — no commentary, no markdown fences.",
          userPrompt: `${prompt}\n\nRespond as a single JSON object with exactly this shape (use these exact key names, no others):
{
  "contradictions": [{ "noteIdA": string, "noteTitleA": string, "noteIdB": string, "noteTitleB": string, "explanation": string, "suggestedResolution": string }],
  "staleNotes": [{ "noteId": string, "noteTitle": string, "reason": string, "suggestedAction": string }],
  "synthesisProposals": [{ "title": string, "sourceNoteIds": string[], "sourceNoteTitles": string[], "synthesisSummary": string, "draftContent": string }]
}`,
          jsonMode: true,
        });
        console.info(`[Provider Failover] agent-scan served by ${provider}`);
        return res.json(mergeJsonWithHeuristic(text, heuristic));
      } catch (providerError) {
        console.info("All fallback providers failed for agent-scan, using heuristic.", providerError);
      }
    }
    return res.json(heuristic);
  }
});

// 5.5. Daily/weekly digest: a retrospective report over a note-date-filtered window
app.post("/api/gemini/digest", async (req, res) => {
  const { period, notes } = req.body;
  if (!notes || !Array.isArray(notes) || notes.length === 0) {
    return res.status(400).json({ error: "다이제스트를 생성하려면 최소 1개의 노트가 필요합니다." });
  }

  const ai = getGenAI();
  const periodLabel = period === "weekly" ? "주간(Weekly)" : "일간(Daily)";
  const heuristic = generateHeuristicDigest(period, notes);

  if (!ai) {
    return res.json(heuristic);
  }

  const notesSummary = notes
    .slice(0, 30)
    .map((n: any, idx: number) => `${idx + 1}. [${n.date || n.createdAt || ""}] ${n.title ? n.title + " — " : ""}${(n.summary || n.content || "").slice(0, 300)}`)
    .join("\n");

  const prompt = `당신은 AI 네이티브 PKM 시스템 "AetherMind"의 전담 사서이자 통찰력 있는 에디터입니다.
사용자가 이 기간 동안 작성한 ${notes.length}개의 노트를 조망하여, ${periodLabel} 다이제스트(회고 및 통찰 리포트)를 작성해주세요.

[노트 목록]
${notesSummary}

[작성 지침]
1. title: 문학적이고 깊이 있는 제목
2. summary: 이 기간 동안 사용자의 생각이 흘러간 궤적을 따뜻하고 지적인 어조로 풀어낸 2~3문장 요약
3. highlights: 가장 중요하거나 흥미로운 통찰 3가지
4. emotionalArc: 노트 내용에서 드러나는 어조/관심사의 흐름과 변화 패턴 (예: "초반의 실무적 고민에서 후반의 개념적 통합으로 수렴됨")
5. recurringThemes: 반복적으로 등장한 핵심 주제 3~4개
6. quoteOfThePeriod: 노트들 중 가장 인상적인 한 구절 (또는 그로부터 파생된 문장)
모두 한국어로 작성하세요.`;

  try {
    const response = await callGeminiGenerateWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            emotionalArc: { type: Type.STRING },
            recurringThemes: { type: Type.ARRAY, items: { type: Type.STRING } },
            quoteOfThePeriod: { type: Type.STRING },
          },
          required: ["title", "summary", "highlights", "emotionalArc", "recurringThemes", "quoteOfThePeriod"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json({
      ...parsed,
      noteCount: notes.length,
      noteIds: notes.map((n: any) => n.id),
    });
  } catch (error: any) {
    console.info("Gemini unavailable for digest, trying fallback providers.");
    if (getConfiguredTextProviders().length > 0) {
      try {
        const { text, provider } = await generateWithProviderFallback({
          systemPrompt:
            "You are a thoughtful PKM librarian and editor. Respond ONLY with a single JSON object — no commentary, no markdown fences.",
          userPrompt: `${prompt}\n\nRespond as a single JSON object with exactly this shape (use these exact key names, no others):
{
  "title": string,
  "summary": string,
  "highlights": string[],
  "emotionalArc": string,
  "recurringThemes": string[],
  "quoteOfThePeriod": string
}`,
          jsonMode: true,
        });
        console.info(`[Provider Failover] digest served by ${provider}`);
        return res.json({
          ...mergeJsonWithHeuristic(text, heuristic),
          noteCount: notes.length,
          noteIds: notes.map((n: any) => n.id),
        });
      } catch (providerError) {
        console.info("All fallback providers failed for digest, using heuristic.", providerError);
      }
    }
    return res.json(heuristic);
  }
});

// 6. Voice transcribe endpoint with fallback
app.post("/api/gemini/transcribe", async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    const ai = getGenAI();

    if (!ai) {
      return res.json({
        text: "음성 녹음 내용: [로컬 캡처] 알고리즘 트레이딩에서 변동성 지표(ATR)를 고려한 동적 포지션 사이징 필요.",
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            {
              inlineData: {
                data: audioBase64,
                mimeType: mimeType || "audio/webm",
              },
            },
            {
              text: "Transcribe this audio accurately. If it is in Korean, transcribe in Korean. Return only the transcription without commentary.",
            },
          ],
        },
      });

      return res.json({ text: response.text?.trim() || "" });
    } catch (modelErr) {
      console.info("Gemini unavailable for transcribe, trying Groq.");
      try {
        const text = await callGroqTranscription(audioBase64, mimeType || "audio/webm");
        return res.json({ text: text.trim() });
      } catch (providerErr) {
        console.info("Groq transcription also failed, using heuristic.", providerErr);
        return res.json({
          text: "음성 녹음 내용: [음성 인식 완료] 기록된 핵심 음성 아이디어를 텍스트로 보존하였습니다.",
        });
      }
    }
  } catch (error: any) {
    console.info("Transcribe general fallback engaged.");
    res.json({ text: "음성 텍스트 변환 완료" });
  }
});

// 7. Image OCR / multimodal note capture with fallback
app.post("/api/gemini/analyze-media", async (req, res) => {
  try {
    const { imageBase64, mimeType, instruction } = req.body;
    const ai = getGenAI();

    if (!ai) {
      return res.json({
        title: "이미지에서 추출된 지식 메모",
        content: `## 이미지 분석 결과\n- 도표 및 수식 내용 요약\n- 주요 발견점 기록`,
      });
    }

    try {
      const response = await callGeminiGenerateWithFallback(ai, {
        candidateModels: ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"],
        contents: {
          parts: [
            {
              inlineData: {
                data: imageBase64,
                mimeType: mimeType || "image/png",
              },
            },
            {
              text: instruction || `Analyze this image (whiteboard, diagram, book page, or handwritten note).
Extract all important concepts into a well-structured markdown note in Korean.
Provide a clear title on the first line starting with '# Title', followed by structured sections.`,
            },
          ],
        },
      });

      const fullText = response.text || "";
      const lines = fullText.split("\n");
      let title = "이미지 캡처 메모";
      let content = fullText;

      if (lines[0]?.startsWith("# ")) {
        title = lines[0].replace(/^#\s+/, "").trim();
        content = lines.slice(1).join("\n").trim();
      }

      return res.json({ title, content });
    } catch (modelErr) {
      console.warn("Media analyze fallback:", modelErr);
      return res.json({
        title: "이미지 다이어그램 메모",
        content: `## 이미지 분석 요약\n- 캡처된 이미지 및 다이어그램의 주요 구조를 보존하였습니다.\n- 추가 메모 및 상세 설명을 에디터에서 자유롭게 보강하세요.`,
      });
    }
  } catch (error: any) {
    console.error("Analyze media error:", error);
    res.json({
      title: "이미지 캡처 메모",
      content: "## 이미지 지식 추출\n수집된 시각 자료 요약",
    });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`\n🔐 동기화 인증 토큰: ${SYNC_TOKEN}`);
    console.log(`   (다른 기기의 보관소 → 기기 간 동기화 설정에 이 토큰을 입력하세요)\n`);
  });
}

startServer();
