// =========================================================
// FRELUX ARCHIE STAGE 1, OWNER GUARD
//
// The ARCHIE PWA is Owner-only. Three states, no fake
// access: loading, redirect to sign in, or an honest
// "Owner access only" boundary for non-owner accounts.
// =========================================================
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function RequireOwner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        role="status"
        aria-label="Checking owner authorization"
      >
        <Loader2
          className="h-6 w-6 animate-spin text-primary"
          aria-hidden="true"
        />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <ShieldCheck className="h-10 w-10 text-primary" aria-hidden="true" />
        <h1 className="font-display text-xl font-bold text-foreground">
          Sign in required
        </h1>
        <p className="text-sm text-muted-foreground">
          ARCHIE is a private Owner application. Sign in with the Owner account
          to continue.
        </p>
        <Link
          to="/login"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <ShieldCheck
          className="h-10 w-10 text-destructive"
          aria-hidden="true"
        />
        <h1 className="font-display text-xl font-bold text-foreground">
          Owner access only
        </h1>
        <p className="text-sm text-muted-foreground">
          This account is not authorized for the ARCHIE Owner application.
          ARCHIE is restricted to the FRELUX Owner. This attempt is recorded.
        </p>
        <Link
          to="/"
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          Back to FRELUX
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
