# RefundRights

AI legal assistant for travel refund disputes in Southeast Asia.

## Nebius × NVIDIA hackathon compliance
- **Inference platform:** Nebius Token Factory — `https://api.tokenfactory.nebius.com/v1/chat/completions`
- **NVIDIA open model:** `nvidia/nemotron-3-super-120b-a12b` (Nemotron 3 Super)
- **Where:** `supabase/functions/analyze-dispute/index.ts`. A multi-agent prompt (Evidence, Legal, Finance, Localization agents) is grounded with live sources from Bright Data and Tavily. Nemotron returns structured output through function calling: risk level, recommendation, leverage points, and a bilingual complaint email.
- The model name is stored with every analysis (`dispute_analyses.model`).
