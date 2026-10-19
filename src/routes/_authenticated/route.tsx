import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Clapperboard, Home, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { renderClip } from "@/lib/clips.functions";
import { setRenderRunner } from "@/lib/render-queue";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

const tabs = [
  { to: "/dashboard", label: "Videos", icon: Home },
  { to: "/clips", label: "Clip bank", icon: Clapperboard },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AppLayout() {
  const render = useServerFn(renderClip);
  useEffect(() => {
    setRenderRunner((id) => render({ data: { candidateId: id } }));
  }, [render]);

  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-safe backdrop-blur-xl">
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {tabs.map((t) => (
            <li key={t.to}>
              <Link
                to={t.to}
                className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-muted-foreground transition-colors"
                activeProps={{ className: "text-primary" }}
              >
                <t.icon className="size-5" />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
