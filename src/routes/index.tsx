import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Plane,
  ShieldAlert,
  CheckCircle2,
  Sparkles,
  ScrollText,
  FileText,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { CATEGORIES, type CategoryKey } from "@/lib/categories";
import { ARTICLES } from "@/lib/knowledge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RefundRight — Don't let them keep your money" },
      {
        name: "description",
        content:
          "AI-powered legal assistant for travel disputes in Southeast Asia. Hotel deposits, flight delays, insurance denials — get a rights analysis and a draft complaint in minutes.",
      },
      { property: "og:title", content: "RefundRight — Don't let them keep your money" },
      {
        property: "og:description",
        content:
          "Free, AI-powered rights analysis for travelers fighting hotels, airlines, and booking platforms across Southeast Asia.",
      },
    ],
  }),
  component: HomePage,
});

const CATEGORY_ICONS: Record<CategoryKey, typeof Building2> = {
  hotel: Building2,
  flight: Plane,
  insurance: ShieldAlert,
};

function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background"
        />
        <div
          aria-hidden
          className="absolute -top-24 -right-24 -z-10 h-72 w-72 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 sm:pt-20 pb-12 sm:pb-20">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" /> SE Asia · AI-powered
            </span>
            <h1 className="mt-5 text-4xl sm:text-6xl font-extrabold tracking-tight text-primary leading-[1.05]">
              Don't let them <br className="hidden sm:block" />
              keep <span className="text-accent">your money</span>.
            </h1>
            <p className="mt-5 text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed">
              AI-powered legal assistant for travel disputes, flight delays, and hotel
              deposit issues. Built for travelers in Thailand, Singapore, Malaysia and
              across Southeast Asia.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/claim/$category"
                params={{ category: "hotel" }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-base font-semibold text-accent-foreground shadow-elevated transition-all hover:opacity-95"
              >
                Start a Dispute <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-input bg-background px-5 text-base font-medium text-primary transition-colors hover:bg-secondary"
              >
                How it works
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent" /> AI-powered
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent" /> SE Asia focused
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent" /> Free to start
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
              What happened?
            </h2>
            <p className="mt-2 text-muted-foreground max-w-xl">
              Pick a category to get a tailored rights analysis and a draft complaint.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:gap-5 md:grid-cols-3">
          {(Object.keys(CATEGORIES) as CategoryKey[]).map((key) => {
            const c = CATEGORIES[key];
            const Icon = CATEGORY_ICONS[key];
            return (
              <Link
                key={key}
                to="/claim/$category"
                params={{ category: key }}
                className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated hover:border-accent/40"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors group-hover:bg-accent">
                  <Icon className="h-6 w-6" strokeWidth={2.2} />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-primary">{c.label}</h3>
                <p className="text-sm font-medium text-accent mt-0.5">{c.tagline}</p>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {c.description}
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:text-accent transition-colors">
                  Start claim <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-secondary/40 border-y border-border/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
            Three steps. No legalese.
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                n: "01",
                title: "Tell us what happened",
                body: "Describe your situation, where it happened, and upload evidence (screenshots, receipts).",
                Icon: ScrollText,
              },
              {
                n: "02",
                title: "AI analyzes your rights",
                body: "Grounded in Thai CPA, Singapore CPFTA, MAVCOM rules and more — a real legal analysis, not a chatbot.",
                Icon: Sparkles,
              },
              {
                n: "03",
                title: "Get your draft complaint",
                body: "A formal email, ready to send to the platform or regulator. Plus the leverage points to push back.",
                Icon: FileText,
              },
            ].map((s) => (
              <div key={s.n} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                    {s.n}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-primary">
                    <s.Icon className="h-5 w-5 text-accent" />
                    <h3 className="font-semibold text-lg">{s.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Knowledge teaser */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
              Know your rights
            </h2>
            <p className="mt-2 text-muted-foreground">
              Country-specific guides for SE Asia travelers.
            </p>
          </div>
          <Link
            to="/knowledge"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            All articles <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {ARTICLES.slice(0, 3).map((a) => (
            <Link
              key={a.slug}
              to="/knowledge/$slug"
              params={{ slug: a.slug }}
              className="group rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated hover:border-accent/40"
            >
              <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                {a.country}
              </span>
              <h3 className="mt-3 font-semibold text-primary leading-snug group-hover:text-accent transition-colors">
                {a.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                {a.summary}
              </p>
            </Link>
          ))}
        </div>
        <div className="mt-6 sm:hidden">
          <Link
            to="/knowledge"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
          >
            All articles <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
