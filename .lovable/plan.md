## Goal
Before running the multi-agent legal analysis, fetch the latest refund policy of the relevant OTA (Agoda / Booking.com / Trip.com / 飞猪 / 携程 / 去哪儿 …) via Bright Data Web Unlocker, cache it for 7 days, and feed it to Gemini as Ground Truth context. If retrieval fails, degrade gracefully to the cached copy (even if stale), and never break analysis.

---

## 1. Database (one migration)

**New table `public.ota_rules_cache`**
- `id uuid pk`
- `ota_name text not null` (canonical slug: `agoda`, `booking`, `trip`, `fliggy`, `ctrip`, `qunar`, …)
- `source_url text not null`
- `raw_content text not null` (truncated to ~40 KB before storage)
- `content_hash text not null` (sha256 of raw_content; used to detect real changes)
- `fetched_at timestamptz default now()`
- `updated_at timestamptz default now()` (only bumped when hash changes)
- Unique index `(ota_name, source_url)`
- Index `(ota_name, fetched_at desc)`

**RLS**: enable, no policies for `anon`/`authenticated` (server-only read via `supabaseAdmin` / service role in the edge function). GRANT `ALL` to `service_role` only.

**Audit**: extend `AuditAction` union in `src/lib/audit.server.ts` with:
- `bright_data.fetch_triggered`
- `bright_data.fetch_succeeded`
- `bright_data.fetch_failed`
- `bright_data.cache_hit`

(Edge function writes directly to `audit_logs` with `admin` client — matches the existing pattern.)

---

## 2. Secrets

Request via `add_secret`:
- `BRIGHT_DATA_API_KEY`
- `BRIGHT_DATA_ZONE_ID`

Read **only** via `Deno.env.get(...)` inside the edge function. Never hardcoded, never exposed to the client.

---

## 3. Backend — `supabase/functions/_shared/bright-data-service.ts`

A self-contained server helper (placed in `_shared/` so the edge function imports it).

**Exports**

```ts
detectOtaFromStory(story: string): { ota: OtaSlug; url: string } | null
fetchOtaRules(ota: OtaSlug, url: string, admin: SupabaseClient): Promise<{
  content: string;
  source: "live" | "cache" | "stale_cache" | "none";
}>
```

**OTA allowlist (single source of truth, prevents SSRF)**

A hardcoded map. Only entries in this map are ever fetched. User input never controls the URL.

```
agoda    → https://www.agoda.com/info/cancellation-policy.html
booking  → https://www.booking.com/content/cancellation.html
trip     → https://www.trip.com/customerservice/refund-policy
fliggy   → https://help.fliggy.com/hc/category/...
ctrip    → https://vacations.ctrip.com/...
qunar    → https://help.qunar.com/...
klook    → https://www.klook.com/.../refund-policy/
```

**Detection** is plain keyword matching against `story` (case-insensitive, supports both English and Chinese aliases: `携程/Ctrip`, `飞猪/Fliggy`, etc.). First match wins.

**Fetch flow**

```text
1. SELECT from ota_rules_cache WHERE ota_name=? ORDER BY fetched_at DESC LIMIT 1
2. If row exists AND fetched_at > now() - 7 days:
     → audit: bright_data.cache_hit; return { content, source: "cache" }
3. audit: bright_data.fetch_triggered
4. POST https://api.brightdata.com/request
     Authorization: Bearer ${BRIGHT_DATA_API_KEY}
     body: { zone: ZONE_ID, url, format: "raw" }
     AbortController, timeout 12s
5. On 200:
     - strip HTML → plain text, truncate to 40 KB
     - hash = sha256(text)
     - if row exists and hash === row.hash → just bump fetched_at
     - else upsert new row
     - audit: bright_data.fetch_succeeded
     - return { content, source: "live" }
6. On non-2xx / timeout / 429 / network error:
     - console.error full detail server-side ONLY
     - audit: bright_data.fetch_failed with { status, ota }
     - if any cached row exists (even >7d): return { content, source: "stale_cache" }
     - else: return { content: "", source: "none" }
```

**SSRF guards inside `fetchOtaRules`**
- `ota` must be a key of the allowlist; otherwise return `{ source: "none" }`.
- The `url` argument is ignored in favor of `ALLOWLIST[ota]` — caller cannot inject arbitrary URLs.
- Final URL is parsed; only `https:` + host in the allowlist's hostname set is permitted.

---

## 4. Extend `supabase/functions/analyze-dispute/index.ts`

Insertion point: **after** loading the dispute and setting status `analyzing`, **before** building the AI prompt.

```ts
const detected = detectOtaFromStory(dispute.story);
let groundTruth = "";
let groundTruthMeta: { ota?: string; source: string } = { source: "none" };

if (detected) {
  const res = await fetchOtaRules(detected.ota, detected.url, admin);
  groundTruth = res.content;
  groundTruthMeta = { ota: detected.ota, source: res.source };
}
```

- Pass `groundTruth` + `groundTruthMeta.ota` into `buildUserPrompt` as a new section:
  > `### REFERENCE — Latest published refund policy of {ota} (retrieved {today}): """ ... """ Use this as ground truth; cite it where applicable. Do NOT invent clauses not present in this text.`
- Persist `groundTruthMeta` into `dispute_analyses.metadata` (or extend the `audit_logs.metadata` for `analysis.run`) so we can trace which OTA source informed each analysis.
- Rate-limiting, RLS, auth flow are unchanged.

---

## 5. Frontend — shimmer state

`src/routes/claim.$category.tsx`

The current submit flow already calls `supabase.functions.invoke("analyze-dispute", …)` once and navigates on completion. The Bright Data fetch happens inside that call, so the existing single-call UX is unchanged — what we add is richer waiting UI:

- During `submitting`, replace the small spinner row inside step 3's submit button area with a full-card **Shimmer panel** (animated skeleton bars using existing Tailwind `animate-pulse` + a subtle gradient). The panel cycles through 3 i18n status lines on a 2.5s interval:
  1. `wizard.analyzeStep1` — “正在保存案件资料…” / “Saving your case…”
  2. `wizard.analyzeStep2` — “正在实时检索该 OTA 平台的最新退款政策以确保分析准确性…” / “Fetching the latest refund policy from the relevant OTA platform for accurate analysis…”
  3. `wizard.analyzeStep3` — “多智能体正在合成法律分析…” / “Multi-agent legal synthesis in progress…”
- Add the three keys to `src/lib/i18n.ts` (en + zh).
- No new server round-trip is needed for the rotation; it's purely a UI affordance.

---

## 6. Security checklist (enforced)

| Risk | Mitigation |
|------|-----------|
| SSRF via user-controlled URL | Hardcoded allowlist; user input never reaches Bright Data |
| Secret leak | `Deno.env.get` only; never logged; never returned to client |
| Bright Data error message leak | Generic 502/503 path is irrelevant because we fall back to cache; only `console.error` carries detail |
| Cache poisoning | Only the edge function (service role) writes; RLS denies all other roles |
| Token in audit metadata | Audit `metadata` stores only `{ ota, source, status }` — never URLs with tokens or response bodies |

Adheres to existing security memory rules: generic client errors, server-side logging, no internal terminology in client-visible messages.

---

## 7. Order of execution (once approved)

1. `add_secret` for `BRIGHT_DATA_API_KEY` + `BRIGHT_DATA_ZONE_ID` — wait for user to populate.
2. Migration: create `ota_rules_cache` with GRANTs + RLS.
3. Add `supabase/functions/_shared/bright-data-service.ts`.
4. Patch `supabase/functions/analyze-dispute/index.ts` (detect → fetch → inject into prompt → persist metadata).
5. Extend `AuditAction` union in `src/lib/audit.server.ts`.
6. Add i18n keys + shimmer panel in `src/routes/claim.$category.tsx`.
7. Deploy `analyze-dispute`; smoke-test with `curl_edge_functions`.
8. Update `@security-memory` with the new Bright Data rules (allowlist-only, server-only secrets, fallback to stale cache).

---

## Open questions (none blocking)
The four design choices you confirmed (Web Unlocker, extend existing function, keyword match, 7-day TTL) cover all ambiguity. If during implementation the Bright Data Web Unlocker response format differs from `{ body: html }`, I’ll adapt parsing without changing the contract above.
