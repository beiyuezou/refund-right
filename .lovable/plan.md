## Plan: Upgrade analyze-dispute to multi-agent expert framework

The user wants to replace the current "basic assistant" system prompt in `supabase/functions/analyze-dispute/index.ts` with a "professional multi-agent grade" framework. **They did not paste the framework text** — the message says "this integrated expert framework" but no content follows.

I need that text before I can implement. I also need a couple of structural decisions, because a multi-agent framework typically implies more than just a longer prompt.

### Questions I need answered

1. **The framework text itself** — please paste the full system prompt / framework you want to use. Without it I can't write the upgrade. If it's long, you can paste it as `@/tmp/framework.txt` content or just inline.

Use the following logic for the system prompt:  
"You are an integrated Multi-Agent Orchestrator. Act as a panel of experts:  


- EVIDENCE AGENT: Extract booking IDs, names, timelines, and amounts with precision.
- LEGAL AGENT: Cite specific SE Asia consumer laws (e.g. Thailand CPA, Singapore CPFTA) and call out deceptive platform behaviors.
- FINANCE/INSURANCE AGENT: Identify coverage triggers and propose a clear escalation path (Platform -> Bank/Chargeback -> Regulatory Body).
- UX/LOCALIZATION: If user language is 'zh', output recommendations in professional Chinese, and provide the 'Appeal Email Draft' in Bilingual format (English with Chinese translations in brackets). If 'en', use full English."
  &nbsp;

1. **Single-prompt vs true multi-agent** — "multi-agent" can mean two very different things:
  - **(A) One enriched prompt** that *describes* multiple expert roles (legal analyst + negotiation strategist + evidence auditor) and asks the model to reason as if it were a panel. One AI call, same latency/cost. Easiest, lowest risk.
  - **(B) Real multi-agent pipeline** — sequential AI calls: e.g. Agent 1 extracts facts → Agent 2 cites jurisdiction-specific law → Agent 3 drafts strategy → Agent 4 writes the email. Higher quality, ~3–4× slower and more expensive per analysis.

Structure: Choose (A) One enriched prompt. I want the latency to remain low and the process to be simple. Simulate the multi-agent reasoning within a single call.

&nbsp;

1. **Output schema changes** — the current `produce_analysis` tool returns `risk_level`, `confidence`, `recommendation`, `leverage_points[]`, `draft_email`. Should the upgraded framework:
  - **Keep the same schema** (just deeper reasoning behind the same fields), or
  - **Add new fields** (e.g. `evidence_gaps`, `cited_statutes[]`, `escalation_timeline[]`, `counter_arguments[]`)?
   New fields require updating `dispute_analyses` storage and the `/analysis/$disputeId` UI to render them.

. Output Schema: Keep the same schema. Do not add new fields to the database. Instead, pack the higher-quality reasoning, the bilingual email, and the specific legal citations into the existing `recommendation`, `leverage_points[]`, and `draft_email` fields.

1. **Model** — current default is `google/gemini-3-flash-preview` (fast, cheap). A heavier prompt usually benefits from a stronger reasoning model:
  - Stay on `gemini-3-flash-preview` (fastest, cheapest)
  - Upgrade to `google/gemini-2.5-pro` (best Gemini reasoning)
  - Upgrade to `openai/gpt-5` (top-tier reasoning, slower & more expensive)

Stay on google/gemini-3-flash-preview. It’s fast and cost-effective for this demo.  
Please update the edge function and the UI prompt now based on these choices.

Please paste the framework and answer the four questions, then I'll come back with a concrete implementation plan (files to touch, schema migration if needed, UI updates).

**Ask me any questions you need in order to fully understand what I want from this feature and how I envision it.**

&nbsp;