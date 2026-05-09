## Problem

Sarah's playback sounds robotic and unnatural on both the recommendation and the draft email. Two root causes:

1. **Voice settings are off for narration.** Current `style: 0.3` with `stability: 0.55` on `eleven_multilingual_v2` makes Sarah over-emote and mis-pace, especially on legal/formal text. ElevenLabs' own guidance for narration is `stability 0.5–0.7`, `similarity_boost 0.75`, `style 0` (style >0 is the main cause of "weird tone").
2. **Bilingual text trips the model.** The draft email is `English (中文翻译)` with Chinese in parentheses. The model tries to read the brackets and code-switches mid-sentence, producing the choppy/odd prosody. The recommendation in zh mode also mixes punctuation styles.

## Fix

### 1. Tune TTS voice settings (`src/routes/api/tts.ts`)
- `stability: 0.6`
- `similarity_boost: 0.8`
- `style: 0` (remove exaggeration — biggest win)
- `use_speaker_boost: true`
- Keep model `eleven_multilingual_v2` (best for EN+中文 mix).
- Accept an optional `language` hint from the client so we can pick voice settings per language later if needed.

### 2. Pre-process text before sending to ElevenLabs
Add a small `prepareTtsText(text, mode)` helper used by `PlayAudioButton` (or done server-side in `/api/tts`). It will:
- Collapse multiple blank lines and normalize whitespace.
- Replace markdown artifacts (`**`, `__`, backticks, leading `- `, `#`) with plain text.
- Normalize punctuation: convert Chinese full-width punctuation `，。！？：；` to ASCII when surrounding text is English, and vice-versa, so prosody breaks land correctly.
- For the draft email specifically: strip the `(中文翻译)` parenthetical translations when the UI language is English, and strip the English when the UI language is Chinese. This single change removes the main source of choppiness.

### 3. Pass UI language to TTS
- `PlayAudioButton` will read `i18n.language` and send `{ text, language: 'en' | 'zh' }` to `/api/tts`.
- Server uses `language` to (a) decide which side of the bilingual content to keep and (b) leave model selection unchanged for now.

### 4. Single-instance playback safety (small polish)
`PlayAudioButton` already manages its own audio element, but two different cards (recommendation + email) can play simultaneously. Add a tiny module-level "current audio" registry so starting one playback pauses any other. Prevents the "two voices at once" overlap noted in the shared-pattern hint.

## Out of scope (ask before doing)
- Switching to `eleven_turbo_v2_5` or `eleven_v3`.
- Splitting long text into chunks with request stitching.
- Adding a per-card volume/speed slider.

## Files touched
- `src/routes/api/tts.ts` — voice settings, accept `language`, optional bilingual stripping.
- `src/components/PlayAudioButton.tsx` — send `language`, share a single active-audio ref across instances.
- (Optional) `src/lib/tts-text.ts` — new helper for text normalization / bilingual stripping, imported by the server route.

No DB, auth, or schema changes. ElevenLabs connector key already configured.
