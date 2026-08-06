"use client";

import * as React from "react";
import { toast } from "sonner";

import { updateProfile } from "@/app/actions/account";
import type { AccountProfile } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Editable profile details.
 *
 * A plain `<form action={serverAction}>` rather than react-hook-form: there
 * are four fields with no cross-field rules, and this way the form still
 * submits if JavaScript fails to load. Validation is Zod on the server, which
 * is where it has to happen regardless.
 */
export function ProfileForm({ profile }: { profile: AccountProfile }) {
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const onSubmit = (formData: FormData) => {
    setErrors({});
    startTransition(async () => {
      const result = await updateProfile({}, formData);

      if (result.fieldErrors) {
        setErrors(result.fieldErrors);
        return;
      }
      if (result.error) {
        toast.error("Could not save", { description: result.error });
        return;
      }
      if (result.success) toast.success(result.success);
    });
  };

  return (
    <form action={onSubmit} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={profile.firstName ?? ""}
            autoComplete="given-name"
            aria-invalid={Boolean(errors.firstName)}
            required
          />
          {errors.firstName && <FieldError>{errors.firstName}</FieldError>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={profile.lastName ?? ""}
            autoComplete="family-name"
            aria-invalid={Boolean(errors.lastName)}
            required
          />
          {errors.lastName && <FieldError>{errors.lastName}</FieldError>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={profile.phone ?? ""}
          autoComplete="tel"
          aria-invalid={Boolean(errors.phone)}
        />
        <p className="text-xs font-light text-muted-foreground">
          Couriers use this for delivery questions on cross-border parcels.
        </p>
        {errors.phone && <FieldError>{errors.phone}</FieldError>}
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox
          name="marketingOptIn"
          defaultChecked={profile.marketingOptIn}
          className="mt-0.5"
        />
        <span className="text-sm font-light leading-relaxed text-muted-foreground">
          Send me new arrivals and restock notices. Order updates are sent
          either way.
        </span>
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-xs font-light text-[#d12d2d]">
      {children}
    </p>
  );
}
