import { Lock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PayPalCheckoutButton } from "./PayPalCheckoutButton";

type Props = {
  paid: boolean;
  disputeId: string;
  onPaid: () => void;
  children: React.ReactNode;
  /** Short pitch shown above the checkout when locked */
  headline?: string;
  subline?: string;
  priceLabel?: string;
};

export function PaywallGate({
  paid,
  disputeId,
  onPaid,
  children,
  headline,
  subline,
  priceLabel = "US$9.90 · one-time",
}: Props) {
  const { t } = useTranslation();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  if (paid) return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred preview of the locked content */}
      <div
        aria-hidden
        className="pointer-events-none select-none blur-md opacity-70"
      >
        {children}
      </div>

      {/* Overlay CTA */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-accent/40 bg-card/95 backdrop-blur p-6 shadow-xl text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Lock className="h-5 w-5" />
          </span>
          <h3 className="mt-3 text-lg font-bold text-primary">
            {headline ?? t("paywall.title", { defaultValue: "Unlock the full report" })}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {subline ??
              t("paywall.sub", {
                defaultValue:
                  "Get the complete legal argument, amount calculation, and ready-to-send complaint email.",
              })}
          </p>
          <p className="mt-3 text-sm font-semibold text-primary">
            {priceLabel}
          </p>

          {checkoutOpen ? (
            <div className="mt-4">
              <PayPalCheckoutButton disputeId={disputeId} onPaid={onPaid} />
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="mt-2 text-xs text-muted-foreground hover:text-primary"
              >
                {t("paywall.cancel", { defaultValue: "Cancel" })}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-accent-foreground hover:opacity-95"
            >
              {t("paywall.cta", { defaultValue: "Unlock with PayPal" })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}