import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computeHealth } from "@/lib/clips.functions";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Clip Studio" },
      { name: "description", content: "Account and service status for Clip Studio." },
      { property: "og:title", content: "Settings — Clip Studio" },
      { property: "og:description", content: "Account and service status for Clip Studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const health = useServerFn(computeHealth);
  const h = useQuery({ queryKey: ["health"], queryFn: () => health(), retry: false });
  const state = h.isFetching ? "checking" : h.data?.ok ? "online" : "offline";

  return (
    <>
      <PageHeader title="Settings" />
      <div className="divide-y rounded-2xl border bg-card">
        <div className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Account</p>
          <p className="mt-1 truncate font-semibold">{user.email}</p>
        </div>
        <div className="flex items-center gap-3 p-4">
          <span className={cn("size-2.5 rounded-full", state === "online" ? "bg-success" : state === "offline" ? "bg-destructive" : "animate-pulse bg-warning")} />
          <div className="flex-1">
            <p className="font-semibold">Compute service status</p>
            <p className="text-xs capitalize text-muted-foreground">{state}</p>
          </div>
          <Button size="icon" variant="soft" aria-label="Check again" onClick={() => void h.refetch()}>
            <RotateCw className={cn(h.isFetching && "animate-spin")} />
          </Button>
        </div>
        <div className="p-4">
          <Button
            variant="soft"
            className="w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              void navigate({ to: "/auth" });
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </div>
    </>
  );
}
