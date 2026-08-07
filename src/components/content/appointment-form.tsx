"use client";

import * as React from "react";
import { CalendarCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { requestAppointment } from "@/app/actions/appointments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * The appointment request form.
 *
 * Hand-rolled rather than built on react-hook-form like its neighbours. The
 * mode toggle changes which fields are required and which are shown, and
 * expressing that through a resolver plus `watch` is more machinery than the
 * eight fields here justify — the server is the validator that matters either
 * way, and its field errors are what this renders.
 *
 * ## The two-day floor
 *
 * `min` on the datetime input is set to 48 hours out, matching the server's
 * `MIN_LEAD_HOURS`. The browser constraint is a courtesy — it stops a customer
 * filling in a form that was always going to be refused — and the server check
 * is the one that decides, because a native `min` is trivially bypassed.
 */

export interface AppointmentFormProps {
  /** Boutique cities, from `BOUTIQUES`. Passed in so this stays a leaf. */
  boutiques: string[];
  /** Preselects a city when arriving from "Book in Paris". */
  defaultBoutique?: string;
  /** Preselects video when arriving from "Arrange a video appointment". */
  defaultMode?: "in-person" | "video";
  className?: string;
}

/** `datetime-local` wants local time, not a UTC ISO string. */
function toLocalField(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function AppointmentForm({
  boutiques,
  defaultBoutique,
  defaultMode = "in-person",
  className,
}: AppointmentFormProps) {
  const [sent, setSent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    name: "",
    email: "",
    phone: "",
    mode: defaultMode,
    boutique: defaultBoutique ?? boutiques[0] ?? "",
    preferredAt: "",
    alternateAt: "",
    partySize: "1",
    interest: "",
    notes: "",
  });

  /**
   * The earliest selectable slot, captured once on mount.
   *
   * Read in a lazy initialiser rather than during render — the clock is
   * impure, and a bound that moved on every keystroke would be its own small
   * source of confusion.
   */
  const [minDateTime] = React.useState(() =>
    toLocalField(new Date(Date.now() + 48 * 3600_000))
  );

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setErrors({});

    const partySize = Number.parseInt(values.partySize, 10);

    const result = await requestAppointment({
      name: values.name,
      email: values.email,
      phone: values.phone,
      mode: values.mode,
      boutique: values.mode === "in-person" ? values.boutique : "",
      preferredAt: values.preferredAt,
      alternateAt: values.alternateAt,
      partySize: Number.isNaN(partySize) ? Number.NaN : partySize,
      interest: values.interest,
      notes: values.notes,
    });

    setSubmitting(false);

    if (result.ok) {
      setSent(true);
      return;
    }
    if (result.fieldErrors) setErrors(result.fieldErrors);
    else setError(result.message);
  };

  if (sent) {
    return (
      <div className={cn("border border-hairline p-8 lg:p-10", className)}>
        <CalendarCheck className="size-6 text-champagne-dark" strokeWidth={1} />
        <h2 className="mt-5 font-display text-2xl font-light">
          Your request is with us
        </h2>
        <p className="mt-3 text-sm font-light leading-relaxed text-muted-foreground">
          A client advisor will confirm the time within one business day, and
          will write to you with a reference. Nothing is held until they do.
        </p>
        <Button
          variant="outline"
          className="mt-7"
          onClick={() => {
            setValues((current) => ({
              ...current,
              preferredAt: "",
              alternateAt: "",
              interest: "",
              notes: "",
            }));
            setSent(false);
          }}
        >
          Request another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn("space-y-7", className)} noValidate>
      {/* Mode. A segmented control rather than a select: there are two
          options, and which one is chosen changes the rest of the form. */}
      <fieldset>
        <legend className="eyebrow-sm mb-3 text-muted-foreground">
          How would you like to meet?
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {(["in-person", "video"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set("mode", mode)}
              aria-pressed={values.mode === mode}
              className={cn(
                "border px-4 py-3 text-sm font-light transition-colors duration-200",
                values.mode === mode
                  ? "border-foreground bg-foreground text-background"
                  : "border-hairline hover:border-foreground"
              )}
            >
              {mode === "in-person" ? "In the boutique" : "By video"}
            </button>
          ))}
        </div>
      </fieldset>

      {values.mode === "in-person" && (
        <FormRow label="Boutique" error={errors.boutique}>
          <select
            value={values.boutique}
            onChange={(event) => set("boutique", event.target.value)}
            className="h-11 w-full border border-hairline bg-transparent px-3 text-sm font-light outline-none transition-colors focus:border-foreground"
          >
            {boutiques.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </FormRow>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <FormRow label="Name" error={errors.name}>
          <Input
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            autoComplete="name"
          />
        </FormRow>

        <FormRow label="Email address" error={errors.email}>
          <Input
            type="email"
            value={values.email}
            onChange={(event) => set("email", event.target.value)}
            autoComplete="email"
          />
        </FormRow>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormRow label="Telephone (optional)" error={errors.phone}>
          <Input
            type="tel"
            value={values.phone}
            onChange={(event) => set("phone", event.target.value)}
            autoComplete="tel"
          />
        </FormRow>

        <FormRow label="Guests" error={errors.partySize}>
          <select
            value={values.partySize}
            onChange={(event) => set("partySize", event.target.value)}
            className="h-11 w-full border border-hairline bg-transparent px-3 text-sm font-light outline-none transition-colors focus:border-foreground"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((size) => (
              <option key={size} value={String(size)}>
                {size === 1 ? "Just me" : `${size} guests`}
              </option>
            ))}
          </select>
        </FormRow>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormRow
          label="Preferred time"
          hint="At least two days ahead"
          error={errors.preferredAt}
        >
          <Input
            type="datetime-local"
            value={values.preferredAt}
            min={minDateTime}
            onChange={(event) => set("preferredAt", event.target.value)}
          />
        </FormRow>

        <FormRow
          label="Alternative (optional)"
          hint="In case the first is taken"
          error={errors.alternateAt}
        >
          <Input
            type="datetime-local"
            value={values.alternateAt}
            min={minDateTime}
            onChange={(event) => set("alternateAt", event.target.value)}
          />
        </FormRow>
      </div>

      <FormRow
        label="What would you like to see? (optional)"
        error={errors.interest}
      >
        <Input
          value={values.interest}
          onChange={(event) => set("interest", event.target.value)}
          placeholder="The Belvoir trench, or anything made to order"
        />
      </FormRow>

      <FormRow label="Anything else? (optional)" error={errors.notes}>
        <Textarea
          value={values.notes}
          onChange={(event) => set("notes", event.target.value)}
          className="min-h-32"
        />
      </FormRow>

      {error && (
        <p
          role="alert"
          className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-light leading-relaxed text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? "Sending…" : "Request appointment"}
      </Button>
    </form>
  );
}

/* --------------------------------------------------------------------- row */

function FormRow({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-xs font-light uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        {hint && !error && (
          <span className="text-xs font-light text-muted-foreground/70">
            {hint}
          </span>
        )}
      </span>

      {children}

      {error && (
        <span className="mt-2 block text-xs font-light text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}
