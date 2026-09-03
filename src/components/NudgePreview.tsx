"use client";

import { useState } from "react";

/** The customer-facing message the agent wrote. Drafted, not sent — see the README. */
export function NudgePreview({
  channel,
  message,
  linkUrl,
}: {
  channel: string | null;
  message: string;
  linkUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Message to the customer</h2>
          <p className="mt-1 text-xs text-muted">
            Written by the agent · {channel ?? "email"} · drafted, not sent
          </p>
        </div>
        <button
          onClick={copy}
          className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent/40 hover:text-accent"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-5 py-4 font-sans text-sm leading-relaxed">
        {message}
      </pre>

      {linkUrl && (
        <div className="border-t border-border px-5 py-4">
          <div className="text-xs text-muted">Razorpay payment link</div>
          <a
            href={linkUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block break-all font-mono text-xs text-accent hover:underline"
          >
            {linkUrl}
          </a>
        </div>
      )}
    </div>
  );
}
