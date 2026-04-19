import { Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { useAuth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform group-hover:scale-105">
            <Shield className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <span className="font-bold text-lg tracking-tight text-primary">
            Refund<span className="text-accent">Right</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3">
          <Link
            to="/knowledge"
            className="hidden sm:inline-flex h-9 items-center px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Knowledge
          </Link>
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="hidden sm:inline-flex h-9 items-center px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                My Disputes
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut()}
                className="hidden sm:inline-flex"
              >
                Sign out
              </Button>
            </>
          ) : (
            <Link
              to="/auth"
              className="hidden sm:inline-flex h-9 items-center px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              Sign in
            </Link>
          )}
          <Link
            to="/claim/$category"
            params={{ category: "hotel" }}
            className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-all hover:opacity-95 hover:shadow"
          >
            Report Dispute
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background mt-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Shield className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="font-bold text-primary">
              Refund<span className="text-accent">Right</span>
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground max-w-xs">
            AI-powered legal assistant for SE Asia travel disputes. Built for travelers, not platforms.
          </p>
        </div>
        <div className="text-sm">
          <h4 className="font-semibold text-primary mb-3">Tools</h4>
          <ul className="space-y-2 text-muted-foreground">
            <li><Link to="/claim/$category" params={{ category: "hotel" }} className="hover:text-primary">Hotel disputes</Link></li>
            <li><Link to="/claim/$category" params={{ category: "flight" }} className="hover:text-primary">Flight disruptions</Link></li>
            <li><Link to="/claim/$category" params={{ category: "insurance" }} className="hover:text-primary">Insurance traps</Link></li>
            <li><Link to="/knowledge" className="hover:text-primary">Knowledge base</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <h4 className="font-semibold text-primary mb-3">Important</h4>
          <p className="text-muted-foreground leading-relaxed">
            RefundRight provides general information only and does not constitute legal advice.
            For binding advice on your specific situation, consult a qualified lawyer in the relevant jurisdiction.
          </p>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} RefundRight</span>
          <span>Informational only · Not legal advice</span>
        </div>
      </div>
    </footer>
  );
}
