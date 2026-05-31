// Public proxy route that performs Bright Data Browser API (CDP-over-WebSocket)
// scraping from the Cloudflare Worker runtime.
//
// Why this exists: the Supabase Edge Function runtime (Deno) cannot complete
// the TLS handshake to brd.superproxy.io:9222 — Deno's WebSocket declares
// h2/h3 ALPN and the Bright Data edge returns a fatal NoApplicationProtocol
// alert. Cloudflare Workers' fetch-based WebSocket upgrade uses standard
// HTTP/1.1 and works reliably.
//
// Security:
// - Only URLs in a hard-coded allowlist are scraped (SSRF guard).
// - Caller must present x-proxy-secret matching BRIGHT_DATA_BROWSER_PASSWORD
//   (which is already a server-only secret shared by the edge function).
// - All Bright Data credentials are read from process.env on the Worker side
//   and never leave it.

import { createFileRoute } from "@tanstack/react-router";

type SourceSlug = "trip" | "sg_cccs";

const SOURCE_URLS: Record<SourceSlug, string> = {
  trip: "https://www.trip.com/customerservice/refund-policy",
  sg_cccs:
    "https://www.cccs.gov.sg/legislation/consumer-protection-fair-trading-act",
};

const NAV_TIMEOUT_MS = 25_000;
const TOTAL_TIMEOUT_MS = 50_000;

type CdpResponse = {
  id?: number;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
  sessionId?: string;
  params?: Record<string, unknown>;
};

async function scrape(
  targetUrl: string,
  customer: string,
  zone: string,
  password: string,
): Promise<{ html: string; rawBytes: number }> {
  const cdpUrl = `https://brd-customer-${customer}-zone-${zone}:${password}@brd.superproxy.io:9222/`;

  const resp = await fetch(cdpUrl, {
    headers: { Upgrade: "websocket" },
  });

  // deno-lint-ignore no-explicit-any
  const ws = (resp as any).webSocket as WebSocket | null;
  if (!ws) {
    throw new Error(
      `no_websocket: status=${resp.status} body=${(await resp.text()).slice(0, 200)}`,
    );
  }
  // deno-lint-ignore no-explicit-any
  (ws as any).accept();

  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  let sessionId: string | null = null;
  let loaded = false;

  ws.addEventListener("message", (ev: MessageEvent) => {
    let msg: CdpResponse;
    try {
      msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
    } catch {
      return;
    }
    if (typeof msg.id === "number" && pending.has(msg.id)) {
      const slot = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(JSON.stringify(msg.error)));
      else slot.resolve(msg.result);
      return;
    }
    if (msg.method === "Page.loadEventFired") loaded = true;
  });

  const send = (
    method: string,
    params: Record<string, unknown> = {},
    withSession = false,
  ): Promise<unknown> => {
    const id = ++nextId;
    const out: Record<string, unknown> = { id, method, params };
    if (withSession && sessionId) out.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify(out));
    });
  };

  try {
    const created = (await send("Target.createTarget", {
      url: "about:blank",
    })) as { targetId: string };

    const attached = (await send("Target.attachToTarget", {
      targetId: created.targetId,
      flatten: true,
    })) as { sessionId: string };
    sessionId = attached.sessionId;

    await send("Page.enable", {}, true);
    await send("Page.navigate", { url: targetUrl }, true);

    const start = Date.now();
    while (!loaded && Date.now() - start < NAV_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 200));
    }
    // Extra hydration window for SPA frameworks (React/Vue render after load).
    await new Promise((r) => setTimeout(r, 2500));

    const evalResult = (await send(
      "Runtime.evaluate",
      {
        expression: "document.documentElement.outerHTML",
        returnByValue: true,
      },
      true,
    )) as { result?: { value?: string } };

    const html = evalResult?.result?.value ?? "";
    return { html, rawBytes: html.length };
  } finally {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
}

export const Route = createFileRoute("/api/public/scrape-browser")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedSecret = process.env.BRIGHT_DATA_BROWSER_PASSWORD;
        const customer = process.env.BRIGHT_DATA_CUSTOMER_ID;
        const zone = process.env.BRIGHT_DATA_BROWSER_ZONE;

        if (!expectedSecret || !customer || !zone) {
          return Response.json(
            { error: "browser_not_configured" },
            { status: 503 },
          );
        }

        const presented = request.headers.get("x-proxy-secret");
        if (!presented || presented !== expectedSecret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { source?: string; url?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "bad_json" }, { status: 400 });
        }

        const source = body.source as SourceSlug | undefined;
        if (!source || !(source in SOURCE_URLS)) {
          return Response.json({ error: "invalid_source" }, { status: 400 });
        }
        const expectedUrl = SOURCE_URLS[source];
        if (body.url && body.url !== expectedUrl) {
          return Response.json({ error: "url_mismatch" }, { status: 400 });
        }

        try {
          const result = await Promise.race([
            scrape(expectedUrl, customer, zone, expectedSecret),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("total_timeout")),
                TOTAL_TIMEOUT_MS,
              ),
            ),
          ]);
          return Response.json({
            html: result.html,
            raw_bytes: result.rawBytes,
            mode: "scraping_browser_cf",
          });
        } catch (err) {
          const message = (err as Error)?.message ?? "unknown";
          console.error("[scrape-browser] failed", source, message);
          return Response.json(
            { error: "scrape_failed", reason: message.slice(0, 300) },
            { status: 502 },
          );
        }
      },
    },
  },
});