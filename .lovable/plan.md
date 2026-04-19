
## Premium redesign of `/knowledge` + header polish

### Scope

1. **New color palette** (in `src/styles.css`) — deep soft teal as primary, cool slate surfaces, warm brushed gold as CTA accent. Tokens updated: `--primary`, `--primary-soft`, `--accent` (gold), `--accent-soft`, plus dark-mode equivalents.
2. **Typography** — load Poppins via Google Fonts in `__root.tsx`, set as `--font-display`; keep Inter for body with improved line-height. Heading tracking tightened.
3. **Knowledge hero** — condense the subtext to one impactful sentence (new i18n key `knowledge.subShort`), enlarge H1 to `text-5xl sm:text-6xl`, drop the badge clutter to a slim uppercase eyebrow, more vertical breathing room.
4. **Article tiles** — `rounded-3xl`, `p-8`, `gap-6 md:gap-8`, soft border + subtle shadow that deepens on hover, lift animation. Topic line-art icon (lucide) per article in a soft circle: `Hotel` (deposits), `PlaneTakeoff` (delays), `ShieldAlert` (insurance), `Bus` (transport). Country pill restyled with subtle teal background, category in muted small-caps.
5. **"Read guide" link** — gold color, arrow slides right on hover (`group-hover:translate-x-1`).
6. **New 4th article** — add `thailand-transport-overcharges` to `ARTICLES` in `src/lib/knowledge.ts`: covers taxi meter refusal, airport scams, Grab disputes, Thai Consumer Protection Act escalation. Full markdown body, summary, country=Thailand, category=transport.
7. **Header polish** (`SiteChrome.tsx`) — rename "My disputes" → "Disputes", add a small circular avatar (lucide `User` in a soft slate circle) next to the existing toggles when signed in. Tightened spacing.
8. **Quietly fix the SSR hydration mismatch** on the nav link (server rendered "Knowledge", client rendered "知识库") by ensuring i18n language is only applied after mount, matching the existing pattern in `i18n.ts`.

### Out of scope
- `/knowledge/$slug` detail page styling (only data addition for the new article).
- Dashboard / wizard / analysis page restyling.
- Mobile hamburger menu (separate task).

### Defaults I'm assuming (tell me to change any)

| Decision | Default |
|---|---|
| Palette scope | **App-wide** — keeps every page consistent with the premium direction |
| New article topic | **Thailand: taxi & Grab overcharges** — strongest match to existing SE-Asia traveler focus |
| Display font | **Poppins headings + Inter body** — geometric premium for titles, proven readable body |
| Avatar behavior | **Static circle with `User` icon** for now — non-functional placeholder, no dropdown |

If any of these defaults are wrong, reply with the change before approving and I'll adjust before implementing.

### Files I'll touch
- `src/styles.css` — new color tokens + dark variants
- `src/routes/__root.tsx` — Poppins font link
- `src/routes/knowledge.tsx` — hero + tiles redesign with topic icons
- `src/lib/knowledge.ts` — add 4th article (transport)
- `src/lib/i18n.ts` — `knowledge.subShort`, transport country/category strings, new "Disputes" label, fix mount-only language application
- `src/components/SiteChrome.tsx` — rename link, add avatar placeholder
