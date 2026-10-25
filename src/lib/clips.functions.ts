import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeFetch } from "./compute.server";
import {
  isDirectVideo,
  MAX_CLIP_SECONDS,
  parseYouTubeId,
  type HealthResult,
  type RenderResponse,
  type Segment,
  type TranscriptResponse,
} from "./types";
import type { Json } from "@/integrations/supabase/types";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const addVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ url: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const youtubeId = parseYouTubeId(data.url);
    const direct = !youtubeId && isDirectVideo(data.url);
    if (!youtubeId && !direct) {
      throw new Error("Please paste a YouTube link or a direct .mp4 video link.");
    }
    const title = youtubeId ? `YouTube · ${youtubeId}` : decodeURIComponent(new URL(data.url).pathname.split("/").pop() ?? "Video");
    const { data: row, error } = await context.supabase
      .from("videos")
      .insert({
        user_id: context.userId,
        source_url: data.url,
        youtube_id: youtubeId,
        title,
        status: direct ? "ready" : "queued",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, needsProcessing: !direct };
  });

async function scoreWithAI(segments: Segment[], language?: string | null) {
  const { generateResponse } = await import("@lovable.dev/ai-gateway");
  const lines = segments.map((s) => `[${s.start.toFixed(2)}-${s.end.toFixed(2)}] ${s.text}`).join("\n");
  const res = await generateResponse({
    model: "openai/gpt-6-astra",
    instructions:
      "You are a short-form video editor. From the timestamped transcript, pick 5 to 10 standalone moments that would perform well as vertical clips. Each clip must be 15 to 60 seconds long. Start and end must be snapped to segment boundaries (use a segment's start and a later segment's end exactly). Give a catchy title (max 60 chars), a 0-100 hook score and a one-line reason." +
      (language ? ` The transcript is in ${language}; write every title and reason in ${language}.` : ""),
    input: lines.slice(0, 120_000),
    text: {
      format: {
        type: "json_schema",
        name: "clips",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["clips"],
          properties: {
            clips: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["start", "end", "title", "score", "reason"],
                properties: {
                  start: { type: "number" },
                  end: { type: "number" },
                  title: { type: "string" },
                  score: { type: "integer" },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  });
  let text = "";
  for (const item of (res as { output?: unknown[] }).output ?? []) {
    const it = item as { type?: string; content?: { type?: string; text?: string }[] };
    if (it.type === "message") for (const c of it.content ?? []) if (c.type === "output_text") text += c.text ?? "";
  }
  const parsed = z
    .object({
      clips: z.array(
        z.object({ start: z.number(), end: z.number(), title: z.string(), score: z.number(), reason: z.string() }),
      ),
    })
    .parse(JSON.parse(text));
  const starts = segments.map((s) => s.start);
  const ends = segments.map((s) => s.end);
  const snap = (v: number, arr: number[]) => arr.reduce<number>((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), arr[0] ?? v);
  return parsed.clips
    .map((c) => ({ ...c, start: snap(c.start, starts), end: snap(c.end, ends) }))
    .filter((c) => c.end - c.start >= 10 && c.end - c.start <= 75);
}

export const scoreClips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ videoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: t, error } = await context.supabase
      .from("transcripts")
      .select("segments,language")
      .eq("video_id", data.videoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const segments = (t?.segments ?? []) as unknown as Segment[];
    if (!segments.length) throw new Error("No transcript available for suggestions.");
    const clips = await scoreWithAI(segments, t?.language);
    if (!clips.length) return { count: 0 };
    const { error: insErr } = await context.supabase.from("clip_candidates").insert(
      clips.map((c) => ({
        video_id: data.videoId,
        user_id: context.userId,
        start_s: c.start,
        end_s: c.end,
        title: c.title.slice(0, 80),
        score: Math.max(0, Math.min(100, Math.round(c.score))),
        reason: c.reason.slice(0, 240),
        source: "ai",
        status: "suggested",
      })),
    );
    if (insErr) throw new Error(insErr.message);
    return { count: clips.length };
  });

export const processVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ videoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: v, error } = await sb.from("videos").select("*").eq("id", data.videoId).single();
    if (error) throw new Error(error.message);
    await sb.from("videos").update({ status: "transcribing", error: null }).eq("id", v.id);
    try {
      const tr = await computeFetch<TranscriptResponse>("/transcript", {
        method: "POST",
        body: { url: v.source_url },
        timeoutMs: 180_000,
      });
      if (!Array.isArray(tr.segments) || !tr.segments.length) throw new Error("No speech was found in this video.");
      await sb.from("transcripts").upsert({
        video_id: v.id,
        user_id: context.userId,
        language: tr.language ?? null,
        available_langs: (tr.availableLangs ?? []) as unknown as Json,
        language_matches: tr.matchesRequested ?? null,
        segments: tr.segments as unknown as Json,
      });
      await sb.from("videos").update({ status: "ready", error: null }).eq("id", v.id);
    } catch (e) {
      await sb.from("videos").update({ status: "failed", error: errMsg(e).slice(0, 500) }).eq("id", v.id);
      return { ok: false as const, error: errMsg(e) };
    }
    return { ok: true as const };
  });

export const createManualCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ videoId: z.string().uuid(), start: z.number().min(0), end: z.number().min(0), title: z.string().max(80).optional() })
      .refine((v) => v.end > v.start && v.end - v.start <= MAX_CLIP_SECONDS, "Clips must be 1–180 seconds long.")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("clip_candidates")
      .insert({
        video_id: data.videoId,
        user_id: context.userId,
        start_s: data.start,
        end_s: data.end,
        title: data.title?.trim() || "Manual clip",
        source: "manual",
        status: "approved",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const renderClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ candidateId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // Only one render at a time per account; ignore stale "rendering" rows older than 4 minutes.
    const since = new Date(Date.now() - 4 * 60_000).toISOString();
    const { data: busy } = await sb
      .from("clip_candidates")
      .select("id")
      .eq("status", "rendering")
      .neq("id", data.candidateId)
      .gte("updated_at", since)
      .limit(1);
    if (busy?.length) throw new Error("busy");

    const { data: c, error } = await sb
      .from("clip_candidates")
      .select("*, videos(source_url)")
      .eq("id", data.candidateId)
      .single();
    if (error) throw new Error(error.message);
    const sourceUrl = (c.videos as { source_url: string } | null)?.source_url;
    if (!sourceUrl) throw new Error("Video not found.");

    await sb.from("clip_candidates").update({ status: "rendering", error: null }).eq("id", c.id);
    try {
      const r = await computeFetch<RenderResponse>("/render", {
        method: "POST",
        body: { sourceUrl, start: c.start_s, end: c.end_s, format: "1080x1920" },
        timeoutMs: 170_000,
      });
      const { error: insErr } = await sb.from("clips").insert({
        candidate_id: c.id,
        video_id: c.video_id,
        user_id: context.userId,
        title: c.title,
        clip_url: r.clipUrl,
        r2_key: r.key ?? null,
        bytes: r.bytes ?? null,
        duration_s: r.durationSec ?? c.end_s - c.start_s,
        format: r.format ?? "1080x1920",
      });
      if (insErr) throw new Error(insErr.message);
      await sb.from("clip_candidates").update({ status: "rendered" }).eq("id", c.id);
      return { ok: true as const };
    } catch (e) {
      await sb.from("clip_candidates").update({ status: "failed", error: errMsg(e).slice(0, 500) }).eq("id", c.id);
      return { ok: false as const, error: errMsg(e) };
    }
  });

export const computeHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<HealthResult> => {
    try {
      const r = await computeFetch<Record<string, unknown>>("/health", { method: "GET", timeoutMs: 10_000 });
      return { ok: true, status: 200, detail: JSON.stringify(r).slice(0, 200) };
    } catch (e) {
      return { ok: false, status: 0, detail: errMsg(e).slice(0, 200) };
    }
  });
