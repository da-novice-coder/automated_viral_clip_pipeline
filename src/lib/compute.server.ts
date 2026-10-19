// Server-only helper for the compute service. Never imported by browser code.
export async function computeFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const base = process.env["COMPUTE_BASE_URL"]?.replace(/\/+$/, "");
  if (!base) throw new Error("Compute service is not configured.");
  const token = process.env["COMPUTE_TOKEN"];
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 120_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { error?: string; message?: string; detail?: string };
      detail = j.error ?? j.message ?? j.detail ?? text;
    } catch {
      /* not json */
    }
    throw new Error(`Compute ${res.status}: ${String(detail).slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
