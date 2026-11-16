import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { normalizeAuthError, useGoogleSignIn } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Google's mark, inline so the button needs no icon package (Lucide carries no
 * brand icons) and no network request.
 */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#34A853"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#EA4335"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

interface GoogleAuthButtonProps {
  /** Button copy. Same flow for sign-in and sign-up: Google decides which it is. */
  label?: string;
  /**
   * Override the return URL. Defaults to `oauthRedirectUrl()` (/login), which is
   * where AuthProvider takes over regardless of which page started the flow.
   */
  redirectTo?: string;
  /** Disable while the neighbouring email form is submitting. */
  disabled?: boolean;
  className?: string;
}

/**
 * "Continue with Google".
 *
 * The button renders one provider and reports one thing: whether the redirect
 * to Google could be started. It never inspects the account afterwards -- a
 * Google session is an ordinary session, and authorization still comes from the
 * database (PRD 5, 40), so nothing here can widen access.
 */
export function GoogleAuthButton({
  label = "Continue with Google",
  redirectTo,
  disabled = false,
  className,
}: GoogleAuthButtonProps) {
  const google = useGoogleSignIn();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn("w-full", className)}
        disabled={disabled || google.isPending}
        onClick={() => google.mutate(redirectTo ? { redirectTo } : undefined)}
      >
        {google.isPending ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
        {google.isPending ? "Redirecting to Google..." : label}
      </Button>

      {google.error ? (
        <p
          role="alert"
          className="form-message animate-in fade-in rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive duration-150"
        >
          {normalizeAuthError(google.error)}
        </p>
      ) : null}
    </>
  );
}

/** "or" rule between the Google button and the email form. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="relative" aria-hidden="true">
      <Separator />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
