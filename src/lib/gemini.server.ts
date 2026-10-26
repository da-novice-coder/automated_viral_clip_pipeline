// Server-only Gemini client for clip suggestions. Never imported by browser code.
import type { Segment } from "./types";

/** The Gemini model used for clip suggestions — change it here only. */
const GEMINI_MODEL = "gemini-2.5-flash";

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MIN_SUGGESTION_SECONDS = 15;
const MAX_SUGGESTION_SECONDS = 60;
const MAX_SUGGESTIONS = 10;

export const MIN_SUGGESTED_CLIP_SECONDS = MIN_SUGGESTION_SECONDS;
export const MAX_SUGGESTED_CLIP_SECONDS = MAX_SUGGESTION_SECONDS;

export type ClipSuggestion = {
  title: string;
  start: number;
  end: number;
  score: number;
  reason: string;
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    clips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          start_s: { type: "number" },
          end_s: { type: "number" },
          score: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["title", "start_s", "end_s", "score", "reason"],
      },
    },
  },
  required: ["clips"],
} as const;

function instructionBlock(language: string | null): string {
  const spoken = language?.trim() || "the transcript";
  return [
    "You are a short-form video editor. From the timestamped transcript below, pick 5 to 10 standalone moments that would perform well as vertical clips.",
    "- Each clip must be 15 to 60 seconds long.",
    "- start_s and end_s are seconds and must be copied exactly from segment boundaries in the transcript (a segment's start and a later segment's end), inside the transcript range.",
    "- score is an integer from 0 to 100 rating the hook.",
    "- title: catchy, at most 60 characters.",
    "- reason: one short line explaining why the moment works.",
    `- Write titles and reasons in the same language as the transcript (${spoken}). Never translate the transcript language.`,
    "Return only JSON that matches the requested schema.",
  ].join("\n");
}

function geminiError(status: number, body: string): string {
  let detail = "";
  try {
    detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    detail = body;
  }
  if (status === 400 || status === 403) {
    if (/api key|api_key|permission|credential/i.test(detail)) return "Gemini rejected the API key. Check GEMINI_API_KEY.";
    return `Gemini rejected the request: ${detail.slice(0, 200) || "bad request"}`;
  }
  if (status === 429) return "Gemini quota exceeded. Try again in a few minutes.";
  if (status === 404) return `Gemini model ${GEMINI_MODEL} is unavailable for this API key.`;
  return `Gemini ${status}: ${detail.slice(0, 200) || "request failed"}`;
}

function firstText(payload: unknown): string {
  const candidates = (payload as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates;
  let out = "";
  for (const c of candidates ?? []) for (const part of c.content?.parts ?? []) if (typeof part.text === "string") out += part.text;
  return out.trim();
}

const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const clampScore = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/**
 * Snap a requested window onto real segment boundaries and keep it 15–60 seconds
 * long, so every stored suggestion lies inside the transcript range.
 */
function snapToSegments(rawStart: number, rawEnd: number, segments: Segment[]): { start: number; end: number } | null {
  const starts = [...new Set(segments.map((s) => s.start))].sort((a, b) => a - b);
  const ends = [...new Set(segments.map((s) => s.end))].sort((a, b) => a - b);
  if (!starts.length || !ends.length) return null;

  let best: { start: number; end: number; cost: number } | null = null;
  for (const start of starts) {
    const end = nearestEnd(start, rawEnd, ends);
    if (end === null) continue;
    const cost = Math.abs(start - rawStart) + Math.abs(end - rawEnd);
    if (!best || cost < best.cost) best = { start, end, cost };
  }
  return best ? { start: best.start, end: best.end } : null;
}

function nearestEnd(start: number, rawEnd: number, ends: number[]): number | null {
  const lo = start + MIN_SUGGESTION_SECONDS;
  const hi = start + MAX_SUGGESTION_SECONDS;
  const target = Math.min(Math.max(rawEnd, lo), hi);
  let left = 0;
  let right = ends.length - 1;
  let idx = ends.length;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (ends[mid]! < target) left = mid + 1;
    else {
      idx = mid;
      right = mid - 1;
    }
  }
  const options = [ends[idx - 1], ends[idx]].filter((v): v is number => v !== undefined && v >= lo && v <= hi);
  let best: number | null = null;
  for (const end of options) if (best === null || Math.abs(end - target) < Math.abs(best - target)) best = end;
  return best;
}

/** Validate, clamp and snap whatever the model returned before it reaches the database. */
export function validateSuggestions(raw: unknown, segments: Segment[]): ClipSuggestion[] {
  const clips = (raw as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) throw new Error("Gemini returned an unexpected response. Try again.");
  const out: ClipSuggestion[] = [];
  for (const item of clips) {
    const c = item as Record<string, unknown>;
    const rawStart = asNumber(c["start_s"]);
    const rawEnd = asNumber(c["end_s"]);
    const title = typeof c["title"] === "string" ? c["title"].trim() : "";
    const reason = typeof c["reason"] === "string" ? c["reason"].trim() : "";
    const score = asNumber(c["score"]);
    if (rawStart === null || rawEnd === null || !title) continue;
    const snapped = snapToSegments(rawStart, rawEnd, segments);
    if (!snapped) continue;
    out.push({
      title: title.slice(0, 80),
      start: snapped.start,
      end: snapped.end,
      score: clampScore(score ?? 0),
      reason: reason.slice(0, 240),
    });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

export async function requestClipSuggestions(segments: Segment[], language: string | null): Promise<ClipSuggestion[]> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("Gemini API key is missing. Add GEMINI_API_KEY in project secrets.");

  const transcript = segments
    .map((s) => `[${s.start.toFixed(2)}-${s.end.toFixed(2)}] ${s.text}`)
    .join("\n")
    .slice(0, 120_000);

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${instructionBlock(language)}\n\nTranscript:\n${transcript}` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4,
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const bodyText = await res.text();
  if (!res.ok) throw new Error(geminiError(res.status, bodyText));

  const text = firstText(JSON.parse(bodyText) as unknown);
  if (!text) throw new Error("Gemini returned an empty response. Try again.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON. Try again.");
  }
  return validateSuggestions(parsed, segments);
}
