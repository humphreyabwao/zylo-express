"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { createStaffAccount } from "@/app/actions/admin/staff";
import { DEFAULT_STAFF_MODULES } from "@/lib/admin/permissions";
import { ModulePicker } from "@/components/admin/module-picker";
import { AdminButton } from "@/components/admin/primitives";
import {
  Field,
  Modal,
  ModalBody,
  ModalFooter,
  inputClass,
} from "@/components/admin/modal";

/**
 * Create a portal account.
 *
 * The alternative — have the person sign up on the storefront, then find them
 * under Customers and change their role — works, and is two systems and a
 * search for something an administrator should be able to do in one dialog.
 *
 * The account is created with a generated temporary password shown once. There
 * is no SMTP configured, so nothing can be emailed to them; the administrator
 * passes it on and the recipient changes it.
 */
export function StaffCreateButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <AdminButton onClick={() => setOpen(true)}>
        <Plus className="size-4" strokeWidth={2.2} />
        Add account
      </AdminButton>

      {open && (
        <StaffCreateModal
          onClose={() => setOpen(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </>
  );
}

function StaffCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  /** Set once the account exists. The dialog then shows the password instead. */
  const [issued, setIssued] = React.useState<{
    email: string;
    password: string;
  } | null>(null);

  const [values, setValues] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "staff" as "staff" | "admin",
    password: "",
    permissions: [...DEFAULT_STAFF_MODULES] as string[],
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = await createStaffAccount(values);
    setSaving(false);

    if (result.ok && result.temporaryPassword && result.email) {
      toast.success(result.message);
      setIssued({ email: result.email, password: result.temporaryPassword });
      onCreated();
      return;
    }

    if (result.fieldErrors) setErrors(result.fieldErrors);
    else toast.error(result.message);
  };

  if (issued) {
    return (
      <Modal title="Account created" onClose={onClose}>
        <ModalBody className="space-y-4">
          <p className="text-[0.8125rem] leading-relaxed text-admin-muted">
            Pass these to {values.firstName}. The password is shown once and is
            not stored — if it is lost, reset it rather than looking it up.
          </p>

          <Credential label="Email" value={issued.email} />
          <Credential label="Temporary password" value={issued.password} mono />
        </ModalBody>

        <ModalFooter>
          <AdminButton onClick={onClose}>Done</AdminButton>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal title="Add account" size="lg" onClose={onClose}>
      <form onSubmit={submit}>
        <ModalBody className="space-y-4">
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

          <Field label="Email" error={errors.email}>
            <input
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
              className={cn(inputClass(Boolean(errors.email)), "admin-figure")}
            />
          </Field>

          <Field
            label="Password"
            hint="Leave blank to generate"
            error={errors.password}
          >
            <input
              type="text"
              value={values.password}
              onChange={(event) => set("password", event.target.value)}
              autoComplete="off"
              placeholder="Generated automatically"
              className={cn(inputClass(Boolean(errors.password)), "admin-figure")}
            />
          </Field>

          <Field
            label="Role"
            hint={
              values.role === "admin"
                ? "Can change roles and settings"
                : "Can run the shop"
            }
            error={errors.role}
          >
            <select
              value={values.role}
              onChange={(event) =>
                set("role", event.target.value as "staff" | "admin")
              }
              className={cn(
                "h-9 w-full rounded-md border bg-transparent px-3 text-[0.8125rem] text-admin-fg outline-none transition-colors duration-200",
                "[&>option]:bg-admin-panel [&>option]:text-admin-fg",
                errors.role
                  ? "border-destructive"
                  : "border-admin-line focus:border-champagne"
              )}
            >
              <option value="staff">Staff</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>

          <div className="border-t border-admin-line pt-4">
            <ModulePicker
              value={values.permissions}
              onChange={(next) => set("permissions", next)}
            />
          </div>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Creating…" : "Create account"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** A value with a copy button. Shared with the reset-password dialog. */
export function Credential({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div>
      <p className="mb-1.5 text-[0.75rem] font-semibold text-admin-fg">{label}</p>
      <div className="flex items-center gap-2 rounded-md border border-admin-line bg-admin-hover px-3 py-2.5">
        <span
          className={cn(
            "min-w-0 flex-1 break-all text-[0.8125rem] text-admin-fg",
            mono && "admin-figure"
          )}
        >
          {value}
        </span>

        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            } catch {
              // Clipboard needs a secure context; over plain HTTP it is denied.
              toast.error("Could not copy. Select the text instead.");
            }
          }}
          className="grid size-7 shrink-0 place-items-center rounded text-admin-muted transition-colors hover:bg-admin-panel hover:text-admin-fg"
        >
          {copied ? (
            <Check className="size-3.5 text-success" strokeWidth={2} />
          ) : (
            <Copy className="size-3.5" strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
}
