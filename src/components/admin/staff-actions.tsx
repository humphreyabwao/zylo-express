"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, KeyRound, Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  deleteStaffAccount,
  resetStaffPassword,
  setStaffSuspended,
  updateStaffAccount,
} from "@/app/actions/admin/staff";
import type { StaffListRow } from "@/lib/admin/queries";
import { AdminButton } from "@/components/admin/primitives";
import { MenuItem, MenuSeparator, RowMenu } from "@/components/admin/row-menu";
import {
  ConfirmDialog,
  Field,
  Modal,
  ModalBody,
  ModalFooter,
  inputClass,
} from "@/components/admin/modal";
import { Credential } from "@/components/admin/staff-create";
import { ModulePicker } from "@/components/admin/module-picker";
import { isUnrestricted } from "@/lib/admin/permissions";

/** Row actions for a portal account. */

type Busy = null | "suspend" | "delete" | "save" | "reset";

export function StaffActions({
  account,
  isSelf,
}: {
  account: StaffListRow;
  /** The caller's own row. Destructive actions are hidden on it. */
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Busy>(null);
  const [editing, setEditing] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const run = async (
    kind: Busy,
    work: () => Promise<{ ok: boolean; message: string }>
  ) => {
    setBusy(kind);
    try {
      const result = await work();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      return result;
    } finally {
      setBusy(null);
    }
  };

  const name =
    [account.first_name, account.last_name].filter(Boolean).join(" ") ||
    account.email;

  return (
    <>
      <RowMenu label={`Actions for ${name}`} busy={busy !== null}>
        {(close) => (
          <>
            <MenuItem
              icon={Pencil}
              label="Edit"
              onClick={() => {
                close();
                setEditing(true);
              }}
            />
            <MenuItem
              icon={KeyRound}
              label="Reset password"
              onClick={() => {
                close();
                setResetting(true);
              }}
            />

            <MenuSeparator />

            <MenuItem
              icon={account.suspended ? RotateCcw : Ban}
              label={account.suspended ? "Reinstate" : "Suspend"}
              // Suspending yourself locks you out of the portal you are in.
              disabled={isSelf}
              onClick={() => {
                close();
                void run("suspend", () =>
                  setStaffSuspended({
                    userId: account.id,
                    suspended: !account.suspended,
                  })
                );
              }}
            />

            <MenuSeparator />

            <MenuItem
              icon={Trash2}
              label="Delete"
              tone="danger"
              disabled={isSelf}
              onClick={() => {
                close();
                setDeleting(true);
              }}
            />
          </>
        )}
      </RowMenu>

      {editing && (
        <EditModal
          account={account}
          onClose={() => setEditing(false)}
          onSave={(values) => run("save", () => updateStaffAccount(values))}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          account={account}
          onClose={() => setResetting(false)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete account"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const result = await run("delete", () =>
              deleteStaffAccount(account.id)
            );
            return result.ok;
          }}
        >
          This permanently removes <strong>{name}</strong>, along with their
          saved addresses and wishlist. Orders and reviews they left survive,
          detached from the account. Suspending keeps everything and can be
          undone; this cannot.
        </ConfirmDialog>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- edit */

function EditModal({
  account,
  onClose,
  onSave,
}: {
  account: StaffListRow;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<{ ok: boolean }>;
}) {
  const [saving, setSaving] = React.useState(false);
  const [values, setValues] = React.useState({
    firstName: account.first_name ?? "",
    lastName: account.last_name ?? "",
    permissions: (account.permissions ?? []) as string[],
  });

  const unrestricted = isUnrestricted(account.role);

  return (
    <Modal title="Edit account" size="lg" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          const result = await onSave({ userId: account.id, ...values });
          setSaving(false);
          if (result.ok) onClose();
        }}
      >
        <ModalBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <input
                value={values.firstName}
                onChange={(event) =>
                  setValues((c) => ({ ...c, firstName: event.target.value }))
                }
                className={inputClass(false)}
              />
            </Field>

            <Field label="Last name">
              <input
                value={values.lastName}
                onChange={(event) =>
                  setValues((c) => ({ ...c, lastName: event.target.value }))
                }
                className={inputClass(false)}
              />
            </Field>
          </div>

          <Field label="Email" hint="Not editable">
            <input
              value={account.email}
              readOnly
              disabled
              className={cn(inputClass(false), "admin-figure opacity-60")}
            />
            <span className="mt-1.5 block text-[0.6875rem] text-admin-faint">
              Changing a sign-in address needs a confirmation email, and no mail
              provider is wired. Create a new account and delete this one.
            </span>
          </Field>

          <div className="border-t border-admin-line pt-4">
            <ModulePicker
              value={values.permissions}
              onChange={(next) =>
                setValues((c) => ({ ...c, permissions: next }))
              }
              disabled={unrestricted}
            />
          </div>

          <p className="text-[0.6875rem] text-admin-faint">
            Role is changed from the dropdown on the row.
          </p>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            Save
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------- reset password */

function ResetPasswordModal({
  account,
  onClose,
}: {
  account: StaffListRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [issued, setIssued] = React.useState<string | null>(null);

  if (issued) {
    return (
      <Modal title="Password reset" onClose={onClose}>
        <ModalBody className="space-y-4">
          <p className="text-[0.8125rem] leading-relaxed text-admin-muted">
            Shown once and not stored. Pass it on, and have them change it.
          </p>
          <Credential label="Email" value={account.email} />
          <Credential label="New password" value={issued} mono />
        </ModalBody>
        <ModalFooter>
          <AdminButton onClick={onClose}>Done</AdminButton>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal title="Reset password" description={account.email} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError(undefined);

          const result = await resetStaffPassword({
            userId: account.id,
            password,
          });
          setSaving(false);

          if (result.ok && result.temporaryPassword) {
            setIssued(result.temporaryPassword);
            router.refresh();
          } else {
            setError(result.fieldErrors?.password);
            if (!result.fieldErrors) toast.error(result.message);
          }
        }}
      >
        <ModalBody className="space-y-4">
          <Field
            label="New password"
            hint="Leave blank to generate"
            error={error}
          >
            <input
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              placeholder="Generated automatically"
              className={cn(inputClass(Boolean(error)), "admin-figure")}
            />
          </Field>

          <p className="text-[0.6875rem] leading-relaxed text-admin-faint">
            This signs the account out everywhere and takes effect immediately.
          </p>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            Reset
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}
