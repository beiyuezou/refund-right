import { createFileRoute } from "@tanstack/react-router";

function paypalBase(): string {
  const env = (process.env.PAYPAL_ENV ?? "sandbox").toLowerCase();
  return env === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function paypalAccessToken(): Promise<string | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export const Route = createFileRoute("/api/public/paypal-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookId = process.env.PAYPAL_WEBHOOK_ID;
        if (!webhookId) {
          return new Response("Webhook not configured", { status: 500 });
        }

        const rawBody = await request.text();
        const headers = request.headers;

        const token = await paypalAccessToken();
        if (!token) {
          return new Response("Auth failure", { status: 500 });
        }

        // Verify signature via PayPal
        const verifyRes = await fetch(
          `${paypalBase()}/v1/notifications/verify-webhook-signature`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              auth_algo: headers.get("paypal-auth-algo"),
              cert_url: headers.get("paypal-cert-url"),
              transmission_id: headers.get("paypal-transmission-id"),
              transmission_sig: headers.get("paypal-transmission-sig"),
              transmission_time: headers.get("paypal-transmission-time"),
              webhook_id: webhookId,
              webhook_event: JSON.parse(rawBody),
            }),
          },
        );
        const verifyJson = (await verifyRes.json().catch(() => ({}))) as {
          verification_status?: string;
        };
        if (verifyJson.verification_status !== "SUCCESS") {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(rawBody) as {
          event_type?: string;
          resource?: {
            id?: string;
            custom_id?: string;
            supplementary_data?: {
              related_ids?: { order_id?: string };
            };
            purchase_units?: Array<{ custom_id?: string; reference_id?: string }>;
          };
        };

        if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
          const orderId =
            event.resource?.supplementary_data?.related_ids?.order_id ??
            event.resource?.id;
          const disputeId =
            event.resource?.custom_id ??
            event.resource?.purchase_units?.[0]?.custom_id ??
            event.resource?.purchase_units?.[0]?.reference_id;

          if (orderId) {
            const { supabaseAdmin } = await import(
              "@/integrations/supabase/client.server"
            );
            await supabaseAdmin
              .from("payments")
              .update({
                status: "completed",
                raw_payload: event,
              })
              .eq("paypal_order_id", orderId);

            if (disputeId) {
              await supabaseAdmin
                .from("disputes")
                .update({ paid: true, paid_at: new Date().toISOString() })
                .eq("id", disputeId);
            }
          }
        }

        return new Response("ok");
      },
    },
  },
});