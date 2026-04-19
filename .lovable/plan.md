# RefundRight — Build Plan

A premium-feeling, mobile-first legal-tech tool for SE Asia travelers, with real AI analysis, accounts, and a focused SE Asia knowledge base.

## Design system

- **Palette**: Navy `#1E293B` (primary), Action Orange `#F97316` (accent/CTA), white surfaces, slate grays for text, soft red/amber/green for risk levels.
- **Typography**: Clean sans-serif (Inter), generous spacing, professional/legal tone — no playful elements.
- **Layout**: Mobile-first, max-width containers, sticky header, large tap targets, subtle shadows and rounded-xl cards.

## Pages & routes

- `/` — Home (header, hero, dispute categories, how it works, trust strip, footer)
- `/claim/$category` — Claim Wizard (3 steps, progress bar, back/next navigation)
- `/analysis/$disputeId` — AI Strategy Dashboard (risk gauge, recommendation, draft complaint)
- `/dashboard` — User's past disputes (auth required)
- `/knowledge` — SE Asia knowledge base index
- `/knowledge/$slug` — Individual articles (Thai hotel deposits, Singapore booking disputes, Malaysian flight delays, etc.)
- `/auth` — Sign in / sign up (email + password)

## Home page

1. **Header**: "RefundRight" wordmark with shield icon, nav (Knowledge, Sign in), prominent orange "Report Dispute" button.
2. **Hero**: Headline "Don't let them keep your money.", subtext, primary CTA, secondary "How it works" link, trust badges row ("AI-powered • SE Asia focused • Free to start").
3. **Dispute Categories Grid**: 3 cards with icons — Hotel Issues, Flight Disruptions, Insurance Traps. Each card → starts wizard for that category.
4. **How it works**: 3-step strip (Tell us → AI analyzes → Get your draft complaint).
5. **Knowledge teaser**: 3 featured SE Asia articles linking to `/knowledge`.
6. **Footer**: Disclaimer ("Not legal advice"), links.

## Claim Wizard (3 steps)

- Progress bar showing step 1/2/3, back button, validated inputs.
- **Step 1 — What happened**: Long-form textarea with character count (min 50 chars), helper prompts.
- **Step 2 — Where**: Country dropdown (Thailand, Singapore, Malaysia, Indonesia, Vietnam, Philippines, Cambodia, Laos), optional city, incident date.
- **Step 3 — Evidence**: Real file upload to Lovable Cloud Storage (images, PDFs, max 10 files, drag-and-drop), file list with remove button, optional amount in dispute + currency.
- **Submit**: If logged out → prompt to sign in/up (story preserved), then create dispute and trigger AI analysis.

## AI Strategy Dashboard

- Top: dispute summary chip (category, country, date).
- **Risk Level Gauge**: Semicircle gauge with Green (Strong case) / Yellow (Moderate) / Red (Weak), short label and confidence %.
- **AI Recommendation**: Professional, legal-toned analysis — applicable consumer rights, jurisdiction notes, suggested actions, escalation path (platform → consumer protection authority → small claims).
- **Key Leverage Points**: Bullet list of strongest arguments extracted from the user's story.
- **Draft Complaint**: Button generates a formal email template (subject, recipient placeholders, body referencing user's facts, requested remedy, deadline). Copy-to-clipboard and download .txt.
- **Save / share**: Auto-saved to user's account; shareable internal link.
- Re-analyze button if the user adds more details.

## Accounts (Lovable Cloud)

- Email + password sign up/in, no email confirmation friction (auto-confirm for testing).
- `profiles` table (id, display_name, country).
- `disputes` table (id, user_id, category, country, city, incident_date, story, amount, currency, status, created_at).
- `dispute_evidence` table (id, dispute_id, storage_path, file_name, mime_type).
- `dispute_analyses` table (id, dispute_id, risk_level, confidence, recommendation, leverage_points jsonb, draft_email, model, created_at).
- RLS: users can only read/write their own rows; storage bucket private with per-user policies.
- `/dashboard`: list of disputes with status, risk badge, link to analysis.

## AI integration

- Server function calls Lovable AI Gateway (`google/gemini-3-flash-preview`).
- Single structured-output call using tool-calling to return: `risk_level`, `confidence`, `recommendation`, `leverage_points[]`, `draft_email`.
- System prompt grounded in SE Asia consumer protection context (Thailand CPA, Singapore Lemon Law/CASE, Malaysia TCPA, etc.) and instructed to stay professional, cite jurisdiction, never fabricate statutes.
- Handles 429 / 402 errors with friendly toasts.

## Knowledge base (SE Asia focused)

- `/knowledge`: Grid of articles grouped by country and topic.
- Seed ~6 articles authored as static MDX-style content:
  - Thailand: Recovering hotel security deposits
  - Thailand: Tour operator cancellations and the CPA
  - Singapore: Hotel booking disputes and CASE escalation
  - Singapore: Lemon Law applied to travel services
  - Malaysia: Flight delay compensation under MAVCOM
  - Region-wide: When travel insurance can legally deny your claim
- Each article: country chip, last-updated date, structured sections (Your rights / Steps to take / Who to escalate to / Template phrases), CTA to start a claim.

## Trust & compliance touches

- Persistent "Informational only, not legal advice" disclaimer in footer and on analysis page.
- Loading states with skeletons, empty states, error boundaries on every route.
- Mobile-first: bottom-anchored CTAs on wizard, large touch targets, safe-area padding.

&nbsp;

**Ensure the AI specifically identifies 'Deceptive platform behavior'—such as when a booking site pressures a traveler to cancel an active insurance policy or refuses a refund for a clearly documented airline-caused delay. The AI should call out these specific tactics in the 'Leverage Points' section to empower the user. Go ahead and build!"**

After approval I'll set up Lovable Cloud (auth + DB + storage), build the routes and wizard, wire the AI analysis server function, and seed the knowledge base.