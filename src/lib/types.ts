export type Segment = { start: number; end: number; text: string };

export type TranscriptResponse = {
  videoId: string;
  language: string;
  segments: Segment[];
  availableLangs?: string[];
  requestedLanguage?: string;
  matchesRequested?: boolean;
};
export type RenderResponse = {
  clipUrl: string;
  key: string;
  bytes: number;
  durationSec: number;
  format: string;
  captionsBurned?: boolean;
  captionCount?: number;
};
export type HealthResult = { ok: boolean; status: number; detail: string };

export type VideoStatus = "queued" | "transcribing" | "ready" | "failed";
export type CandidateStatus =
  | "suggested"
  | "approved"
  | "rejected"
  | "rendering"
  | "rendered"
  | "failed";

export const MAX_CLIP_SECONDS = 180;

export function parseYouTubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] ?? null;
    if (host === "youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
      if (m?.[2]) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

export function isDirectVideo(raw: string): boolean {
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) && /\.(mp4|mov|webm|m4v)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function fmtTime(s: number): string {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Short label for a transcript language code, e.g. "en" → "EN". */
export function langLabel(language: string | null | undefined): string {
  const lang = (language ?? "").trim();
  if (!lang) return "";
  return lang.length <= 3 ? lang.toUpperCase() : lang.charAt(0).toUpperCase() + lang.slice(1);
}

export function friendlyError(msg: string | null | undefined): string {
  if (!msg) return "Something went wrong. Please try again.";
  if (msg.includes("Sign in to confirm you")) return "YouTube blocked this request. Try again in a moment.";
  if (/busy/i.test(msg)) return "Another clip is rendering. It will start right after.";
  if (/unauthori/i.test(msg)) return "Your session expired. Please sign in again.";
  if (/timeout|timed out|aborted/i.test(msg)) return "The service took too long to respond. Please try again.";
  const clean = (msg.split("\n")[0] ?? "").replace(/^Error:\s*/, "");
  return clean.length > 160 ? "Something went wrong. Please try again." : clean;
}
