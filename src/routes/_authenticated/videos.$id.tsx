import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Clapperboard, Search, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createManualCandidate } from "@/lib/clips.functions";
import { enqueueRender } from "@/lib/render-queue";
import { fmtTime, friendlyError, MAX_CLIP_SECONDS, type Segment } from "@/lib/types";
import { useRealtime } from "@/hooks/use-realtime";
import { usePipeline } from "@/hooks/use-pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, ScoreBadge, StatusChip } from "@/components/app-ui";
import { ClipCard } from "@/components/clip-card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/videos/$id")({
  head: () => ({
    meta: [
      { title: "Video — Clip Studio" },
      { name: "description", content: "Transcript, AI clip suggestions and rendered clips for this video." },
      { property: "og:title", content: "Video — Clip Studio" },
      { property: "og:description", content: "Transcript, AI clip suggestions and rendered clips for this video." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VideoDetail,
});

type Step = "transcript" | "suggestions" | "clips";

function VideoDetail() {
  const { id } = Route.useParams();
  const [step, setStep] = useState<Step>("transcript");
  const { run } = usePipeline();
  useRealtime(["videos", "clip_candidates", "clips"], [["video", id], ["candidates", id], ["vclips", id]]);

  const video = useQuery({
    queryKey: ["video", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("videos").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const steps: { k: Step; label: string }[] = [
    { k: "transcript", label: "Transcript" },
    { k: "suggestions", label: "Suggestions" },
    { k: "clips", label: "Clips" },
  ];

  return (
    <>
      <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Videos
      </Link>
      {video.isLoading ? (
        <Skeleton className="h-16 rounded-2xl" />
      ) : video.isError ? (
        <ErrorState message={(video.error as Error).message} onRetry={() => void video.refetch()} />
      ) : (
        video.data && (
          <div className="mb-5">
            <h1 className="line-clamp-2 text-xl font-semibold">{video.data.title}</h1>
            <div className="mt-2">
              <StatusChip status={video.data.status} />
            </div>
            {video.data.status === "failed" && (
              <div className="mt-3">
                <ErrorState message={video.data.error} onRetry={() => void run(id)} />
              </div>
            )}
          </div>
        )
      )}

      <ol className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-card p-1">
        {steps.map((s, i) => (
          <li key={s.k}>
            <button
              onClick={() => setStep(s.k)}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition",
                step === s.k ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-background/20 text-[10px]">{i + 1}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      {video.data && step === "transcript" && (
        <TranscriptStep videoId={id} status={video.data.status} isDirect={!video.data.youtube_id} onCreated={() => setStep("clips")} />
      )}
      {step === "suggestions" && <SuggestionsStep videoId={id} />}
      {step === "clips" && <ClipsStep videoId={id} />}
    </>
  );
}

function TranscriptStep({ videoId, status, isDirect, onCreated }: { videoId: string; status: string; isDirect: boolean; onCreated: () => void }) {
  const [search, setSearch] = useState("");
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [manualS, setManualS] = useState("0");
  const [manualE, setManualE] = useState("30");
  const create = useServerFn(createManualCandidate);
  const qc = useQueryClient();

  const t = useQuery({
    queryKey: ["transcript", videoId, status],
    enabled: !isDirect,
    queryFn: async () => {
      const { data, error } = await supabase.from("transcripts").select("segments,language").eq("video_id", videoId).maybeSingle();
      if (error) throw error;
      return (data?.segments ?? []) as unknown as Segment[];
    },
  });

  const filtered = useMemo(() => {
    const segs = t.data ?? [];
    const q = search.trim().toLowerCase();
    return segs.map((s, i) => ({ ...s, i })).filter((s) => !q || s.text.toLowerCase().includes(q));
  }, [t.data, search]);

  const segs = t.data ?? [];
  const range = start !== null && end !== null ? { s: segs[Math.min(start, end)].start, e: segs[Math.max(start, end)].end } : null;
  const tooLong = range ? range.e - range.s > MAX_CLIP_SECONDS : false;

  function tap(i: number) {
    if (start === null || end !== null) {
      setStart(i);
      setEnd(null);
    } else setEnd(i);
  }

  async function submit(s: number, e: number) {
    try {
      const r = await create({ data: { videoId, start: s, end: e, title: title || undefined } });
      enqueueRender([r.id]);
      toast.success("Clip queued for rendering");
      setStart(null);
      setEnd(null);
      setTitle("");
      void qc.invalidateQueries({ queryKey: ["candidates", videoId] });
      onCreated();
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  }

  if (isDirect) {
    const s = Number(manualS);
    const e = Number(manualE);
    const valid = Number.isFinite(s) && Number.isFinite(e) && e > s && e - s <= MAX_CLIP_SECONDS;
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Transcripts aren't available for direct video links. Set your clip range in seconds.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold">Start (s)<Input inputMode="decimal" value={manualS} onChange={(ev) => setManualS(ev.target.value)} className="mt-1 h-11" /></label>
          <label className="text-xs font-semibold">End (s)<Input inputMode="decimal" value={manualE} onChange={(ev) => setManualE(ev.target.value)} className="mt-1 h-11" /></label>
        </div>
        <Input placeholder="Clip title (optional)" value={title} onChange={(ev) => setTitle(ev.target.value)} className="h-11" />
        {!valid && <p className="text-xs text-destructive">End must be after start, max {MAX_CLIP_SECONDS} seconds.</p>}
        <Button variant="hero" className="h-11 w-full" disabled={!valid} onClick={() => void submit(s, e)}>
          Create clip
        </Button>
      </div>
    );
  }

  if (status === "queued" || status === "transcribing" || t.isLoading)
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        <p className="pt-2 text-center text-xs text-muted-foreground">Transcribing… this updates live.</p>
      </div>
    );
  if (t.isError) return <ErrorState message={(t.error as Error).message} onRetry={() => void t.refetch()} />;
  if (!segs.length) return <EmptyState icon={<Search className="size-8" />} title="No transcript" body="This video has no transcript yet." />;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search transcript" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl pl-10" />
      </div>
      <p className="text-xs text-muted-foreground">
        {start === null ? "Tap a line to set the clip start." : end === null ? "Now tap a line to set the end." : "Range picked."}
      </p>
      <ul className="max-h-[55vh] space-y-1 overflow-y-auto rounded-2xl border bg-card p-1.5">
        {filtered.map((s) => {
          const lo = start !== null ? Math.min(start, end ?? start) : -1;
          const hi = start !== null ? Math.max(start, end ?? start) : -1;
          const inRange = s.i >= lo && s.i <= hi;
          return (
            <li key={s.i}>
              <button
                onClick={() => tap(s.i)}
                className={cn("flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition", inRange ? "bg-primary/15" : "hover:bg-muted")}
              >
                <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-primary">{fmtTime(s.start)}</span>
                <span className="leading-snug">{s.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {range && (
        <div className="sticky bottom-24 space-y-2 rounded-2xl border bg-card p-3 shadow-glow">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold tabular-nums">
              {fmtTime(range.s)} – {fmtTime(range.e)} · {Math.round(range.e - range.s)}s
            </span>
            <button onClick={() => { setStart(null); setEnd(null); }} aria-label="Clear" className="text-muted-foreground">
              <X className="size-4" />
            </button>
          </div>
          {tooLong ? (
            <p className="text-xs text-destructive">Clips can be at most {MAX_CLIP_SECONDS} seconds.</p>
          ) : (
            <>
              <Input placeholder="Clip title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" />
              <Button variant="hero" className="h-11 w-full" onClick={() => void submit(range.s, range.e)}>
                Create clip
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionsStep({ videoId }: { videoId: string }) {
  const q = useQuery({
    queryKey: ["candidates", videoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clip_candidates")
        .select("*")
        .eq("video_id", videoId)
        .order("score", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  async function setStatus(id: string, status: "approved" | "rejected") {
    const { error } = await supabase.from("clip_candidates").update({ status }).eq("id", id);
    if (error) toast.error(friendlyError(error.message));
    return !error;
  }

  if (q.isLoading) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  const items = q.data ?? [];
  const approved = items.filter((c) => c.status === "approved");
  if (!items.length)
    return <EmptyState icon={<Sparkles className="size-8" />} title="No suggestions yet" body="AI suggestions appear here once the transcript is ready." />;

  return (
    <div className="space-y-3">
      <Button variant="hero" className="h-11 w-full" disabled={!approved.length} onClick={() => { enqueueRender(approved.map((c) => c.id)); toast.success(`${approved.length} clip(s) queued`); }}>
        Render all approved ({approved.length})
      </Button>
      {items.map((c) => (
        <article key={c.id} className={cn("rounded-2xl border bg-card p-4", c.status === "rejected" && "opacity-50")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{c.title}</p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {fmtTime(c.start_s)} – {fmtTime(c.end_s)} · {Math.round(c.end_s - c.start_s)}s · {c.source === "ai" ? "AI" : "Manual"}
              </p>
            </div>
            {c.source === "ai" && <ScoreBadge score={c.score} />}
          </div>
          {c.reason && <p className="mt-2 text-sm text-muted-foreground">{c.reason}</p>}
          <div className="mt-3 flex items-center gap-2">
            <StatusChip status={c.status} />
            <div className="ml-auto flex gap-2">
              {(c.status === "suggested" || c.status === "approved" || c.status === "failed" || c.status === "rejected") && (
                <>
                  {c.status !== "rejected" && (
                    <Button size="sm" variant="soft" onClick={() => void setStatus(c.id, "rejected")}>
                      <X /> Reject
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="hero"
                    onClick={async () => {
                      if (await setStatus(c.id, "approved")) {
                        enqueueRender([c.id]);
                        toast.success("Queued for rendering");
                      }
                    }}
                  >
                    <Check /> {c.status === "failed" ? "Retry" : "Approve & render"}
                  </Button>
                </>
              )}
            </div>
          </div>
          {c.status === "failed" && c.error && <p className="mt-2 text-xs text-destructive">{friendlyError(c.error)}</p>}
        </article>
      ))}
    </div>
  );
}

function ClipsStep({ videoId }: { videoId: string }) {
  const q = useQuery({
    queryKey: ["vclips", videoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clips").select("*").eq("video_id", videoId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <div className="grid grid-cols-2 gap-3">{[0, 1].map((i) => <Skeleton key={i} className="aspect-[9/16] rounded-2xl" />)}</div>;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  if (!q.data?.length)
    return <EmptyState icon={<Clapperboard className="size-8" />} title="No clips yet" body="Approve a suggestion or pick a range — rendered clips land here." />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {q.data.map((c) => <ClipCard key={c.id} clip={c} />)}
    </div>
  );
}
