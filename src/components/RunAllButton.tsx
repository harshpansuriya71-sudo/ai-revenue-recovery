"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Works a batch of pending cases in sequence. Sequential rather than parallel on purpose:
 * the free-tier model has a per-minute request limit, and a burst of parallel runs trips it
 * mid-demo.
 */
export function RunAllButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runBatch() {
    setError(null);
    const res = await fetch("/api/cases/pending");
    const { paymentIds } = (await res.json()) as { paymentIds: string[] };
    const batch = paymentIds.slice(0, 10);
    setProgress({ done: 0, total: batch.length });

    for (let i = 0; i < batch.length; i++) {
      try {
        const r = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ paymentId: batch[i] }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `Agent run failed (${r.status})`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        break;
      }
      setProgress({ done: i + 1, total: batch.length });
      router.refresh();
    }

    setProgress(null);
    router.refresh();
  }

  if (!pending) return null;

  return (
    <div className="text-right">
      <button
        onClick={runBatch}
        disabled={Boolean(progress)}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {progress ? `Working ${progress.done}/${progress.total}…` : `Work ${Math.min(pending, 10)} cases`}
      </button>
      {error && <p className="mt-2 max-w-xs text-xs text-danger">{error}</p>}
    </div>
  );
}
