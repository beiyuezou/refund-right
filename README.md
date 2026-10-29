# RefundRights

AI legal assistant for travel refund disputes in Southeast Asia.

## Nebius × NVIDIA hackathon compliance
- **Inference platform:** Nebius Token Factory — `https://api.tokenfactory.nebius.com/v1/chat/completions`
- **NVIDIA open models (tiered):**
  - `nvidia/nemotron-3-super-120b-a12b` (Nemotron 3 Super) — main multi-agent legal analysis (reasoning-heavy).
  - `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (Nemotron 3 Nano) — fast report translation; automatically falls back to Super if output is invalid or untranslated.
- **Track:** Best Apps and Agents.

```text
Traveler -> RefundRights app -> analyze-dispute function
   -> Tavily + Bright Data (live legal / platform policy sources)
   -> Nebius Token Factory -> Nemotron 3 Super (English master analysis)
   -> Nebius Token Factory -> Nemotron 3 Nano  (translation, same verdict & confidence)
```
- **Where:** `supabase/functions/analyze-dispute/index.ts`. A multi-agent prompt (Evidence, Legal, Finance, Localization agents) is grounded with live sources from Bright Data and Tavily. Nemotron returns structured output through function calling: risk level, recommendation, leverage points, and a bilingual complaint email.
- The model name is stored with every analysis (`dispute_analyses.model`).

## Configuration
All credentials are server-side secrets (never committed). See `SECURITY.md` and `.env.example`.

| Secret | Used for | Where to get it |
|---|---|---|
| `NEBIUS_API_KEY` | Nemotron analysis & translation | Nebius Token Factory console |
| `TAVILY_API_KEY` | Live legal/policy search | tavily.com dashboard |
| `BRIGHT_DATA_*` | Fetching platform policy & official law pages | Bright Data control panel (Web Unlocker / Browser API zones) |
| `SCRAPE_PROXY_URL` | URL of your deployed `/api/public/scrape-browser` route | Your deployment |
| `ELEVENLABS_API_KEY` | Read-aloud and voice input | ElevenLabs dashboard |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV` | One-time report unlock (Sandbox by default) | PayPal Developer dashboard |
| `SPECIAL_UNLOCK_CODE` | Optional promo unlock code | Choose your own |
