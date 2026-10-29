# AGENTS.md
- Dispute analysis AI runs on Nebius Token Factory (OpenAI-compatible) with an NVIDIA Nemotron model, key `NEBIUS_API_KEY`, in `supabase/functions/analyze-dispute` — required by the Nebius × NVIDIA hackathon rules.
- Each analysis run produces one English master row; other report languages are translation rows (`parent_analysis_id`) that must keep the master's verdict, confidence and argument count — keeps EN/ZH results consistent.
- Full report content (recommendation, arguments, email, sources) is served only via `getAnalysisReport` server fn, redacted until `disputes.paid`; browsers cannot select those columns and only service_role can set `paid` — keeps the paywall server-enforced.
- Special unlock code is checked only server-side (`redeemSpecialCode`, secret `SPECIAL_UNLOCK_CODE`, limits in `special_code_settings` via atomic `redeem_special_code`) and sets the same `disputes.paid` flag as PayPal — one unlock path for the report.
