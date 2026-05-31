// Bright Data Web Unlocker integration for fetching OTA refund policies as
// Ground Truth context for the AI legal analysis.
//
// Security:
// - Only URLs in the hardcoded ALLOWLIST are ever fetched (SSRF guard).
// - Secrets read from Deno.env only; never logged or returned to client.
// - On failure, falls back to cached copy (even if stale); never breaks
//   the analysis pipeline.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export type OtaSlug =
  | "agoda"
  | "booking"
  | "trip"
  | "fliggy"
  | "ctrip"
  | "qunar"
  | "klook"
  | "sg_case"
  | "sg_cccs";

type AllowEntry = { url: string; aliases: string[] };

// Single source of truth. URL is canonical; aliases are case-insensitive
// keyword matches against the user's story (EN + ZH).
const ALLOWLIST: Record<OtaSlug, AllowEntry> = {
  agoda: {
    url: "https://www.agoda.com/info/cancellation-policy.html",
    aliases: ["agoda", "雅高达"],
  },
  booking: {
    url: "https://www.booking.com/content/cancellation.html",
    aliases: ["booking.com", "缤客"],
  },
  trip: {
    url: "https://www.trip.com/customerservice/refund-policy",
    aliases: ["trip.com", "携程国际", "trip平台"],
  },
  fliggy: {
    url: "https://help.fliggy.com/hc/category/help_index",
    aliases: ["fliggy", "飞猪"],
  },
  ctrip: {
    url: "https://vacations.ctrip.com/about/refund.html",
    aliases: ["ctrip", "携程"],
  },
  qunar: {
    url: "https://help.qunar.com/",
    aliases: ["qunar", "去哪儿", "去哪网"],
  },
  klook: {
    url: "https://www.klook.com/en-US/policy/cancellation/",
    aliases: ["klook", "客路"],
  },
  // Singapore legal / consumer-protection ground truth sources.
  // These are matched by country (see detectLegalSources), not by story alias,
  // so the aliases array is intentionally empty.
  sg_case: {
    url: "https://www.case.org.sg/consumer_guides/",
    aliases: [],
  },
  sg_cccs: {
    url: "https://www.cccs.gov.sg/legislation/consumer-protection-fair-trading-act",
    aliases: [],
  },
};

const ALLOWED_HOSTS = new Set(
  Object.values(ALLOWLIST).map((e) => new URL(e.url).hostname),
);

const CACHE_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days
const FETCH_TIMEOUT_MS = 45_000;
const MAX_CONTENT_BYTES = 40_000;
const BROWSER_TIMEOUT_MS = 55_000;

// Cloudflare Worker route that runs the actual CDP-over-WebSocket call.
// Stable URL: doesn't change if project is renamed.
const SCRAPE_PROXY_URL =
  "https://project--0412ac6b-e839-45ea-9be0-9b1c096baf21.lovable.app/api/public/scrape-browser";

// Sources that are JS-rendered SPAs and need a real headless browser
// (Bright Data Scraping Browser via CDP) instead of Web Unlocker.
const BROWSER_SOURCES: Set<OtaSlug> = new Set(["trip", "sg_cccs"]);

export function detectOtaFromStory(
  story: string,
): { ota: OtaSlug; url: string } | null {
  if (!story) return null;
  const lower = story.toLowerCase();
  for (const [slug, entry] of Object.entries(ALLOWLIST) as [
    OtaSlug,
    AllowEntry,
  ][]) {
    if (entry.aliases.length === 0) continue; // skip legal-only sources
    for (const alias of entry.aliases) {
      if (lower.includes(alias.toLowerCase())) {
        return { ota: slug, url: entry.url };
      }
    }
  }
  return null;
}

// Map dispute.country -> legal source slugs to fetch in addition to any OTA.
const LEGAL_SOURCES_BY_COUNTRY: Record<string, OtaSlug[]> = {
  singapore: ["sg_case", "sg_cccs"],
  sg: ["sg_case", "sg_cccs"],
};

export function detectLegalSources(
  country: string | null | undefined,
): { slug: OtaSlug; url: string }[] {
  if (!country) return [];
  const key = country.trim().toLowerCase();
  const slugs = LEGAL_SOURCES_BY_COUNTRY[key];
  if (!slugs) return [];
  return slugs.map((s) => ({ slug: s, url: ALLOWLIST[s].url }));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function audit(
  admin: SupabaseClient,
  userId: string | null,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from("audit_logs").insert({
      user_id: userId,
      action,
      resource_type: "ota_rules_cache",
      metadata,
    });
  } catch (err) {
    console.error("[bright-data] audit insert failed", err);
  }
}

export type FetchResult = {
  content: string;
  source: "live" | "cache" | "stale_cache" | "none";
};

export async function fetchOtaRules(
  ota: OtaSlug,
  _requestedUrl: string,
  admin: SupabaseClient,
  userId: string | null,
): Promise<FetchResult> {
  // SSRF guard: caller-provided URL is IGNORED; we always use the allowlist URL.
  const entry = ALLOWLIST[ota];
  if (!entry) return { content: "", source: "none" };

  let target: URL;
  try {
    target = new URL(entry.url);
  } catch {
    return { content: "", source: "none" };
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return { content: "", source: "none" };
  }

  // 1. Lookup latest cached row.
  const { data: cached } = await admin
    .from("ota_rules_cache")
    .select("raw_content, content_hash, fetched_at")
    .eq("ota_name", ota)
    .eq("source_url", target.toString())
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = Date.now();
  if (cached) {
    const age = now - new Date(cached.fetched_at as string).getTime();
    if (age < CACHE_TTL_MS) {
      await audit(admin, userId, "bright_data.cache_hit", {
        ota,
        age_hours: Math.round(age / 3600_000),
      });
      return { content: cached.raw_content as string, source: "cache" };
    }
  }

  // 2. Cache miss / stale → call Bright Data Web Unlocker.
  const apiKey = Deno.env.get("BRIGHT_DATA_API_KEY");
  const zone = Deno.env.get("BRIGHT_DATA_ZONE_ID");

  if (!apiKey || !zone) {
    console.error("[bright-data] missing BRIGHT_DATA_API_KEY or ZONE_ID");
    if (cached) {
      await audit(admin, userId, "bright_data.fetch_failed", {
        ota,
        reason: "not_configured",
      });
      return { content: cached.raw_content as string, source: "stale_cache" };
    }
    return { content: "", source: "none" };
  }

  const useBrowser = BROWSER_SOURCES.has(ota);
  await audit(admin, userId, "bright_data.fetch_triggered", {
    ota,
    mode: useBrowser ? "scraping_browser" : "web_unlocker",
  });

  if (useBrowser) {
    return await fetchViaScrapingBrowser(ota, target, admin, userId, cached);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        zone,
        url: target.toString(),
        format: "raw",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let errBody = "";
      try { errBody = (await res.text()).slice(0, 500); } catch { /* ignore */ }
      console.error(
        `[bright-data] upstream ${res.status} for ${ota}: ${errBody}`,
      );
      await audit(admin, userId, "bright_data.fetch_failed", {
        ota,
        status: res.status,
        body_preview: errBody,
      });
      if (cached) {
        return { content: cached.raw_content as string, source: "stale_cache" };
      }
      return { content: "", source: "none" };
    }

    const raw = await res.text();
    const text = stripHtml(raw).slice(0, MAX_CONTENT_BYTES);
    if (!text) {
      if (cached) {
        return { content: cached.raw_content as string, source: "stale_cache" };
      }
      return { content: "", source: "none" };
    }

    const hash = await sha256Hex(text);

    if (cached && cached.content_hash === hash) {
      // Same content; just refresh fetched_at.
      await admin
        .from("ota_rules_cache")
        .update({ fetched_at: new Date().toISOString() })
        .eq("ota_name", ota)
        .eq("source_url", target.toString());
    } else {
      await admin
        .from("ota_rules_cache")
        .upsert(
          {
            ota_name: ota,
            source_url: target.toString(),
            raw_content: text,
            content_hash: hash,
            fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ota_name,source_url" },
        );
    }

    await audit(admin, userId, "bright_data.fetch_succeeded", {
      ota,
      bytes: text.length,
      changed: !cached || cached.content_hash !== hash,
    });

    return { content: text, source: "live" };
  } catch (err) {
    console.error(`[bright-data] fetch error for ${ota}`, err);
    await audit(admin, userId, "bright_data.fetch_failed", {
      ota,
      reason: (err as Error)?.name === "AbortError" ? "timeout" : "network",
    });
    if (cached) {
      return { content: cached.raw_content as string, source: "stale_cache" };
    }
    return { content: "", source: "none" };
  } finally {
    clearTimeout(timer);
  }
}

// --------------------------------------------------------------------------
// Scraping Browser path (CDP over WebSocket) for JS-rendered SPA sources.
// --------------------------------------------------------------------------

type CachedRow =
  | { raw_content: string; content_hash: string; fetched_at: string }
  | null;

async function fetchViaScrapingBrowser(
  ota: OtaSlug,
  target: URL,
  admin: SupabaseClient,
  userId: string | null,
  cached: CachedRow,
): Promise<FetchResult> {
  const customer = Deno.env.get("BRIGHT_DATA_CUSTOMER_ID");
  const browserZone = Deno.env.get("BRIGHT_DATA_BROWSER_ZONE");
  const browserPwd = Deno.env.get("BRIGHT_DATA_BROWSER_PASSWORD");

  if (!customer || !browserZone || !browserPwd) {
    console.error("[bright-data] scraping browser not configured");
    await audit(admin, userId, "bright_data.fetch_failed", {
      ota,
      reason: "browser_not_configured",
    });
    if (cached) {
      return { content: cached.raw_content, source: "stale_cache" };
    }
    return { content: "", source: "none" };
  }

  const wsUrl =
    `wss://brd-customer-${customer}-zone-${browserZone}:${browserPwd}` +
    `@brd.superproxy.io:9222`;

  let ws: WebSocket | null = null;
  let timer: number | undefined;

  try {
    const html = await new Promise<string>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("browser_timeout")),
        BROWSER_TIMEOUT_MS,
      ) as unknown as number;

      ws = new WebSocket(wsUrl);
      let nextId = 0;
      const pending = new Map<
        number,
        { resolve: (v: unknown) => void; reject: (e: Error) => void }
      >();
      let sessionId: string | null = null;
      let loaded = false;

      const send = (
        method: string,
        params: Record<string, unknown> = {},
        withSession = false,
      ) => {
        const id = ++nextId;
        const msg: Record<string, unknown> = { id, method, params };
        if (withSession && sessionId) msg.sessionId = sessionId;
        return new Promise<unknown>((res, rej) => {
          pending.set(id, { resolve: res, reject: rej });
          ws!.send(JSON.stringify(msg));
        });
      };

      ws.onerror = (ev) => reject(new Error(`ws_error: ${String((ev as ErrorEvent).message ?? "unknown")}`));
      ws.onclose = () => {
        if (!loaded) reject(new Error("ws_closed_early"));
      };

      ws.onmessage = async (ev) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        if (typeof data.id === "number" && pending.has(data.id)) {
          const { resolve: r, reject: j } = pending.get(data.id)!;
          pending.delete(data.id);
          if (data.error) j(new Error(JSON.stringify(data.error)));
          else r(data.result);
          return;
        }
        if (data.method === "Page.loadEventFired") {
          loaded = true;
        }
      };

      ws.onopen = async () => {
        try {
          // 1. Create page target
          const created = (await send("Target.createTarget", {
            url: "about:blank",
          })) as { targetId: string };

          // 2. Attach (flattened — session messages return via top-level ws)
          const attached = (await send("Target.attachToTarget", {
            targetId: created.targetId,
            flatten: true,
          })) as { sessionId: string };
          sessionId = attached.sessionId;

          // 3. Enable Page domain so we get loadEventFired
          await send("Page.enable", {}, true);

          // 4. Navigate
          await send("Page.navigate", { url: target.toString() }, true);

          // 5. Wait for load event (or fall through after a soft delay)
          const start = Date.now();
          while (!loaded && Date.now() - start < 30_000) {
            await new Promise((r) => setTimeout(r, 200));
          }
          // Extra hydration time for SPA frameworks
          await new Promise((r) => setTimeout(r, 2500));

          // 6. Grab outerHTML
          const result = (await send(
            "Runtime.evaluate",
            {
              expression: "document.documentElement.outerHTML",
              returnByValue: true,
            },
            true,
          )) as { result?: { value?: string } };

          const html = result?.result?.value ?? "";
          resolve(html);
        } catch (err) {
          reject(err as Error);
        }
      };
    });

    const text = stripHtml(html).slice(0, MAX_CONTENT_BYTES);
    if (!text) {
      await audit(admin, userId, "bright_data.fetch_failed", {
        ota,
        mode: "scraping_browser",
        reason: "empty_after_strip",
        raw_bytes: html.length,
      });
      if (cached) return { content: cached.raw_content, source: "stale_cache" };
      return { content: "", source: "none" };
    }

    const hash = await sha256Hex(text);
    if (cached && cached.content_hash === hash) {
      await admin
        .from("ota_rules_cache")
        .update({ fetched_at: new Date().toISOString() })
        .eq("ota_name", ota)
        .eq("source_url", target.toString());
    } else {
      await admin.from("ota_rules_cache").upsert(
        {
          ota_name: ota,
          source_url: target.toString(),
          raw_content: text,
          content_hash: hash,
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ota_name,source_url" },
      );
    }

    await audit(admin, userId, "bright_data.fetch_succeeded", {
      ota,
      mode: "scraping_browser",
      bytes: text.length,
      raw_bytes: html.length,
      changed: !cached || cached.content_hash !== hash,
    });

    return { content: text, source: "live" };
  } catch (err) {
    console.error(`[bright-data] scraping browser error for ${ota}`, err);
    await audit(admin, userId, "bright_data.fetch_failed", {
      ota,
      mode: "scraping_browser",
      reason: (err as Error)?.message?.slice(0, 200) ?? "unknown",
    });
    if (cached) return { content: cached.raw_content, source: "stale_cache" };
    return { content: "", source: "none" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  }
}