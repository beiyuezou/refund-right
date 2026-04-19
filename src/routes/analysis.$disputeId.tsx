import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  Download,
  Loader2,
  Plane,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, type CategoryKey } from "@/lib/categories";

export const Route = createFileRoute("/analysis/$disputeId")({
  head: () => ({
    meta: [
      { title: "Rights analysis · RefundRight" },
      { name: "description", content: "AI rights analysis and draft complaint for your travel dispute." },
    ],
  }),
  component: AnalysisPage,
});

const ICONS: Record<CategoryKey, typeof Building2> = {
  hotel: Building2,
  flight: Plane,
  insurance: ShieldAlert,
};

type Dispute = {
  id: string;
  category: CategoryKey;
  country: string;
  city: string | null;
  incident_date: string | null;
  story: string;
  amount: number | null;
  currency: string | null;
  status: string;
  created_at: string;
};

type LeveragePoint = { title: string; detail: string };

type Analysis = {
  id: string;
  risk_level: "strong" | "moderate" | "weak";
  confidence: number;
  recommendation: string;
  leverage_points: LeveragePoint[];
  draft_email: string;
  created_at: string;
};

function AnalysisPage() {
  const { disputeId } = useParams({ from: "/analysis/$disputeId" });
  const { user, loading: authLoading } = useAuth();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [showFullEmail, setShowFullEmail] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: d }, { data: a }] = await Promise.all([
      supabase
        .from("disputes")
        .select(
          "id, category, country, city, incident_date, story, amount, currency, status, created_at",
        )
        .eq("id", disputeId)
        .maybeSingle(),
      supabase
        .from("dispute_analyses")
        .select(
          "id, risk_level, confidence, recommendation, leverage_points, draft_email, created_at",
        )
        .eq("dispute_id", disputeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (d) setDispute(d as Dispute);
    if (a) setAnalysis(a as unknown as Analysis);
    setLoading(false);
  }, [disputeId, user]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  // Poll while analyzing
  useEffect(() => {
    if (!dispute) return;
    if (analysis) return;
    if (dispute.status === "analyzed" || dispute.status === "failed") return;
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [dispute, analysis, load]);

  async function rerun() {
    if (retrying || !dispute) return;
    setRetrying(true);
    try {
      const { error } = await supabase.functions.invoke("analyze-dispute", {
        body: { dispute_id: dispute.id },
      });
      if (error) {
        toast.error("Re-analysis failed. Please try again.");
      } else {
        toast.success("Re-analyzing your dispute…");
        await load();
      }
    } finally {
      setRetrying(false);
    }
  }

  if (authLoading || loading) {
    return (
      <Shell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold text-primary">Sign in to view analysis</h1>
          <p className="mt-2 text-muted-foreground">Your disputes are saved to your account.</p>
          <Link
            to="/auth"
            search={{ redirect: `/analysis/${disputeId}` }}
            className="mt-6 inline-flex h-11 items-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground"
          >
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  if (!dispute) {
    return (
      <Shell>
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold text-primary">Dispute not found</h1>
          <p className="mt-2 text-muted-foreground">This dispute doesn't exist or isn't yours.</p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Back to dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  const Icon = ICONS[dispute.category];
  const cat = CATEGORIES[dispute.category];
  const isWaiting =
    !analysis &&
    (dispute.status === "pending" || dispute.status === "analyzing");
  const failed = !analysis && dispute.status === "failed";

  return (
    <Shell>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to disputes
      </Link>

      {/* Summary */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-card">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Icon className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-primary leading-tight">
                {cat.label}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {dispute.country}
                {dispute.city ? ` · ${dispute.city}` : ""}
                {dispute.incident_date ? ` · ${dispute.incident_date}` : ""}
                {dispute.amount ? ` · ${dispute.amount} ${dispute.currency ?? ""}` : ""}
              </p>
            </div>
          </div>
          {analysis && (
            <Button
              variant="outline"
              size="sm"
              onClick={rerun}
              disabled={retrying}
              className="gap-1.5"
            >
              {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Re-analyze
            </Button>
          )}
        </div>
        <div className="mt-4 rounded-md bg-secondary/40 border border-border/60 p-3 text-sm text-muted-foreground italic">
          "{dispute.story.length > 240 ? dispute.story.slice(0, 240) + "…" : dispute.story}"
        </div>
      </div>

      {isWaiting && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-10 shadow-card text-center">
          <Sparkles className="mx-auto h-8 w-8 text-accent animate-pulse" />
          <h2 className="mt-3 text-lg font-semibold text-primary">Building your rights analysis…</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This usually takes 10–20 seconds. We're cross-referencing the consumer-protection framework for {dispute.country}.
          </p>
        </div>
      )}

      {failed && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <h2 className="text-lg font-semibold text-destructive">Analysis didn't complete</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Something went wrong. You can try again now.
          </p>
          <Button
            onClick={rerun}
            disabled={retrying}
            className="mt-4 bg-accent text-accent-foreground hover:opacity-95"
          >
            {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Retry analysis
          </Button>
        </div>
      )}

      {analysis && (
        <>
          {/* Risk gauge */}
          <RiskGauge risk={analysis.risk_level} confidence={analysis.confidence} />

          {/* Recommendation */}
          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
              <Sparkles className="h-5 w-5 text-accent" /> AI Recommendation
            </h2>
            <div className="mt-3 prose-styles whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
              {analysis.recommendation}
            </div>
          </section>

          {/* Leverage points */}
          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="text-lg font-semibold text-primary">Key leverage points</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Strongest arguments — including any deceptive platform tactics we detected.
            </p>
            <ul className="mt-4 space-y-3">
              {analysis.leverage_points.map((p, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-primary">{p.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{p.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Draft email */}
          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-primary">Draft complaint email</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(analysis.draft_email);
                    toast.success("Copied to clipboard.");
                  }}
                  className="gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadText(analysis.draft_email, `complaint-${dispute.id.slice(0, 8)}.txt`)}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </div>
            </div>
            <pre
              className={`mt-4 whitespace-pre-wrap rounded-lg border border-border bg-secondary/30 p-4 text-sm text-foreground font-sans leading-relaxed overflow-hidden ${showFullEmail ? "" : "max-h-80"}`}
            >
              {analysis.draft_email}
            </pre>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFullEmail((s) => !s)}
                className="text-sm font-semibold text-accent hover:underline"
              >
                {showFullEmail ? "Show less" : "Show full email"}
              </button>
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-accent" /> Auto-saved to your account
            </p>
          </section>
        </>
      )}

      <p className="mt-8 rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
        <strong className="text-primary">Informational only — not legal advice.</strong> RefundRight cites
        publicly available consumer-protection rules and is intended to help you assert your rights. For binding advice,
        consult a qualified lawyer in the relevant jurisdiction.
      </p>
    </Shell>
  );
}

function RiskGauge({
  risk,
  confidence,
}: {
  risk: "strong" | "moderate" | "weak";
  confidence: number;
}) {
  const map = {
    strong: {
      label: "Strong case",
      sub: "Documentation and law are on your side.",
      color: "var(--risk-strong)",
      pct: 88,
    },
    moderate: {
      label: "Moderate case",
      sub: "Winnable, but expect pushback.",
      color: "var(--risk-moderate)",
      pct: 60,
    },
    weak: {
      label: "Weak case",
      sub: "Uphill — gather more evidence first.",
      color: "var(--risk-weak)",
      pct: 28,
    },
  }[risk];

  // Semicircle gauge using SVG arc
  const r = 80;
  const cx = 100;
  const cy = 100;
  const angle = (map.pct / 100) * 180;
  const rad = (Math.PI * (180 - angle)) / 180;
  const x = cx + r * Math.cos(rad);
  const y = cy - r * Math.sin(rad);
  const largeArc = angle > 180 ? 1 : 0;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <svg viewBox="0 0 200 110" className="w-44 h-24 shrink-0">
          {/* Track */}
          <path
            d={`M 20 100 A 80 80 0 0 1 180 100`}
            fill="none"
            stroke="var(--secondary)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {/* Value */}
          <path
            d={`M 20 100 A 80 80 0 ${largeArc} 1 ${x} ${y}`}
            fill="none"
            stroke={map.color}
            strokeWidth="14"
            strokeLinecap="round"
          />
          <text
            x="100"
            y="92"
            textAnchor="middle"
            className="fill-primary"
            style={{ fontSize: "26px", fontWeight: 800 }}
          >
            {confidence}%
          </text>
        </svg>
        <div className="text-center sm:text-left">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white"
            style={{ backgroundColor: map.color }}
          >
            {map.label}
          </span>
          <h2 className="mt-2 text-xl font-bold text-primary">Risk level</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{map.sub}</p>
          <p className="text-xs text-muted-foreground mt-1">
            AI confidence: {confidence}%
          </p>
        </div>
      </div>
    </div>
  );
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
