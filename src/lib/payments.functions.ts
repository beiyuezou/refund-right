import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PRICE_CENTS = 990; // $9.90
const CURRENCY = "USD";

export const getPaypalPublicConfig = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      clientId: process.env.PAYPAL_CLIENT_ID ?? "",
      env: (process.env.PAYPAL_ENV ?? "sandbox").toLowerCase(),
      currency: CURRENCY,
      amountCents: PRICE_CENTS,
    };
  },
);

function paypalBase(): string {
  const env = (process.env.PAYPAL_ENV ?? "sandbox").toLowerCase();
  return env === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function paypalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured");
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export const createPaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ dispute_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: dispute, error: dErr } = await supabase
      .from("disputes")
      .select("id, user_id, paid, category")
      .eq("id", data.dispute_id)
      .maybeSingle();
    if (dErr || !dispute) {
      return { ok: false as const, code: "not_found" };
    }
    if (dispute.user_id !== userId) {
      return { ok: false as const, code: "forbidden" };
    }
    if (dispute.paid) {
      return { ok: false as const, code: "already_paid" };
    }

    const token = await paypalAccessToken();
    const amount = (PRICE_CENTS / 100).toFixed(2);
    const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: dispute.id,
            description: `RefundRight full report (${dispute.category})`,
            custom_id: dispute.id,
            amount: { currency_code: CURRENCY, value: amount },
          },
        ],
        application_context: {
          brand_name: "RefundRight",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
        },
      }),
    });
    if (!res.ok) {
      return { ok: false as const, code: "paypal_create_failed" };
    }
    const order = (await res.json()) as { id: string };

    // Record pending order with service role
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("payments").upsert(
      {
        user_id: userId,
        dispute_id: dispute.id,
        provider: "paypal",
        paypal_order_id: order.id,
        amount_cents: PRICE_CENTS,
        currency: CURRENCY,
        status: "created",
      },
      { onConflict: "paypal_order_id" },
    );

    return { ok: true as const, order_id: order.id };
  });

export const capturePaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        order_id: z.string().min(1).max(200),
        dispute_id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: dispute } = await supabase
      .from("disputes")
      .select("id, user_id, paid")
      .eq("id", data.dispute_id)
      .maybeSingle();
    if (!dispute || dispute.user_id !== userId) {
      return { ok: false as const, code: "forbidden" };
    }

    const token = await paypalAccessToken();
    const res = await fetch(
      `${paypalBase()}/v2/checkout/orders/${encodeURIComponent(data.order_id)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false as const, code: "paypal_capture_failed" };
    }
    const status = (payload as { status?: string }).status ?? "UNKNOWN";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("payments")
      .update({
        status: status === "COMPLETED" ? "completed" : status.toLowerCase(),
        raw_payload: payload,
      })
      .eq("paypal_order_id", data.order_id);

    if (status === "COMPLETED") {
      await supabaseAdmin
        .from("disputes")
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq("id", data.dispute_id);
    }

    return { ok: true as const, status };
  });