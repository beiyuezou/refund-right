## Goal

Harden RefundRight with rate limiting, strict upload validation, audit logging, production-safe error handling, and polish the AI voice-appeal playback into a calm, professional experience.

## 1. Per-user DB rate limiting

New table `rate_limit_events(user_id, action, created_at)` with index on `(user_id, action, created_at)`. RLS: users can only `select` their own; inserts done by server fns only.

New helper `src/lib/rate-limit.server.ts` exposing `checkAndRecord(userId, action, max, windowSec)` using `supabaseAdmin` to count rows in window then insert. Returns `{ ok, retryAfter }`.

Limits applied:
- `tts`: 30 / 5 min per user
- `stt`: 20 / 5 min
- `analyze`: 10 / hour
- `evidence_upload`: 50 / hour

Wired into:
- `src/routes/api/tts.ts` and `transcribe-audio.ts` after auth check → return 429 with `Retry-After` header.
- `supabase/functions/analyze-dispute/index.ts` after auth → 429.
- Evidence upload: new `createServerFn` `recordEvidenceUploadAttempt` called before each `supabase.storage.from("evidence").upload(...)` in `claim.$category.tsx`.

A nightly cleanup is out of scope; rows are cheap and queries are windowed.

## 2. Strict upload validation

Client (`claim.$category.tsx`):
- Whitelist MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
- Max 10 MB, max 10 files (existing).
- Reject extension mismatch and zero-byte files. Show single i18n error per rejection.

Server-side enforcement: new `createServerFn` `validateAndRegisterEvidence` that:
1. Re-checks RLS-bound user.
2. Calls rate limiter.
3. Reads first 16 bytes of the uploaded object via `supabaseAdmin.storage.from("evidence").download()` and verifies magic bytes (`%PDF`, `\xFF\xD8\xFF`, `\x89PNG`, `RIFF...WEBP`). If mismatch → delete object and throw.
4. Inserts into `dispute_evidence`.

`claim.$category.tsx` switches from raw insert into `dispute_evidence` to calling this server fn after the storage upload.

## 3. Audit logging

New table `audit_logs(id, user_id, action, resource_type, resource_id, ip, user_agent, metadata jsonb, created_at)`. RLS: users can `select` own rows; inserts only via service role (server fns).

Helper `src/lib/audit.server.ts` `logEvent({ userId, action, ... })` using `supabaseAdmin` and `getRequestIP` / `getRequestHeader("user-agent")`.

Events logged:
- `auth.login_success` / `auth.login_failure` (in `src/routes/auth.tsx` flow via a server fn).
- `analysis.run`, `analysis.edit_draft`
- `evidence.upload`, `evidence.delete`
- `tts.call`, `stt.call` (only outcome + size, never text content)
- `rate_limit.exceeded`, `validation.rejected`

## 4. Production-safe error handling

- Add `src/lib/errors.server.ts` with `toClientError(err)` returning generic `{ error: "Request failed", code }` and logging the real error with a request id.
- All `Response.json({ error: ... })` in `src/routes/api/*` and `supabase/functions/analyze-dispute/index.ts` use this. Strip ElevenLabs / Gemini upstream messages (already partial) and any `err.stack`.
- Add a route-level `errorComponent` on `src/routes/__root.tsx` (and analysis route) that shows a friendly card + "Try again" button instead of raw stack.
- Toasts on the client display only translated generic copy; details go to console in dev only (`if (import.meta.env.DEV)`).

## 5. Voice UX — polished playback (`PlayAudioButton.tsx`)

Refactor into `AudioPlayer` component with:
- Play / pause / restart buttons, calm icon set.
- Animated waveform-style progress bar bound to `audio.currentTime / duration` (CSS gradient + `requestAnimationFrame`).
- Speed control chip group: 0.9× / 1× / 1.1× (sets `audio.playbackRate`).
- Soft fade-in / fade-out using `audio.volume` ramp on play/pause.
- Subtle shimmer skeleton during the loading state (replaces spinner-only).
- Tone tweaks: TTS `voice_settings.stability` 0.7, slightly slower default; loading toast removed (state is visible inline).
- New i18n keys: `voice.restart`, `voice.speed`, `voice.ready`.

Used everywhere the current `PlayAudioButton` is mounted; no API contract change.

## 6. Security findings

After implementation, mark these scanner findings as fixed via `manage_security_finding`:
- Upload validation gap
- Missing rate limiting on TTS/STT/analyze (note: documented as ad-hoc)
- Internal error disclosure
- Missing audit trail

Update `security--update_memory` to record: upload whitelist, rate-limit windows, audit-log scope, generic error policy.

## Technical notes

- Two new tables (`rate_limit_events`, `audit_logs`) with RLS; one server-only insert path each (`supabaseAdmin`).
- Rate-limit + audit helpers live under `*.server.ts` so import-protection blocks them from client bundles.
- Magic-byte validation done server-side using `supabaseAdmin.storage.download()` then `.slice(0,16).arrayBuffer()`.
- `audit_logs.metadata` is `jsonb` and never stores raw user content (no email body, no transcripts).
- All new server fns wrapped with `requireSupabaseAuth`.

## Out of scope

- WAF / IP-level rate limiting (no backend primitive).
- Antivirus scanning of uploads.
- Admin UI for viewing audit logs.
- Refactoring analyze-dispute Edge Function into a TanStack server fn.