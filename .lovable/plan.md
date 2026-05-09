## ElevenLabs integration: voice intake + bilingual TTS playback

Add two ElevenLabs-powered features to RefundRight using the ElevenLabs connector for credentials.

### 1. Voice intake on the claim form (Scribe v2 STT)

On `src/routes/claim.$category.tsx`, add a mic button next to the **story** textarea.
- Tap-to-record using `MediaRecorder` (webm/opus), tap again to stop.
- Sends the audio blob to a new server function `transcribe-audio` (TanStack server route under `src/routes/api/`) that proxies to ElevenLabs `/v1/speech-to-text` with `model_id=scribe_v2`, `diarize=false`, `tag_audio_events=false`, and `language_code` derived from the current `i18n.language` (`zh` → `cmn`, else `eng`; omit for auto-detect if user picks "Auto").
- Returned transcript is appended to the existing story textarea (not replaced) so users can dictate multiple times.
- Loading state on the mic button; toast on error; mic permission prompt handled gracefully.

### 2. "Listen to your draft" on the analysis page (TTS)

On `src/routes/analysis.$disputeId.tsx`, add a **▶ Listen** button in the draft-email card and a smaller one on the recommendation card.
- Calls a new server route `tts` that proxies to ElevenLabs `/v1/text-to-speech/{voiceId}?output_format=mp3_44100_128`, returns raw MP3 bytes.
- Voice: **Sarah** (`EXAVITQu4vr4xnSDxMaL`) — authoritative female, multilingual.
- Model: `eleven_multilingual_v2` so the bilingual EN + [中文] email reads naturally in both languages.
- Client plays via `new Audio(URL.createObjectURL(blob))`; UI toggles ▶ Play / ⏸ Pause / ⏹ Stop with a thin progress bar.
- Cache the generated blob per analysis id in component state so replays don't re-hit the API.

### Auth & secrets

- Use the **ElevenLabs connector** (direct API, not gateway). After connect, `ELEVENLABS_API_KEY` is available as an env var to server functions.
- All ElevenLabs calls happen server-side only; the key is never exposed to the browser.

### Files to add

- `src/routes/api/transcribe-audio.ts` — POST, accepts multipart `audio` file + optional `language`, returns `{ text }`.
- `src/routes/api/tts.ts` — POST, accepts `{ text, voiceId? }`, streams MP3 back.
- `src/components/VoiceInputButton.tsx` — reusable mic-record button used in the claim form.
- `src/components/PlayAudioButton.tsx` — reusable play/pause button used in the analysis page.

### Files to edit

- `src/routes/claim.$category.tsx` — mount `VoiceInputButton` next to the story textarea.
- `src/routes/analysis.$disputeId.tsx` — mount `PlayAudioButton` on draft-email and recommendation cards.
- `src/lib/i18n.ts` — add strings: `voice.record`, `voice.recording`, `voice.transcribing`, `voice.error`, `voice.listen`, `voice.pause`, `voice.stop`, in EN + 中文.

### Out of scope (not building now)

- Conversational voice agent (#3 from the proposal).
- Voice picker UI — Sarah is hard-coded; can be added later.
- Storing generated audio in Supabase Storage (kept ephemeral in memory).

### Open question I'll resolve at build time

The connector flow will be triggered first via `standard_connectors--connect` with `connector_id: elevenlabs`. If for any reason that connection doesn't expose `ELEVENLABS_API_KEY` to the runtime, I'll fall back to asking you to add it as a secret.
