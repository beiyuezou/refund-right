# AGENTS.md
- Dispute analysis AI runs on Nebius Token Factory (OpenAI-compatible) with an NVIDIA Nemotron model, key `NEBIUS_API_KEY`, in `supabase/functions/analyze-dispute` — required by the Nebius × NVIDIA hackathon rules.
- Each analysis run produces one English master row; other report languages are translation rows (`parent_analysis_id`) that must keep the master's verdict, confidence and argument count — keeps EN/ZH results consistent.
