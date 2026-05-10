## Fix: Hide internal billing message from end users

**Problem:** `supabase/functions/analyze-dispute/index.ts` returns `"AI credits exhausted. Add credits in Settings → Workspace → Usage."` on HTTP 402, which `src/routes/claim.$category.tsx` shows verbatim in a toast.

**Changes:**

1. `supabase/functions/analyze-dispute/index.ts` (402 branch)
   - Replace the user-facing message with a generic one and change status to 503:
     ```ts
     console.error("[analyze-dispute] AI gateway 402 — credits exhausted");
     return json({ error: "Analysis service is temporarily unavailable. Please try again later.", code: "service_unavailable" }, 503);
     ```
   - Keep the real reason in `console.error` only (server-side).

2. `src/routes/claim.$category.tsx`
   - Toast already surfaces `error` from the response; no logic change needed, but ensure it falls back to the i18n generic error string if `error` is missing. (No new copy needed — the new generic message is already safe to display.)

3. Mark security finding `ai_credits_leak` as fixed via `security--manage_security_finding` and update `@security-memory` with a new rule: *"Edge functions must never expose internal billing/credit/workspace terminology in client-visible error bodies; log specifics server-side, return generic messages."*

**Out of scope:** Other edge function error messages, the rate-limit 429 message (already generic), unrelated security findings.
