import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

export const MAX_HELP_REQUESTS_PER_DAY = 3;

const schema = z
  .object({
    contact_email: z.string().trim().email().max(255),
    dispute_id: z.string().uuid().nullable(),
    case_summary: z.string().trim().max(2000).nullable(),
    preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    preferred_slot: z.enum(["morning", "afternoon", "evening", "any"]),
    timezone: z.string().trim().max(64).nullable(),
    notes: z.string().trim().max(1000).nullable(),
  })
  .refine((d) => d.dispute_id || (d.case_summary && d.case_summary.length >= 10), {
    message: "summary_required",
  });

type Result = { ok: true } | { ok: false; code: "rate_limited" | "forbidden" | "error" };

export const submitHelpRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<Result> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Optional sign-in: identify the caller from the bearer token if present.
    let userId: string | null = null;
    const auth = getRequestHeader("authorization");
    if (auth?.startsWith("Bearer ")) {
      const { data: u } = await supabaseAdmin.auth.getUser(auth.slice(7));
      userId = u.user?.id ?? null;
    }

    if (data.dispute_id) {
      if (!userId) return { ok: false, code: "forbidden" };
      const { data: d } = await supabaseAdmin
        .from("disputes").select("user_id").eq("id", data.dispute_id).maybeSingle();
      if (!d || d.user_id !== userId) return { ok: false, code: "forbidden" };
    }

    const since = new Date(Date.now() - 86400_000).toISOString();
    const email = data.contact_email.toLowerCase();
    const q = supabaseAdmin
      .from("expert_help_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    const { count } = await (userId ? q.or(`user_id.eq.${userId},contact_email.eq.${email}`) : q.eq("contact_email", email));
    if ((count ?? 0) >= MAX_HELP_REQUESTS_PER_DAY) return { ok: false, code: "rate_limited" };

    const { error } = await supabaseAdmin.from("expert_help_requests").insert({
      user_id: userId,
      dispute_id: data.dispute_id,
      contact_email: email,
      case_summary: data.case_summary,
      preferred_date: data.preferred_date,
      preferred_slot: data.preferred_slot,
      timezone: data.timezone,
      notes: data.notes,
    });
    if (error) {
      console.error("help request insert failed", error);
      return { ok: false, code: "error" };
    }
    return { ok: true };
  });
