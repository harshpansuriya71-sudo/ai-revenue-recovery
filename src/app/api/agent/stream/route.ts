import { runAgentOnPayment, type AgentEvent } from "@/lib/agent/run";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Streams the agent's work as Server-Sent Events.
 *
 * The non-streaming /api/agent/run stays as-is for batch use; this exists so the UI can show
 * the agent reasoning step by step instead of a spinner followed by a finished log.
 */
export async function GET(req: Request) {
  const paymentId = new URL(req.url).searchParams.get("paymentId");
  if (!paymentId) {
    return new Response("paymentId is required", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // If the viewer navigates away mid-run, stop writing into a dead controller.
      req.signal.addEventListener("abort", () => {
        closed = true;
      });

      try {
        await runAgentOnPayment(paymentId, send);
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!closed) {
          controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Without this some proxies buffer the whole stream and the live view arrives at once.
      "x-accel-buffering": "no",
    },
  });
}
