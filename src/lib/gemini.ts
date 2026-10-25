import { config } from "@/config";

/** Minimal Gemini REST client (generateContent with JSON output). The key goes in a header, never in a URL or log. */
export interface GenerateJsonArgs {
  prompt: string;
  /** JSON Schema for the response. */
  schema: object;
  timeoutMs: number;
}
export type GenerateJson = (args: GenerateJsonArgs) => Promise<unknown>;

export class GeminiNotConfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not set`);
    this.name = "GeminiNotConfiguredError";
  }
}

export const geminiGenerateJson: GenerateJson = async ({ prompt, schema, timeoutMs }) => {
  const key = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();
  if (!key) throw new GeminiNotConfiguredError("GEMINI_API_KEY");
  if (!model) throw new GeminiNotConfiguredError("GEMINI_MODEL");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        temperature: 0,
        ...(config.ai.thinkingLevel ? { thinkingConfig: { thinkingLevel: config.ai.thinkingLevel } } : {}),
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {}
    throw new Error(`Gemini HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };
  const cand = data.candidates?.[0];
  if (cand?.finishReason && cand.finishReason !== "STOP") throw new Error(`Gemini stopped early: ${cand.finishReason}`);
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no text");
  return JSON.parse(text);
};

export interface GroundedResponse {
  text: string;
  chunks: { uri: string; title: string }[];
  /** Byte offsets into `text` (UTF-8), as Google reports them. */
  supports: { start: number; end: number; chunkIndices: number[] }[];
  queries: string[];
}

/** One Gemini call with Google Search grounding. Plain text out (JSON mode would return no sources). */
export async function geminiSearch({ prompt, timeoutMs }: { prompt: string; timeoutMs: number }): Promise<GroundedResponse> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();
  if (!key) throw new GeminiNotConfiguredError("GEMINI_API_KEY");
  if (!model) throw new GeminiNotConfiguredError("GEMINI_MODEL");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0,
        ...(config.launches.searchThinkingLevel ? { thinkingConfig: { thinkingLevel: config.launches.searchThinkingLevel } } : {}),
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {}
    throw new Error(`Gemini HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: {
        webSearchQueries?: string[];
        groundingChunks?: { web?: { uri?: string; title?: string } }[];
        groundingSupports?: { segment?: { startIndex?: number; endIndex?: number }; groundingChunkIndices?: number[] }[];
      };
    }[];
  };
  const cand = data.candidates?.[0];
  if (cand?.finishReason && cand.finishReason !== "STOP") throw new Error(`Gemini stopped early: ${cand.finishReason}`);
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const gm = cand?.groundingMetadata;
  return {
    text,
    chunks: (gm?.groundingChunks ?? []).map((c) => ({ uri: c.web?.uri ?? "", title: c.web?.title ?? "" })),
    supports: (gm?.groundingSupports ?? []).map((s) => ({
      start: s.segment?.startIndex ?? 0,
      end: s.segment?.endIndex ?? 0,
      chunkIndices: s.groundingChunkIndices ?? [],
    })),
    queries: gm?.webSearchQueries ?? [],
  };
}
