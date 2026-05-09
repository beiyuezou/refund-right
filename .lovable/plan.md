## Root cause

ElevenLabs Scribe v2 rejects `cmn` with HTTP 400 (`invalid_language_code`). The supported codes do not include `cmn`; for Mandarin we must send `zho` (Cantonese would be `yue`). The 502 surfaced in the UI is the proxy error from `src/routes/api/transcribe-audio.ts` after the upstream 400.

The connector itself works (key reaches ElevenLabs and returns a structured ElevenLabs error), so no reconnect is needed.

## Fix

Single change in `src/components/VoiceInputButton.tsx` usage in `src/routes/claim.$category.tsx`:

- Map `i18n.language` to ElevenLabs ISO 639-3 codes:
  - `zh*` → `zho` (was `cmn`)
  - default → `eng`

Also harden `src/routes/api/transcribe-audio.ts`:
- Forward upstream error message in the JSON response (and keep 502 on network failures, but propagate ElevenLabs `detail.message` when available) so future failures surface the real cause in the toast/console instead of a generic "Transcription failed".

No schema, connector, or auth changes required.

## Files touched

- `src/routes/claim.$category.tsx` — change `cmn` → `zho`.
- `src/routes/api/transcribe-audio.ts` — pass through ElevenLabs error detail.

## Verification

After patch, retry "Dictate" in Chinese on `/claim/hotel`; expect a 200 with transcript text. English path was already valid (`eng`) and continues to work.
