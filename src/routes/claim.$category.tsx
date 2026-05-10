import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  FileUp,
  Loader2,
  Plane,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteChrome";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, COUNTRIES, type CategoryKey } from "@/lib/categories";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useServerFn } from "@tanstack/react-start";
import { validateAndRegisterEvidence } from "@/lib/evidence.functions";

const categorySchema = z.object({
  category: z.enum(["hotel", "flight", "insurance"]),
});

export const Route = createFileRoute("/claim/$category")({
  parseParams: (p) => categorySchema.parse(p),
  head: ({ params }) => ({
    meta: [
      {
        title: `${CATEGORIES[params.category as CategoryKey].label} — Start a claim · RefundRight`,
      },
      {
        name: "description",
        content: `Start a ${CATEGORIES[params.category as CategoryKey].label.toLowerCase()} dispute. Get an AI rights analysis and a draft complaint email.`,
      },
    ],
  }),
  component: WizardPage,
});

const ICONS: Record<CategoryKey, typeof Building2> = {
  hotel: Building2,
  flight: Plane,
  insurance: ShieldAlert,
};

const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

type DraftFile = {
  id: string;
  file: File;
};

function WizardPage() {
  const { t, i18n } = useTranslation();
  const { category } = useParams({ from: "/claim/$category" });
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const cat = CATEGORIES[category as CategoryKey];
  const Icon = ICONS[category as CategoryKey];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [story, setStory] = useState("");
  const [country, setCountry] = useState<string>("");
  const [city, setCity] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const validateEvidence = useServerFn(validateAndRegisterEvidence);

  // Restore draft if redirected back from auth
  useEffect(() => {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem("rr_draft") : null;
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.category === category) {
        setStory(d.story ?? "");
        setCountry(d.country ?? "");
        setCity(d.city ?? "");
        setIncidentDate(d.incident_date ?? "");
        setAmount(d.amount ?? "");
        setCurrency(d.currency ?? "");
      }
    } catch {
      /* noop */
    }
  }, [category]);

  const storyValid = story.trim().length >= 50;
  const locationValid = country.length > 0;

  function nextStep() {
    if (step === 1 && !storyValid) {
      toast.error(t("wizard.errMin"));
      return;
    }
    if (step === 2 && !locationValid) {
      toast.error(t("wizard.errCountry"));
      return;
    }
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  }

  function prevStep() {
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: DraftFile[] = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        toast.error(t("wizard.errMaxFiles", { n: MAX_FILES }));
        break;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(t("wizard.errFileSize", { name: f.name }));
        continue;
      }
      if (f.size === 0 || !ALLOWED_MIMES.has(f.type)) {
        toast.error(t("wizard.errFileType", { name: f.name }));
        continue;
      }
      next.push({ id: crypto.randomUUID(), file: f });
    }
    setFiles(next);
  }

  async function submit() {
    if (submitting) return;
    if (!storyValid || !locationValid) {
      toast.error(t("wizard.errPrev"));
      return;
    }

    if (!user) {
      // Save draft and redirect to auth
      sessionStorage.setItem(
        "rr_draft",
        JSON.stringify({
          category,
          story,
          country,
          city,
          incident_date: incidentDate,
          amount,
          currency,
        }),
      );
      toast.message(t("wizard.signinPrompt"));
      navigate({
        to: "/auth",
        search: { redirect: `/claim/${category}`, draft: "1" },
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data: dispute, error: dErr } = await supabase
        .from("disputes")
        .insert({
          user_id: user.id,
          category,
          country,
          city: city.trim() || null,
          incident_date: incidentDate || null,
          story: story.trim(),
          amount: amount ? Number(amount) : null,
          currency: currency.trim() || null,
          status: "pending",
        })
        .select()
        .single();

      if (dErr || !dispute) {
        console.error(dErr);
        toast.error(t("wizard.errSave"));
        return;
      }

      // Upload evidence files (best-effort: failures don't block analysis)
      if (files.length > 0) {
        await Promise.all(
          files.map(async (f) => {
            const path = `${user.id}/${dispute.id}/${crypto.randomUUID()}-${f.file.name}`;
            const { error: upErr } = await supabase.storage
              .from("evidence")
              .upload(path, f.file, {
                contentType: f.file.type || "application/octet-stream",
                upsert: false,
              });
            if (upErr) {
              console.warn("Upload failed", f.file.name, upErr);
              return;
            }
            await supabase.from("dispute_evidence").insert({
              dispute_id: dispute.id,
              user_id: user.id,
              storage_path: path,
              file_name: f.file.name,
              mime_type: f.file.type || null,
              size_bytes: f.file.size,
            });
          }),
        );
      }

      sessionStorage.removeItem("rr_draft");

      // Trigger AI analysis via edge function
      const { error: fnErr } = await supabase.functions.invoke("analyze-dispute", {
        body: {
          dispute_id: dispute.id,
          language: i18n.language?.startsWith("zh") ? "zh" : "en",
        },
      });

      if (fnErr) {
        console.error(fnErr);
        const ctx: any = (fnErr as any).context;
        let msg = t("wizard.errAnalysis");
        try {
          if (ctx?.body) {
            const txt =
              typeof ctx.body === "string" ? ctx.body : await ctx.text?.();
            if (txt) {
              const parsed = JSON.parse(txt);
              if (parsed?.error) msg = parsed.error;
            }
          }
        } catch {
          /* ignore */
        }
        toast.error(msg);
      }

      navigate({ to: "/analysis/$disputeId", params: { disputeId: dispute.id } });
    } finally {
      setSubmitting(false);
    }
  }

  const progress = useMemo(() => t("wizard.stepOf", { current: step, total: 3 }), [step, t]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Icon className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-primary leading-tight">
                {t(`categories.${category as CategoryKey}.label`)}
              </h1>
              <p className="text-sm text-muted-foreground">{t(`categories.${category as CategoryKey}.tagline`)}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between mb-2 text-xs font-medium text-muted-foreground">
              <span>{progress}</span>
              <span>{t("wizard.percentComplete", { pct: Math.round((step / 3) * 100) })}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-card">
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-primary">{t("wizard.s1Title")}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t("wizard.s1Sub")}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="story" className="sr-only">{t("wizard.s1Title")}</Label>
                    <VoiceInputButton
                      language={i18n.language?.startsWith("zh") ? "zho" : "eng"}
                      onTranscript={(txt) =>
                        setStory((cur) => (cur.trim() ? `${cur.trim()} ${txt}` : txt))
                      }
                    />
                  </div>
                  <Textarea
                    id="story"
                    value={story}
                    onChange={(e) => setStory(e.target.value)}
                    placeholder={cat.examples[0]}
                    className="min-h-[220px] text-base leading-relaxed"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("wizard.s1Min", { count: story.trim().length })}</span>
                    {storyValid && (
                      <span className="inline-flex items-center gap-1 text-accent font-medium">
                        <Check className="h-3.5 w-3.5" /> {t("wizard.s1Good")}
                      </span>
                    )}
                  </div>
                </div>

                <details className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-primary">
                    {t("wizard.s1Prompt")}
                  </summary>
                  <ul className="mt-2 space-y-1.5 text-muted-foreground list-disc pl-5">
                    {cat.examples.map((ex) => (
                      <li key={ex}>{ex}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-primary">{t("wizard.s2Title")}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t("wizard.s2Sub")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="country">{t("wizard.country")}</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger id="country" className="h-11">
                      <SelectValue placeholder={t("wizard.selectCountry")} />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c} value={c}>{t(`countries.${c}`, { defaultValue: c })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="city">{t("wizard.cityOpt")}</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder={t("wizard.cityPh")}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="date">{t("wizard.dateOpt")}</Label>
                    <Input
                      id="date"
                      type="date"
                      value={incidentDate}
                      onChange={(e) => setIncidentDate(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">{t("wizard.amountOpt")}</Label>
                    <Input
                      id="amount"
                      type="number"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="5000"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="currency">{t("wizard.currency")}</Label>
                    <Input
                      id="currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 4))}
                      placeholder="THB"
                      className="h-11"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-primary">{t("wizard.s3Title")}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t("wizard.s3Sub")}</p>
                </div>

                <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/30 p-8 text-center cursor-pointer hover:border-accent/60 hover:bg-secondary/60 transition-colors">
                  <FileUp className="h-7 w-7 text-accent" />
                  <span className="text-sm font-medium text-primary">{t("wizard.tapToAdd")}</span>
                  <span className="text-xs text-muted-foreground">{t("wizard.fileTypes")}</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files)}
                  />
                </label>

                {files.length > 0 && (
                  <ul className="space-y-2">
                    {files.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-primary truncate">{f.file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(f.file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-destructive"
                          aria-label={`Remove ${f.file.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-xs text-muted-foreground rounded-md bg-secondary/40 border border-border p-3">
                  {t("wizard.skipOk")}
                </p>
              </div>
            )}
          </div>

          {/* Nav buttons */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={prevStep}
              disabled={step === 1 || submitting}
              className="text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {t("wizard.back")}
            </Button>
            {step < 3 ? (
              <Button
                onClick={nextStep}
                className="bg-accent text-accent-foreground hover:opacity-95 h-11 px-6 font-semibold"
              >
                {t("wizard.continue")} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={submit}
                disabled={submitting}
                className="bg-accent text-accent-foreground hover:opacity-95 h-11 px-6 font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("wizard.submitting")}
                  </>
                ) : (
                  <>
                    {t("wizard.submit")} <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>

          {!user && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              {t("wizard.signinPrompt")}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

// Suppress unused import warning for X icon (kept for future close-button slot)
void X;
