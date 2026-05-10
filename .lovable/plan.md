# Edit Draft Complaint Email

Add an "Edit" button next to the existing Listen / Copy / Download buttons on the draft complaint email so users can manually revise the AI-generated text. Edits persist to the database, and re-analyzing warns before overwriting.

## UX

In `src/routes/analysis.$disputeId.tsx`, the Draft Email section gains an **Edit** button (pencil icon) in the action row.

- Clicking **Edit** swaps the read-only `<pre>` for a `<Textarea>` pre-filled with the current draft, plus **Save** and **Cancel** buttons.
- While editing: Listen / Copy / Download / Show full / Re-analyze are disabled to avoid acting on stale text.
- **Save** writes the new text to `dispute_analyses.draft_email`, updates local state, exits edit mode, and shows a success toast.
- **Cancel** restores the original text and exits without saving.
- A small "Edited by you" badge appears under the heading once the user has saved a manual edit (tracked locally for the session; no schema change).

## Re-analyze guard

Currently the EN / 中文 / Reanalyze buttons call `rerun()` immediately. We add a confirmation step using the existing `AlertDialog` component:

- If the user is in edit mode OR has saved manual edits this session, clicking any re-analyze button opens an AlertDialog: *"Re-analyzing will replace your edited email with a new AI version. Continue?"*
- Confirm → proceed with `rerun(lang)`. Cancel → close dialog, no change.
- If no edits have been made, behavior is unchanged.

## Persistence

`dispute_analyses` currently has no UPDATE RLS policy (per schema). We need to add one so users can update their own analyses:

```sql
CREATE POLICY "Analyses update own"
ON public.dispute_analyses
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

The save itself uses the browser Supabase client:
```ts
await supabase
  .from("dispute_analyses")
  .update({ draft_email: edited })
  .eq("id", analysis.id);
```

## i18n

Add translation keys (EN + ZH) under `analysis.*` in `src/lib/i18n.ts`:
- `edit` — "Edit" / "编辑"
- `save` — "Save" / "保存"
- `cancel` — "Cancel" / "取消"
- `saved` — "Email updated" / "邮件已更新"
- `editedBadge` — "Edited by you" / "已手动编辑"
- `reanalyzeWarnTitle` — "Replace your edits?" / "替换您的修改？"
- `reanalyzeWarnBody` — "Re-analyzing will overwrite your manually edited email with a new AI version." / "重新分析会用新的 AI 版本覆盖您手动编辑的邮件。"
- `reanalyzeConfirm` — "Replace" / "替换"

## Out of scope

- Editing recommendation text or leverage points
- Versioning / undo history of past drafts
- A schema column to mark "manually edited" (kept session-local)

## Files

- Migration: add UPDATE RLS policy on `dispute_analyses`
- Edit `src/routes/analysis.$disputeId.tsx` — Edit button, textarea, save handler, AlertDialog re-analyze guard
- Edit `src/lib/i18n.ts` — new translation keys (EN + ZH)
