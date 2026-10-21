import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/app-ui";
import { ClipCard } from "@/components/clip-card";

export const Route = createFileRoute("/_authenticated/clips")({
  head: () => ({
    meta: [
      { title: "Clip bank — Clip Studio" },
      { name: "description", content: "All your rendered vertical clips in one place." },
      { property: "og:title", content: "Clip bank — Clip Studio" },
      { property: "og:description", content: "All your rendered vertical clips in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClipBank,
});

function ClipBank() {
  useRealtime(["clips"], [["clips"]]);
  const q = useQuery({
    queryKey: ["clips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clips").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <PageHeader title="Clip bank" sub={q.data ? `${q.data.length} clips` : undefined} />
      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[9/16] rounded-2xl" />)}</div>
      ) : q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<Clapperboard className="size-8" />} title="Your clip bank is empty" body="Rendered clips from all your videos will show up here." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
           {q.data.map((c) => <ClipCard key={c.id} clip={c} />)}
        </div>
      )}
    </>
  );
}
