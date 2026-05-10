// Edge function: analyze-dispute
// Calls Lovable AI Gateway with tool-calling to produce structured legal analysis,
// then stores the result in dispute_analyses (RLS-scoped to the calling user).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function buildSystemPrompt(language: "en" | "zh") {
  const langClause =
    language === "zh"
      ? `UX/LOCALIZATION DIRECTIVE (user language = 'zh'):
- Write the recommendation and every leverage_point (title and detail) in professional Simplified Chinese (简体中文).
- The draft_email MUST be BILINGUAL: write the full email in English first (Subject, salutation, body, sign-off), and immediately after each English sentence or short paragraph, place the Chinese translation in square brackets on the next line, e.g.
    Subject: Formal Complaint — Booking Ref [BOOKING REF]
    [主题：正式投诉 — 订单号 [BOOKING REF]]
    Dear [RECIPIENT NAME],
    [尊敬的 [RECIPIENT NAME]：]
- When citing statutes or regulators inside Chinese prose, give the Chinese translation followed by the official English/local name in parentheses, e.g. "泰国《消费者保护法》B.E. 2522 (Consumer Protection Act B.E. 2522)", "新加坡《公平交易法》(Consumer Protection (Fair Trading) Act, CPFTA)".
- Keep brand names (Agoda, Booking.com, Trip.com, Klook, MAVCOM, OCPB, CASE), email addresses, URLs, dates and numbers in ASCII. Use full-width punctuation only inside Chinese sentences.`
      : `UX/LOCALIZATION DIRECTIVE (user language = 'en'):
- Write the recommendation, every leverage_point, and the entire draft_email in full English. No Chinese.
- Cite statutes by their official English/local name (e.g. "Consumer Protection Act B.E. 2522", "Consumer Protection (Fair Trading) Act (CPFTA)").`;

  return `You are an integrated Multi-Agent Orchestrator for Southeast Asian travel-dispute analysis. You operate as a panel of four specialist agents reasoning together inside a single response. Internally simulate each agent's perspective, then synthesise their conclusions into the final tool call. Do NOT expose the agent labels or internal reasoning in the output — only the synthesised result.

THE PANEL:

1. EVIDENCE AGENT
   - Extract every concrete fact from the traveler's account with precision: booking IDs / PNRs, supplier and platform names, full names, dates and times (with timezone if given), flight numbers, hotel names, amounts and currencies, communication channels, and any screenshots or documents the user references.
   - Flag missing-but-critical evidence as a leverage gap rather than inventing facts.
   - Build a clean factual timeline that grounds every later argument.

2. LEGAL AGENT
   - Map the dispute to the consumer-protection framework of the stated jurisdiction. Anchors you may cite (do NOT fabricate section numbers or hotlines):
     • Thailand — Consumer Protection Act B.E. 2522, Office of the Consumer Protection Board (OCPB), Tourist Police 1155.
     • Singapore — Consumer Protection (Fair Trading) Act (CPFTA), Lemon Law (Part 3 CPFTA), CASE, Small Claims Tribunals.
     • Malaysia — Malaysian Aviation Consumer Protection Code 2016 (MACPC) under MAVCOM, Consumer Protection Act 1999, Tribunal for Consumer Claims.
     • Indonesia — UU Perlindungan Konsumen No. 8/1999, BPSK.
     • Vietnam / Philippines / Cambodia / Laos — cite general consumer-protection principles only when confident.
   - Explicitly NAME deceptive platform behaviours when the facts support them, so the user can confront the tactic directly:
     • A booking site (Agoda, Booking.com, Trip.com, Klook, etc.) pressuring the traveler to cancel an active insurance policy as a condition of refund.
     • An airline or OTA refusing a refund for a clearly documented airline-caused delay or cancellation.
     • Pre-authorisation holds or "damage" charges asserted without itemised evidence.
     • Substituted services materially worse than what was paid for.
     • Coercive "non-refundable" framing applied where consumer law overrides it.

3. FINANCE / INSURANCE AGENT
   - Identify likely insurance coverage triggers (trip interruption, supplier default, baggage, medical, travel-delay clauses) and what documentation activates them.
   - Build a concrete escalation ladder, in this order: (i) Platform / supplier formal complaint with deadline → (ii) Card issuer chargeback under the relevant scheme (Visa / Mastercard / Amex dispute reason codes) and/or insurer claim → (iii) Regulator or tribunal in the stated country (e.g. OCPB, CASE, MAVCOM, BPSK).
   - Call out chargeback time limits and evidence the bank will require.

4. UX / LOCALIZATION AGENT
   - Enforces tone, language, and the bilingual email rule defined in the LANGUAGE DIRECTIVE below.
   - Keeps the output sober, formal, lawyer-like — never breezy or salesy.

SYNTHESIS RULES:
- The recommendation field (300–500 words) must read as one coherent professional analysis weaving the Evidence → Legal → Finance reasoning together, ending with the escalation path.
- The leverage_points array must contain 3–7 items. Use them to surface the strongest specific arguments AND to explicitly name any deceptive platform tactics detected.
- The draft_email must be a complete, sendable formal complaint starting with "Subject: ..." on the first line, using placeholders like [RECIPIENT NAME], [BOOKING REF], [DATE] where the user must fill in, citing the applicable statute, and setting a 14-day response deadline.
- Risk levels:
  • "strong" — clear documentary evidence + named statute/regulator likely to side with the consumer.
  • "moderate" — winnable case but with evidence gaps or jurisdictional ambiguity.
  • "weak" — limited evidence, lawful supplier conduct, or hostile jurisdiction.
- NEVER invent specific section numbers, hotline numbers, or compensation amounts you are not confident in. If the user's facts are thin, say so inside the recommendation and ask them to add specific details rather than overclaim.

${langClause}

You MUST respond by calling the produce_analysis function. Do not return prose.`;
}

interface AnalyzePayload {
  category: "hotel" | "flight" | "insurance";
  country: string;
  city?: string | null;
  incident_date?: string | null;
  story: string;
  amount?: number | null;
  currency?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return json({ error: "AI service is not configured." }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // Per-user rate limit: 10 / hour
    const sinceIso = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count: recent } = await admin
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "analyze")
      .gte("created_at", sinceIso);
    if ((recent ?? 0) >= 10) {
      await admin.from("audit_logs").insert({
        user_id: userId,
        action: "rate_limit.exceeded",
        metadata: { kind: "analyze" },
      });
      return new Response(
        JSON.stringify({ error: "Too many requests", code: "rate_limited" }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "3600" },
        },
      );
    }
    await admin.from("rate_limit_events").insert({ user_id: userId, action: "analyze" });

    const body = (await req.json()) as { dispute_id: string; language?: string };
    if (!body?.dispute_id) {
      return json({ error: "dispute_id required" }, 400);
    }
    const language: "en" | "zh" = body.language === "zh" ? "zh" : "en";

    // Load dispute (RLS ensures it's owned by caller)
    const { data: dispute, error: dErr } = await supabase
      .from("disputes")
      .select("id, user_id, category, country, city, incident_date, story, amount, currency")
      .eq("id", body.dispute_id)
      .single();

    if (dErr || !dispute) {
      return json({ error: "Dispute not found" }, 404);
    }
    if (dispute.user_id !== userId) {
      return json({ error: "Forbidden" }, 403);
    }

    await supabase.from("disputes").update({ status: "analyzing" }).eq("id", dispute.id);

    const payload: AnalyzePayload = {
      category: dispute.category as AnalyzePayload["category"],
      country: dispute.country,
      city: dispute.city,
      incident_date: dispute.incident_date,
      story: dispute.story,
      amount: dispute.amount,
      currency: dispute.currency,
    };

    const userPrompt = buildUserPrompt(payload, language);
    const systemPrompt = buildSystemPrompt(language);
    const model = "google/gemini-3-flash-preview";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "produce_analysis",
              description:
                "Return a structured rights analysis for the traveler's dispute.",
              parameters: {
                type: "object",
                properties: {
                  risk_level: {
                    type: "string",
                    enum: ["strong", "moderate", "weak"],
                    description:
                      "Strength of the consumer's case. 'strong' = likely to win, 'moderate' = winnable with effort, 'weak' = uphill.",
                  },
                  confidence: {
                    type: "integer",
                    minimum: 0,
                    maximum: 100,
                    description: "Your confidence in this assessment, 0-100.",
                  },
                  recommendation: {
                    type: "string",
                    description:
                      "300-500 word professional legal-style analysis: applicable consumer rights for this jurisdiction, how the supplier's conduct measures up, and the suggested escalation path (platform → regulator → tribunal).",
                  },
                  leverage_points: {
                    type: "array",
                    minItems: 3,
                    maxItems: 7,
                    description:
                      "Strongest arguments and tactics the user can deploy. MUST explicitly name any deceptive platform behavior detected (e.g. pressure to cancel insurance, refusal to refund a clearly airline-caused delay).",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        detail: { type: "string" },
                      },
                      required: ["title", "detail"],
                      additionalProperties: false,
                    },
                  },
                  draft_email: {
                    type: "string",
                    description:
                      "A complete formal complaint email the user can send. Begin with 'Subject: ...' on the first line. Use placeholders like [RECIPIENT NAME], [BOOKING REF], [DATE] where the user must fill in. Reference applicable statutes and set a 14-day deadline.",
                  },
                },
                required: [
                  "risk_level",
                  "confidence",
                  "recommendation",
                  "leverage_points",
                  "draft_email",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "produce_analysis" },
        },
      }),
    });

    if (!aiRes.ok) {
      await supabase.from("disputes").update({ status: "failed" }).eq("id", dispute.id);
      if (aiRes.status === 429) {
        return json(
          { error: "Rate limit exceeded. Please wait a moment and try again." },
          429,
        );
      }
      if (aiRes.status === 402) {
        console.error("[analyze-dispute] AI gateway 402 — credits exhausted");
        return json(
          {
            error:
              "Analysis service is temporarily unavailable. Please try again later.",
            code: "service_unavailable",
          },
          503,
        );
      }
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      return json({ error: "AI analysis failed. Please try again." }, 500);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      await supabase.from("disputes").update({ status: "failed" }).eq("id", dispute.id);
      console.error("No tool call in AI response", JSON.stringify(aiJson));
      return json({ error: "Invalid AI response." }, 500);
    }

    let parsed: {
      risk_level: "strong" | "moderate" | "weak";
      confidence: number;
      recommendation: string;
      leverage_points: { title: string; detail: string }[];
      draft_email: string;
    };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool call args", e);
      await supabase.from("disputes").update({ status: "failed" }).eq("id", dispute.id);
      return json({ error: "Invalid AI response format." }, 500);
    }

    const { data: analysis, error: insertErr } = await supabase
      .from("dispute_analyses")
      .insert({
        dispute_id: dispute.id,
        user_id: userId,
        risk_level: parsed.risk_level,
        confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
        recommendation: parsed.recommendation,
        leverage_points: parsed.leverage_points,
        draft_email: parsed.draft_email,
        model,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Insert analysis error:", insertErr);
      return json({ error: "Failed to save analysis." }, 500);
    }

    await supabase.from("disputes").update({ status: "analyzed" }).eq("id", dispute.id);

    await admin.from("audit_logs").insert({
      user_id: userId,
      action: "analysis.run",
      resource_type: "dispute_analyses",
      resource_id: analysis.id,
      metadata: { dispute_id: dispute.id, model, risk: parsed.risk_level },
    });

    return json({ analysis_id: analysis.id });
  } catch (e) {
    const id = crypto.randomUUID();
    console.error(`[analyze-dispute ${id}]`, e);
    return json({ error: "Request failed", code: "internal" }, 500);
  }
});

function buildUserPrompt(p: AnalyzePayload, language: "en" | "zh") {
  const categoryLabel = {
    hotel: "Hotel issue (deposits, wrong booking, unjustified charges)",
    flight: "Flight disruption (delays, cancellation, missed connection)",
    insurance: "Insurance trap (denial, deceptive cancellation advice)",
  }[p.category];

  const langReminder =
    language === "zh"
      ? `CRITICAL: recommendation and leverage_points MUST be in Simplified Chinese. The draft_email MUST be BILINGUAL — write each line / short paragraph in English first, then place the Chinese translation in square brackets on the very next line (Subject line included). Cite statutes as "中文翻译 (English original name)".`
      : `CRITICAL: All output MUST be in English.`;

  return `Produce a structured analysis for the following traveler dispute.

Category: ${categoryLabel}
Country: ${p.country}${p.city ? ` (${p.city})` : ""}
Incident date: ${p.incident_date ?? "not provided"}
Amount in dispute: ${p.amount != null ? `${p.amount} ${p.currency ?? ""}`.trim() : "not provided"}

Traveler's account:
"""
${p.story}
"""

${langReminder}

Remember: explicitly name any deceptive platform tactics in leverage_points, and ground your reasoning in the consumer-protection framework of ${p.country}. Respond by invoking produce_analysis.`;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
