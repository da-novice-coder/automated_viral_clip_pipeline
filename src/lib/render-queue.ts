import { toast } from "sonner";
import { friendlyError } from "./types";

type Runner = (candidateId: string) => Promise<{ ok: boolean; error?: string }>;

// Browser-side queue: renders strictly one clip at a time.
const pending: string[] = [];
let running = false;
let runner: Runner | null = null;

export function setRenderRunner(fn: Runner) {
  runner = fn;
}

export function enqueueRender(ids: string[]) {
  for (const id of ids) if (!pending.includes(id)) pending.push(id);
  void drain();
}

export function cancelPendingRenders(ids: string[]) {
  for (let i = pending.length - 1; i >= (running ? 1 : 0); i--) {
    if (ids.includes(pending[i] ?? "")) pending.splice(i, 1);
  }
}

async function drain() {
  if (running || !runner) return;
  running = true;
  try {
    while (pending.length) {
      const id = pending[0];
      if (!id) break;
      try {
        const r = await runner(id);
        if (!r.ok) toast.error(friendlyError(r.error));
        else toast.success("Clip rendered");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "busy") {
          await new Promise((res) => setTimeout(res, 8000));
          continue;
        }
        toast.error(friendlyError(msg));
      }
      pending.shift();
    }
  } finally {
    running = false;
  }
}
