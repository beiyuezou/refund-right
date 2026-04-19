## End-to-end test plan: language switcher + dark mode

I'll drive the live preview with the browser tool across desktop (1280×720) and mobile (390×844) viewports, exercising every major route while toggling EN ↔ 中文 and Light ↔ Dark.

### Routes to cover

1. `/` — Home (hero, category cards, how-it-works, knowledge teaser, footer)
2. `/knowledge` — Index grid
3. `/knowledge/thailand-hotel-deposits` — Article detail (current route)
4. `/auth` — Sign in / sign up tabs
5. `/dashboard` — Auth-gated list (requires login)
6. `/claim/hotel` — Wizard steps 1, 2, 3
7. `/analysis/$disputeId` — Results page (requires an existing dispute)

### What I'll verify on each

- **i18n**: All visible strings switch between EN and 中文 — no leftover English on Chinese, no missing-key fallbacks like `nav.language`. Header, body, buttons, form labels, validation, empty states, footer.
- **Theme**: `.dark` class applies on `<html>`, surfaces/text/borders all respond, no hard-coded white/navy that breaks contrast in the opposite mode. Risk badges, gauge, file-upload zone, dropdowns, dialog overlays.
- **Persistence**: Reload after toggling — `rr_theme` and `i18nextLng` survive in localStorage.
- **Mobile (390×844)**: Header still fits both toggles + CTA; nav items hidden on `sm:` breakpoint don't strand the user (Knowledge / Sign in / My disputes are `hidden sm:inline-flex`, so on mobile only the icon buttons + "Report Dispute" show — I'll flag this as a gap).
- **Cross-page**: Language and theme stick when navigating between routes (no flash, no reset).

### Auth-gated routes

- `/dashboard` and `/analysis/$disputeId` need a logged-in session. I'll either reuse an existing preview session if one is active, or stop and ask you to sign in (per the auth rule — I won't fill credentials without approval).
- For `/analysis/$disputeId`, I need a real dispute ID. If your account has none, I'll submit a short test dispute via the wizard to generate one (this calls the real AI — let me know if you'd rather I skip).

### Deliverables

A concise report per route × viewport with: ✅ pass / ⚠️ issue (with screenshot + exact string or selector) / ❌ broken. Any bugs found I'll list but **not fix in this turn** — you'll approve fixes separately.

- **AI 响应一致性测试**
- **优化建议：** 检查中文翻译是否符合法律语境。例如：  
• “Report Dispute” 翻译成 **“提交维权申请”** 或 **“争议申诉”** 比“报告纠纷”更好。  
• “Legal advice” 翻译成 **“法律意见/建议”**

### Two quick questions before I start

1. **Auth for gated routes** — are you already signed in to the preview, or should I (a) skip `/dashboard` + `/analysis`, (b) wait while you sign in, or (c) sign up a throwaway test account with your approval?

**选 (c)：Sign up a throwaway test account.**

**2、Generating a test dispute** — OK to submit a real test claim through the wizard so I can exercise `/analysis/$disputeId`? This triggers the AI edge function (small Lovable AI cost). If not, I'll cover the analysis page visually only via the dashboard link if one exists.

**OK, DO IT.**