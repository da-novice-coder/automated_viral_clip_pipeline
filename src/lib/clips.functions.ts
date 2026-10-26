import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeFetch } from "./compute.server";
import { requestClipSuggestions } from "./gemini.server";
import {
  isDirectVideo,
  MAX_CLIP_SECONDS,
  parseYouTubeId,
  type HealthResult,
  type RenderResponse,
  type Segment,
  type TranscriptResponse,
} from "./types";
import type { Database, Json } from "@/integrations/supabase/types";

type Sb = SupabaseClient<Database>;

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

async function fetchTranscript(sourceUrl: string): Promise<TranscriptResponse> {
  const tr = await computeFetch<TranscriptResponse>("/transcript", {
    method: "POST",
    // No `lang` field: the compute service defaults to English captions.
    body: { url: sourceUrl },
    timeoutMs: 180_000,
  });
  if (!Array.isArray(tr.segments) || !tr.segments.length) throw new Error("No speech was found in this video.");
  return tr;
}

async function saveTranscript(sb: Sb, userId: string, videoId: string, tr: TranscriptResponse) {
  const { error } = await sb.from("transcripts").upsert({
    video_id: videoId,
    user_id: userId,
    language: tr.language ?? tr.requestedLanguage ?? null,
    available_langs: tr.availableLangs ?? null,
    language_matches: tr.matchesRequested ?? true,
    segments: tr.segments as unknown as Json,
  });
  if (error) throw new Error(error.message);
}

/**
 * Scores the saved transcript with Gemini and stores the suggestions. Failures are
 * saved on the video row so the video page can show them and offer a retry.
 */
async function scoreAndSave(sb: Sb, userId: string, videoId: string): Promise<{ count: number; error: string | null }> {
  const { data: t, error } = await sb.from("transcripts").select("segments,language").eq("video_id", videoId).maybeSingle();
  if (error) return { count: 0, error: error.message };
  const segments = (t?.segments ?? []) as unknown as Segment[];
  if (!segments.length) return { count: 0, error: "No transcript available for suggestions." };
  try {
    const clips = await requestClipSuggestions(segments, t?.language ?? null);
    if (!clips.length) throw new Error("Gemini didn't return any usable moments. Try again.");
    const { error: insErr } = await sb.from("clip_candidates").insert(
      clips.map((c) => ({
        video_id: videoId,
        user_id: userId,
        start_s: c.start,
        end_s: c.end,
        title: c.title,
        score: c.score,
        reason: c.reason,
        source: "ai",
        status: "suggested",
      })),
    );
    if (insErr) throw new Error(insErr.message);
    await sb.from("videos").update({ error: null }).eq("id", videoId);
    return { count: clips.length, error: null };
  } catch (e) {
    const message = errMsg(e).slice(0, 500);
    await sb.from("videos").update({ error: message }).eq("id", videoId);
    return { count: 0, error: message };
  }
}

export const scoreClips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ videoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => scoreAndSave(context.supabase, context.userId, data.videoId));

export const processVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ videoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: v, error } = await sb.from("videos").select("*").eq("id", data.videoId).single();
    if (error) throw new Error(error.message);
    await sb.from("videos").update({ status: "transcribing", error: null }).eq("id", v.id);
    try {
      const tr = await fetchTranscript(v.source_url);
      await saveTranscript(sb, context.userId, v.id, tr);
      await sb.from("videos").update({ status: "ready", error: null }).eq("id", v.id);
    } catch (e) {
      await sb.from("videos").update({ status: "failed", error: errMsg(e).slice(0, 500) }).eq("id", v.id);
      return { ok: false as const, error: errMsg(e) };
    }
    return { ok: true as const };
  });

/** Fetches the transcript again, replaces it, then rescoring only the suggestions that are not rendered. */
export const refetchTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ videoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: v, error } = await sb.from("videos").select("*").eq("id", data.videoId).single();
    if (error) throw new Error(error.message);
    try {
      const tr = await fetchTranscript(v.source_url);
      await saveTranscript(sb, context.userId, v.id, tr);
      const { error: delErr } = await sb
        .from("clip_candidates")
        .delete()
        .eq("video_id", v.id)
        .eq("source", "ai")
        .not("status", "in", "(rendered,rendering)");
      if (delErr) throw new Error(delErr.message);
      await sb.from("videos").update({ status: "ready", error: null }).eq("id", v.id);
    } catch (e) {
      return { ok: false as const, error: errMsg(e) };
    }
    const scored = await scoreAndSave(sb, context.userId, v.id);
    return { ok: true as const, count: scored.count, error: scored.error };
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
  .inputValidator((d) => z.object({ candidateId: z.string().uuid(), captions: z.boolean().optional() }).parse(d))
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
      const captions = data.captions === true ? await captionsForClip(sb, c.video_id, c.start_s, c.end_s) : [];
      const r = await computeFetch<RenderResponse>("/render", {
        method: "POST",
        body: {
          sourceUrl,
          start: c.start_s,
          end: c.end_s,
          format: "1080x1920",
          ...(captions.length ? { captions } : {}),
        },
        timeoutMs: 170_000,
      });
      const base = {
        candidate_id: c.id,
        video_id: c.video_id,
        user_id: context.userId,
        title: c.title,
        clip_url: r.clipUrl,
        r2_key: r.key ?? null,
        bytes: r.bytes ?? null,
        duration_s: r.durationSec ?? c.end_s - c.start_s,
        format: r.format ?? "1080x1920",
      };
      const { error: firstErr } = await sb
        .from("clips")
        .insert({ ...base, captions_burned: Boolean(r.captionsBurned) });
      // Tolerate a project where the captions_burned migration has not been applied yet.
      const { error: insErr } = firstErr && /captions_burned/i.test(firstErr.message)
        ? await sb.from("clips").insert(base)
        : { error: firstErr };
      if (insErr) throw new Error(insErr.message);
      await sb.from("clip_candidates").update({ status: "rendered" }).eq("id", c.id);
      return { ok: true as const };
    } catch (e) {
      await sb.from("clip_candidates").update({ status: "failed", error: errMsg(e).slice(0, 500) }).eq("id", c.id);
      return { ok: false as const, error: errMsg(e) };
    }
  });

/** Transcript segments overlapping the clip, in original source-video seconds. */
async function captionsForClip(sb: Sb, videoId: string, startS: number, endS: number) {
  const { data: t } = await sb.from("transcripts").select("segments").eq("video_id", videoId).maybeSingle();
  const segments = (t?.segments ?? []) as unknown as Segment[];
  return segments
    .filter((s) => s.end > startS && s.start < endS)
    .map((s) => ({ start: s.start, end: s.end, text: s.text }));
}

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
