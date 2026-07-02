import { useMemo } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  createPaypalOrder,
  capturePaypalOrder,
} from "@/lib/payments.functions";

type Props = {
  disputeId: string;
  onPaid: () => void;
};

export function PayPalCheckoutButton({ disputeId, onPaid }: Props) {
  const { i18n } = useTranslation();
  const createOrder = useServerFn(createPaypalOrder);
  const captureOrder = useServerFn(capturePaypalOrder);

  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;

  const options = useMemo(
    () => ({
      clientId: clientId ?? "test",
      currency: "USD",
      intent: "capture" as const,
      locale: i18n.language?.startsWith("zh") ? "zh_CN" : "en_US",
    }),
    [clientId, i18n.language],
  );

  if (!clientId) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        PayPal is not configured yet. Please set VITE_PAYPAL_CLIENT_ID.
      </p>
    );
  }

  return (
    <div className="w-full">
      <PayPalScriptProvider options={options}>
        <PayPalButtons
          style={{ layout: "vertical", shape: "rect", label: "pay" }}
          createOrder={async () => {
            const res = await createOrder({ data: { dispute_id: disputeId } });
            if (!res.ok) {
              toast.error("Could not start checkout.");
              throw new Error(res.code);
            }
            return res.order_id;
          }}
          onApprove={async (data) => {
            const res = await captureOrder({
              data: { order_id: data.orderID, dispute_id: disputeId },
            });
            if (res.ok && res.status === "COMPLETED") {
              toast.success("Payment complete — unlocking your full report.");
              onPaid();
            } else {
              toast.error("Payment could not be captured.");
            }
          }}
          onError={(err) => {
            if (import.meta.env.DEV) console.error("paypal", err);
            toast.error("PayPal error. Please try again.");
          }}
        />
      </PayPalScriptProvider>
    </div>
  );
}