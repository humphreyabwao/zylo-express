"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  changeOwnPassword,
  updateOwnProfile,
} from "@/app/actions/admin/profile";
import type { ProfileRow } from "@/lib/supabase/types";
import { AdminButton, Panel, PanelHeader } from "@/components/admin/primitives";
import { Field, inputClass } from "@/components/admin/modal";

/** Your own details and password. Two panels, each saving independently. */

export function ProfileDetailsForm({ profile }: { profile: ProfileRow }) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    firstName: profile.first_name ?? "",
    lastName: profile.last_name ?? "",
    phone: profile.phone ?? "",
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <Panel>
      <PanelHeader title="Details" />

      <form
        className="space-y-4 p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setErrors({});

          const result = await updateOwnProfile(values);
          setSaving(false);

          if (result.ok) {
            toast.success(result.message);
            router.refresh();
          } else if (result.fieldErrors) {
            setErrors(result.fieldErrors);
          } else {
            toast.error(result.message);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName}>
            <input
              value={values.firstName}
              onChange={(event) => set("firstName", event.target.value)}
              className={inputClass(Boolean(errors.firstName))}
            />
          </Field>

          <Field label="Last name" error={errors.lastName}>
            <input
              value={values.lastName}
              onChange={(event) => set("lastName", event.target.value)}
              className={inputClass(Boolean(errors.lastName))}
            />
          </Field>
        </div>

        <Field label="Telephone" hint="Optional" error={errors.phone}>
          <input
            type="tel"
            value={values.phone}
            onChange={(event) => set("phone", event.target.value)}
            className={cn(inputClass(Boolean(errors.phone)), "admin-figure")}
          />
        </Field>

        <Field label="Email" hint="Not editable">
          <input
            value={profile.email}
            readOnly
            disabled
            className={cn(inputClass(false), "admin-figure opacity-60")}
          />
        </Field>

        <div className="flex justify-end">
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            Save
          </AdminButton>
        </div>
      </form>
    </Panel>
  );
}

export function ProfilePasswordForm() {
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [values, setValues] = React.useState({
    currentPassword: "",
    password: "",
    confirm: "",
  });

  const set = <K extends keyof typeof values>(key: K, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <Panel>
      <PanelHeader title="Password" />

      <form
        className="space-y-4 p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setErrors({});

          const result = await changeOwnPassword(values);
          setSaving(false);

          if (result.ok) {
            toast.success(result.message);
            setValues({ currentPassword: "", password: "", confirm: "" });
          } else if (result.fieldErrors) {
            setErrors(result.fieldErrors);
          } else {
            toast.error(result.message);
          }
        }}
      >
        <Field label="Current password" error={errors.currentPassword}>
          <input
            type="password"
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={(event) => set("currentPassword", event.target.value)}
            className={inputClass(Boolean(errors.currentPassword))}
          />
        </Field>

        <Field label="New password" hint="At least 10 characters" error={errors.password}>
          <input
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(event) => set("password", event.target.value)}
            className={inputClass(Boolean(errors.password))}
          />
        </Field>

        <Field label="Confirm" error={errors.confirm}>
          <input
            type="password"
            autoComplete="new-password"
            value={values.confirm}
            onChange={(event) => set("confirm", event.target.value)}
            className={inputClass(Boolean(errors.confirm))}
          />
        </Field>

        <div className="flex justify-end">
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            Change password
          </AdminButton>
        </div>
      </form>
    </Panel>
  );
}
