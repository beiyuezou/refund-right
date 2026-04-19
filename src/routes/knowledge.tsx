import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { ARTICLES } from "@/lib/knowledge";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "SE Asia traveler rights — Knowledge base · RefundRight" },
      {
        name: "description",
        content:
          "Country-by-country guides on consumer protection for travelers: Thailand, Singapore, Malaysia and more.",
      },
      {
        property: "og:title",
        content: "SE Asia traveler rights — Knowledge base · RefundRight",
      },
      {
        property: "og:description",
        content:
          "Practical, jurisdiction-specific guides on hotel deposits, flight delays, and insurance traps across Southeast Asia.",
      },
    ],
  }),
  component: KnowledgeIndex,
});

function KnowledgeIndex() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent uppercase tracking-wider">
            <BookOpen className="h-3.5 w-3.5" /> Knowledge base
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-primary">
            SE Asia traveler rights, plainly explained
          </h1>
          <p className="mt-3 text-muted-foreground max-w-2xl text-lg">
            Jurisdiction-specific guidance on the disputes travelers actually face — hotel
            deposits in Thailand, OTA disputes in Singapore, MAVCOM rules in Malaysia, and
            more.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            {ARTICLES.map((a) => (
              <Link
                key={a.slug}
                to="/knowledge/$slug"
                params={{ slug: a.slug }}
                className="group rounded-2xl border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated hover:border-accent/40"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {a.country}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {a.category}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-bold text-primary leading-snug group-hover:text-accent transition-colors">
                  {a.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                  {a.summary}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                  Read guide <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
