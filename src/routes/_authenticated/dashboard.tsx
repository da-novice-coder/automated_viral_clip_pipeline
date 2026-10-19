import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Film, Link2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addVideo, processVideo, scoreClips } from "@/lib/clips.functions";
import { friendlyError } from "@/lib/types";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader, StatusChip } from "@/components/app-ui";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Videos — Clip Studio" },
      { name: "description", content: "Add YouTube videos and track their clip status." },
      { property: "og:title", content: "Videos — Clip Studio" },
      { property: "og:description", content: "Add YouTube videos and track their clip status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

export function usePipeline() {
  const add = useServerFn(addVideo);
  const process = useServerFn(processVideo);
  const score = useServerFn(scoreClips);
  async function run(videoId: string) {
    const r = await process({ data: { videoId } });
    if (!r.ok) {
      toast.error(friendlyError(r.error));
      return;
    }
    toast.success("Transcript ready — finding the best moments…");
    try {
      const s = await score({ data: { videoId } });
      toast.success(`${s.count} clip suggestions ready`);
    } catch (e) {
      toast.error(friendlyError(e instanceof Error ? e.message : String(e)));
    }
  }
  return { add, run };
}

function Dashboard() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const { add, run } = usePipeline();
  useRealtime(["videos"], [["videos"]]);

  const q = useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("id,title,source_url,status,error,created_at,youtube_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      const r = await add({ data: { url: url.trim() } });
      setUrl("");
      void qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success(r.needsProcessing ? "Video added — transcribing…" : "Video added — pick your clip range");
      if (r.needsProcessing) void run(r.id);
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Videos" sub="Long videos in. Vertical clips out." />
      <form onSubmit={submit} className="rounded-3xl border bg-card p-4 shadow-glow">
        <p className="mb-3 font-display font-semibold">Add video</p>
        <div className="relative">
          <Link2 className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="YouTube URL or .mp4 link"
            inputMode="url"
            className="h-12 rounded-xl pl-10"
          />
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <Button type="submit" variant="hero" className="h-11" disabled={busy || !url.trim()}>
            {busy ? "Adding…" : "Add video"}
          </Button>
          <Button type="button" variant="soft" className="h-11" disabled title="Coming soon">
            <Upload /> Upload · Soon
          </Button>
        </div>
      </form>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your videos</h2>
        {q.isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : q.isError ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState icon={<Film className="size-8" />} title="No videos yet" body="Paste a YouTube link above to get your first clips." />
        ) : (
          q.data.map((v) => (
            <div key={v.id} className="rounded-2xl border bg-card">
              <Link to="/videos/$id" params={{ id: v.id }} className="flex items-center gap-3 p-3">
                <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {v.youtube_id ? (
                    <img src={`https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg`} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <Film className="size-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{v.title ?? v.source_url}</p>
                  <div className="mt-1.5">
                    <StatusChip status={v.status} />
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              {v.status === "failed" && (
                <div className="px-3 pb-3">
                  <ErrorState message={v.error} onRetry={() => void run(v.id)} />
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </>
  );
}
