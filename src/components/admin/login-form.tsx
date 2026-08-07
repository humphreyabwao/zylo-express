"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { adminSignIn, type AdminAuthState } from "@/app/actions/admin/auth";

/**
 * Portal sign-in form.
 *
 * Styled in the storefront's language rather than the workspace's — see the
 * note on the page. Hairline-underlined fields, square edges, the long easing.
 *
 * A plain `<form action>` rather than an onSubmit handler: the action runs
 * server-side and ends in a `redirect`, which React's form integration follows.
 * It also works before hydration, which on a sign-in page is worth having.
 */

const initialState: AdminAuthState = {};

export function AdminLoginForm() {
  const [state, formAction] = useActionState(adminSignIn, initialState);

  return (
    <form action={formAction} className="space-y-9" noValidate>
      <Field
        id="admin-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="username"
        error={state.fieldErrors?.email}
      />

      <Field
        id="admin-password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />

      {/* Above the button: a refusal read after pressing Sign in should be
          where the eye already is. A hairline rule rather than a filled alert
          box — the palette has one loud colour and this is not the place to
          spend it. */}
      {state.error && (
        <p
          role="alert"
          className="border-l border-destructive pl-4 text-sm font-light leading-relaxed text-destructive"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function Field({
  id,
  name,
  type,
  label,
  autoComplete,
  error,
}: {
  id: string;
  name: string;
  type: "email" | "password";
  label: string;
  autoComplete: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow-sm block text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        className={cn(
          "mt-3 h-11 w-full border-b bg-transparent px-0 text-base font-light text-foreground",
          "transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "outline-none hover:border-border-strong focus:border-foreground",
          error ? "border-destructive" : "border-input"
        )}
      />
      {error && (
        <p className="mt-2.5 text-xs font-light text-destructive">{error}</p>
      )}
    </div>
  );
}

/**
 * Split out because `useFormStatus` reports on the nearest parent `<form>` and
 * only from a component rendered inside it — reading it in the form's own
 * component returns a permanently idle status.
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "group flex h-13 w-full items-center justify-center gap-3 bg-foreground px-8",
        "eyebrow-sm text-background",
        "transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "outline-none hover:opacity-85 focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-4 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50"
      )}
    >
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
          Signing in
        </>
      ) : (
        <>
          Sign in
          <ArrowRight
            className="size-3.5 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1"
            strokeWidth={1.5}
          />
        </>
      )}
    </button>
  );
}
