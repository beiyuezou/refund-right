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
  Languages,
  Pencil,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { type CategoryKey } from "@/lib/categories";
import { PlayAudioButton } from "@/components/PlayAudioButton";
import { useServerFn } from "@tanstack/react-start";
import { saveDraftEmail } from "@/lib/analysis.functions";

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
  const { t, i18n } = useTranslation();
  const { disputeId } = useParams({ from: "/analysis/$disputeId" });
  const { user, loading: authLoading } = useAuth();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryLang, setRetryLang] = useState<"en" | "zh" | null>(null);
  const [showFullEmail, setShowFullEmail] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);
  const [pendingRerun, setPendingRerun] = useState<"en" | "zh" | "default" | null>(null);

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

  async function rerun(language?: "en" | "zh") {
    if (retrying || !dispute) return;
    const lang =
      language ?? (i18n.language?.startsWith("zh") ? "zh" : "en");
    setRetrying(true);
    setRetryLang(lang);
    try {
      const { error } = await supabase.functions.invoke("analyze-dispute", {
        body: { dispute_id: dispute.id, language: lang },
      });
      if (error) {
        toast.error(t("analysis.reanalyzeFailed"));
      } else {
        toast.success(t("analysis.reanalyzing"));
        setEdited(false);
        setEditing(false);
        await load();
      }
    } finally {
      setRetrying(false);
      setRetryLang(null);
    }
  }

  function requestRerun(language?: "en" | "zh") {
    if (editing || edited) {
      setPendingRerun(language ?? "default");
      return;
    }
    rerun(language);
  }

  async function saveEdit() {
    if (!analysis) return;
    setSaving(true);
    const { error } = await supabase
      .from("dispute_analyses")
      .update({ draft_email: draft })
      .eq("id", analysis.id);
    setSaving(false);
    if (error) {
      toast.error(t("analysis.saveFailed"));
      return;
    }
    setAnalysis({ ...analysis, draft_email: draft });
    setEditing(false);
    setEdited(true);
    toast.success(t("analysis.saved"));
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
          <h1 className="text-2xl font-bold text-primary">{t("analysis.signinView")}</h1>
          <p className="mt-2 text-muted-foreground">{t("analysis.signinViewSub")}</p>
          <Link
            to="/auth"
            search={{ redirect: `/analysis/${disputeId}` }}
            className="mt-6 inline-flex h-11 items-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground"
          >
            {t("nav.signIn")}
          </Link>
        </div>
      </Shell>
    );
  }

  if (!dispute) {
    return (
      <Shell>
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold text-primary">{t("analysis.notFound")}</h1>
          <p className="mt-2 text-muted-foreground">{t("analysis.notFoundSub")}</p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            {t("analysis.backDashboard")}
          </Link>
        </div>
      </Shell>
    );
  }

  const Icon = ICONS[dispute.category];
  const isWaiting =
    !analysis &&
    (dispute.status === "pending" || dispute.status === "analyzing");
  const failed = !analysis && dispute.status === "failed";
  const countryLabel = t(`countries.${dispute.country}`, { defaultValue: dispute.country });

  return (
    <Shell>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> {t("analysis.backToDisputes")}
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
                {t(`categories.${dispute.category}.label`)}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {countryLabel}
                {dispute.city ? ` · ${dispute.city}` : ""}
                {dispute.incident_date ? ` · ${dispute.incident_date}` : ""}
                {dispute.amount ? ` · ${dispute.amount} ${dispute.currency ?? ""}` : ""}
              </p>
            </div>
          </div>
          {analysis && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestRerun("en")}
                disabled={retrying || editing}
                className="gap-1.5"
                title={t("analysis.regenInEnglish")}
              >
                {retrying && retryLang === "en" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Languages className="h-3.5 w-3.5" />
                )}
                EN
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestRerun("zh")}
                disabled={retrying || editing}
                className="gap-1.5"
                title={t("analysis.regenInChinese")}
              >
                {retrying && retryLang === "zh" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Languages className="h-3.5 w-3.5" />
                )}
                中文
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestRerun()}
                disabled={retrying || editing}
                className="gap-1.5"
              >
                {retrying && retryLang === null ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {t("analysis.reanalyze")}
              </Button>
            </div>
          )}
        </div>
        <div className="mt-4 rounded-md bg-secondary/40 border border-border/60 p-3 text-sm text-muted-foreground italic">
          "{dispute.story.length > 240 ? dispute.story.slice(0, 240) + "…" : dispute.story}"
        </div>
      </div>

      {isWaiting && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-10 shadow-card text-center">
          <Sparkles className="mx-auto h-8 w-8 text-accent animate-pulse" />
          <h2 className="mt-3 text-lg font-semibold text-primary">{t("analysis.building")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("analysis.buildingSub", { country: countryLabel })}
          </p>
        </div>
      )}

      {failed && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <h2 className="text-lg font-semibold text-destructive">{t("analysis.failed")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("analysis.failedSub")}</p>
          <Button
            onClick={() => rerun()}
            disabled={retrying}
            className="mt-4 bg-accent text-accent-foreground hover:opacity-95"
          >
            {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("analysis.retry")}
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
              <Sparkles className="h-5 w-5 text-accent" /> {t("analysis.recommendation")}
            </h2>
            <div className="mt-2">
              <PlayAudioButton text={analysis.recommendation} cacheKey={`rec-${analysis.id}`} />
            </div>
            <div className="mt-3 prose-styles whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
              {analysis.recommendation}
            </div>
          </section>

          {/* Leverage points */}
          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="text-lg font-semibold text-primary">{t("analysis.leverage")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("analysis.leverageSub")}</p>
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
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-primary">{t("analysis.draftEmail")}</h2>
                {edited && !editing && (
                  <span className="inline-flex items-center rounded-full bg-accent/15 text-accent px-2 py-0.5 text-xs font-semibold">
                    {t("analysis.editedBadge")}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(false)}
                      disabled={saving}
                    >
                      {t("analysis.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveEdit}
                      disabled={saving || !draft.trim()}
                      className="gap-1.5 bg-accent text-accent-foreground hover:opacity-95"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {saving ? t("analysis.saving") : t("analysis.save")}
                    </Button>
                  </>
                ) : (
                  <>
                    <PlayAudioButton text={analysis.draft_email} cacheKey={`email-${analysis.id}`} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDraft(analysis.draft_email);
                        setEditing(true);
                      }}
                      className="gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" /> {t("analysis.edit")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(analysis.draft_email);
                        toast.success(t("analysis.copied"));
                      }}
                      className="gap-1.5"
                    >
                      <Copy className="h-3.5 w-3.5" /> {t("analysis.copy")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadText(analysis.draft_email, `complaint-${dispute.id.slice(0, 8)}.txt`)}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" /> {t("analysis.download")}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {editing ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="mt-4 min-h-[24rem] font-sans text-sm leading-relaxed"
                disabled={saving}
              />
            ) : (
              <>
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
                    {showFullEmail ? t("analysis.showLess") : t("analysis.showFull")}
                  </button>
                </div>
              </>
            )}
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-accent" /> {t("analysis.autoSaved")}
            </p>
          </section>
        </>
      )}

      <p className="mt-8 rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
        <strong className="text-primary">{t("analysis.disclaimer")}</strong> {t("analysis.disclaimerBody")}
      </p>

      <AlertDialog
        open={pendingRerun !== null}
        onOpenChange={(open) => !open && setPendingRerun(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("analysis.reanalyzeWarnTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("analysis.reanalyzeWarnBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("analysis.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const lang = pendingRerun;
                setPendingRerun(null);
                if (lang === "en" || lang === "zh") rerun(lang);
                else rerun();
              }}
            >
              {t("analysis.reanalyzeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const { t } = useTranslation();
  const map = {
    strong: { label: t("analysis.riskStrong"), sub: t("analysis.riskStrongSub"), color: "var(--risk-strong)", pct: 88 },
    moderate: { label: t("analysis.riskModerate"), sub: t("analysis.riskModerateSub"), color: "var(--risk-moderate)", pct: 60 },
    weak: { label: t("analysis.riskWeak"), sub: t("analysis.riskWeakSub"), color: "var(--risk-weak)", pct: 28 },
  }[risk];

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
          <path
            d={`M 20 100 A 80 80 0 0 1 180 100`}
            fill="none"
            stroke="var(--secondary)"
            strokeWidth="14"
            strokeLinecap="round"
          />
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
          <h2 className="mt-2 text-xl font-bold text-primary">{t("analysis.riskLevel")}</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{map.sub}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("analysis.confidence", { pct: confidence })}
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
