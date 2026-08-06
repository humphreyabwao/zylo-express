"use client";

import { useFormStatus } from "react-dom";

import { signInWithGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

/**
 * Google's four-colour mark, inline.
 *
 * Inline rather than an <img>: the Content-Security-Policy in next.config.ts
 * allows images only from our own origin and Supabase Storage, so a hotlink to
 * Google's CDN would be blocked. Fixed brand colours by design — Google's
 * guidelines do not permit recolouring, so this is one of the few marks that
 * must not follow the theme.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      size="lg"
      block
      disabled={pending}
      // The mark keeps its own colours, so the hover state must not invert the
      // button underneath it into something the logo cannot sit on.
      className="hover:border-border-strong hover:bg-secondary hover:text-foreground"
    >
      {pending ? (
        "Redirecting to Google…"
      ) : (
        <>
          <GoogleMark />
          {label}
        </>
      )}
    </Button>
  );
}

/**
 * Google sign-in, as a plain form posting to a Server Action.
 *
 * A form rather than an onClick handler so it still works if the JavaScript
 * never loads — the action mints the authorize URL server-side and answers
 * with a redirect, which a browser follows without our help.
 */
export function GoogleButton({
  /** Where to land after the round trip. Carried through Google and back. */
  redirectTo = "/account",
  label = "Continue with Google",
}: {
  redirectTo?: string;
  label?: string;
}) {
  return (
    <form action={signInWithGoogle} className="w-full">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <Submit label={label} />
    </form>
  );
}

/** "or" rule between the Google button and the email form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-4" aria-hidden>
      <span className="h-px flex-1 bg-hairline" />
      <span className="eyebrow-sm text-muted-foreground">or</span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}
