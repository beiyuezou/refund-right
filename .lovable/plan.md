## Goal

Make sensitive evidence/dispute actions traceable in `audit_logs` by capturing three new events that the current pipeline misses.

## Current state

`audit_logs` already records `evidence.upload` (final registration via `validateAndRegisterEvidence`) and `evidence.rejected`. Missing:

- Staging uploads — done client-side via `supabase.storage.upload`, never logged.
- Evidence removals — done client-side via `supabase.storage.remove`, never logged.
- Dispute creation — `disputes` row inserted client-side, no audit row.

Audit writes need the service-role key, so they must come from a server function.

## Changes

### 1. New audit action types (`src/lib/audit.server.ts`)
Extend `AuditAction` with:
- `evidence.staged`
- `evidence.removed`
- `dispute.created`

### 2. New server functions (`src/lib/evidence.functions.ts`)
Add two thin, auth-protected server fns that only write audit rows (no storage side effects, RLS already governs the actual storage object):

- `logEvidenceStaged({ storage_path, file_name, mime_type, size_bytes })` — verifies `storage_path` starts with `${userId}/`, then `logEvent({ action: "evidence.staged", metadata: { path, mime, size } })`.
- `logEvidenceRemoved({ storage_path, file_name, was_finalized })` — same path-scope check, then `logEvent({ action: "evidence.removed", metadata: { path, file_name, was_finalized } })`.

Both capture `user-agent` via `getRequestHeader` for parity with TTS/STT logs.

### 3. New server function (`src/lib/analysis.functions.ts` or new `src/lib/dispute.functions.ts`)
Add `logDisputeCreated({ dispute_id, category, country })` — auth-protected, writes `dispute.created` with `resourceType: "disputes"`, `resourceId: dispute_id`.

(Lightweight log-only fn — keeps dispute insert on the client to avoid restructuring the wizard.)

### 4. Wire into `src/routes/claim.$category.tsx`
- After successful staging upload in `uploadOne` → fire `logEvidenceStaged` (best-effort, no UI block).
- After successful storage `remove` in `removeFile` → fire `logEvidenceRemoved` (best-effort).
- After successful `disputes.insert` in `submit` → fire `logDisputeCreated` before navigating.

All three calls are awaited only inside small helpers and never block the user flow on failure (matches existing best-effort audit pattern).

## Out of scope

- Moving dispute insert or storage upload to the server.
- Changes to the analyze-dispute edge function audit (already logs `analysis.run`).
- Admin UI for browsing audit logs.
- The three security findings shown in the security view.