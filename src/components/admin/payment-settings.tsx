"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  Plug,
  Smartphone,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  clearPaymentKey,
  testPaystackConnection,
  updatePaymentCredentials,
} from "@/app/actions/admin/payments";
import type { MaskedCredentials } from "@/lib/payments/credentials";
import { AdminButton, Badge, Panel, PanelHeader } from "@/components/admin/primitives";
import { Field, inputClass } from "@/components/admin/modal";

/**
 * Paystack configuration.
 *
 * The stored keys are never sent here — the props carry hints like
 * `sk_test_••••a91f` and nothing more. So an empty input means "leave the
 * saved key alone", which is why the placeholder says so and why removing a
 * key is its own button rather than clearing the field.
 */

type Slot =
  | "test_secret_key"
  | "test_public_key"
  | "live_secret_key"
  | "live_public_key";

export function PaystackSettingsForm({
  credentials,
  canEdit,
}: {
  credentials: MaskedCredentials;
  /** Only a superadmin may move where the money lands. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [mode, setMode] = React.useState<"test" | "live">(credentials.mode);
  const [enabled, setEnabled] = React.useState(credentials.enabled);
  const [currency, setCurrency] = React.useState(credentials.settlementCurrency);
  const [keys, setKeys] = React.useState({
    testSecretKey: "",
    testPublicKey: "",
    liveSecretKey: "",
    livePublicKey: "",
  });

  const hint = mode === "live" ? credentials.liveSecretHint : credentials.testSecretHint;
  const typed = mode === "live" ? keys.liveSecretKey : keys.testSecretKey;

  // "Will checkout work in the mode I am about to save?" — a stored key for
  // the selected mode, or one typed in now, or the environment answering.
  const ready =
    Boolean(hint) ||
    Boolean(typed.trim()) ||
    (credentials.source === "environment" && credentials.mode === mode);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = await updatePaymentCredentials({
      provider: "paystack",
      mode,
      enabled,
      settlementCurrency: currency,
      ...keys,
    });

    setSaving(false);

    if (result.ok) {
      toast.success(result.message);
      // Wipe the inputs — what was typed is now stored and must not sit in the
      // DOM where the next person at this screen can read it.
      setKeys({
        testSecretKey: "",
        testPublicKey: "",
        liveSecretKey: "",
        livePublicKey: "",
      });
      router.refresh();
    } else if (result.fieldErrors) {
      setErrors(result.fieldErrors);
      toast.error(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const test = async () => {
    setTesting(true);
    const result = await testPaystackConnection();
    setTesting(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    const settles = result.currencies ?? [];

    // The failure that otherwise surfaces as a declined first order.
    if (settles.length > 0 && !settles.includes(currency)) {
      toast.warning(
        `${result.message} But this account settles ${settles.join(", ")}, not ${currency}.`
      );
      return;
    }

    toast.success(result.message);
  };

  const remove = async (slot: Slot, label: string) => {
    const result = await clearPaymentKey({ provider: "paystack", slot });
    if (result.ok) {
      toast.success(`${label} removed.`);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="Paystack"
        description="Cards and M-Pesa."
        action={
          <div className="flex items-center gap-2">
            {!ready ? (
              <Badge tone="neutral">Not configured</Badge>
            ) : !enabled ? (
              <Badge tone="neutral">Off</Badge>
            ) : mode === "live" ? (
              <Badge tone="positive">Live</Badge>
            ) : (
              <Badge tone="warning">Test</Badge>
            )}
          </div>
        }
      />

      <form onSubmit={submit} className="space-y-6 p-5">
        {/* ------------------------------------------------------- mode */}

        <div>
          <p className="mb-2 text-[0.75rem] font-semibold text-admin-fg">
            Environment
          </p>

          <div className="grid grid-cols-2 gap-2">
            <ModeOption
              active={mode === "test"}
              disabled={!canEdit}
              onClick={() => setMode("test")}
              title="Sandbox"
              description="Test keys. No money moves."
            />
            <ModeOption
              active={mode === "live"}
              disabled={!canEdit}
              onClick={() => setMode("live")}
              title="Production"
              description="Real cards, real M-Pesa."
              danger
            />
          </div>

          {mode === "live" && (
            <p className="mt-2 flex items-start gap-2 text-[0.6875rem] leading-relaxed text-champagne-dark">
              <TriangleAlert className="mt-px size-3.5 shrink-0" strokeWidth={2} />
              Customers will be charged for real from the moment this is saved.
            </p>
          )}
        </div>

        {/* ------------------------------------------------------- keys */}

        <div className="space-y-4 border-t border-admin-line pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[0.75rem] font-semibold text-admin-fg">
              API keys
            </p>
            <p className="text-[0.6875rem] text-admin-faint">
              Dashboard → Settings → API Keys &amp; Webhooks
            </p>
          </div>

          <KeyPair
            legend="Test"
            secret={{
              value: keys.testSecretKey,
              hint: credentials.testSecretHint,
              error: errors.testSecretKey,
              onChange: (v) => setKeys((c) => ({ ...c, testSecretKey: v })),
              onClear: () => remove("test_secret_key", "Test secret key"),
              placeholder: "sk_test_…",
            }}
            publicKey={{
              value: keys.testPublicKey,
              hint: credentials.testPublicHint,
              error: errors.testPublicKey,
              onChange: (v) => setKeys((c) => ({ ...c, testPublicKey: v })),
              onClear: () => remove("test_public_key", "Test public key"),
              placeholder: "pk_test_…",
            }}
            canEdit={canEdit}
          />

          <KeyPair
            legend="Live"
            secret={{
              value: keys.liveSecretKey,
              hint: credentials.liveSecretHint,
              error: errors.liveSecretKey,
              onChange: (v) => setKeys((c) => ({ ...c, liveSecretKey: v })),
              onClear: () => remove("live_secret_key", "Live secret key"),
              placeholder: "sk_live_…",
            }}
            publicKey={{
              value: keys.livePublicKey,
              hint: credentials.livePublicHint,
              error: errors.livePublicKey,
              onChange: (v) => setKeys((c) => ({ ...c, livePublicKey: v })),
              onClear: () => remove("live_public_key", "Live public key"),
              placeholder: "pk_live_…",
            }}
            canEdit={canEdit}
          />

          <p className="text-[0.6875rem] leading-relaxed text-admin-faint">
            Secret keys are stored where only this server can read them and are
            never shown again — only the last four characters. Leave a field
            blank to keep the key already saved.
          </p>
        </div>

        {/* --------------------------------------------------- settlement */}

        <div className="space-y-4 border-t border-admin-line pt-5">
          <Field
            label="Settlement currency"
            hint="What Paystack charges in"
            error={errors.settlementCurrency}
          >
            <input
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase().slice(0, 3))
              }
              disabled={!canEdit}
              placeholder="KES"
              className={cn(
                inputClass(Boolean(errors.settlementCurrency)),
                "admin-figure uppercase"
              )}
            />
            <span className="mt-1.5 block text-[0.6875rem] leading-relaxed text-admin-faint">
              The currency your Paystack account is registered for. Order totals
              are converted to it at charge time, and the rate used is recorded
              on the payment. M-Pesa exists only on Kenyan accounts, so KES.
            </span>
          </Field>

          <label
            className={cn(
              "flex items-start gap-3",
              canEdit ? "cursor-pointer" : "opacity-60"
            )}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              disabled={!canEdit}
              className="mt-0.5 size-4 accent-admin-fg"
            />
            <span>
              <span className="block text-[0.8125rem] font-medium text-admin-fg">
                Offer at checkout
              </span>
              <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-admin-faint">
                Turning this off removes card and M-Pesa from checkout without
                deleting the keys. Payments already in flight still settle.
              </span>
            </span>
          </label>
        </div>

        {/* ------------------------------------------------------ methods */}

        <div className="border-t border-admin-line pt-5">
          <p className="mb-2.5 text-[0.75rem] font-semibold text-admin-fg">
            Methods this unlocks
          </p>

          <div className="flex flex-wrap gap-2">
            <MethodChip icon={CreditCard} label="Card" on={ready && enabled} />
            <MethodChip icon={Smartphone} label="M-Pesa" on={ready && enabled} />
          </div>
        </div>

        {/* ------------------------------------------------------ actions */}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-admin-line pt-5">
          <AdminButton
            variant="secondary"
            onClick={test}
            disabled={testing || !ready || !canEdit}
          >
            {testing ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <Plug className="size-3.5" strokeWidth={2} />
            )}
            Test connection
          </AdminButton>

          <AdminButton type="submit" disabled={saving || !canEdit}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            Save
          </AdminButton>
        </div>

        {credentials.source === "environment" && (
          <p className="text-[0.6875rem] leading-relaxed text-admin-faint">
            Currently running on <code className="admin-figure">
              PAYSTACK_SECRET_KEY
            </code>{" "}
            from the environment. Saving a key here takes over from it.
          </p>
        )}
      </form>
    </Panel>
  );
}

/* ------------------------------------------------------------------ parts */

function ModeOption({
  active,
  disabled,
  onClick,
  title,
  description,
  danger,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-3 py-2.5 text-left transition-colors duration-150",
        active
          ? danger
            ? "border-champagne-dark bg-champagne/10"
            : "border-admin-fg bg-admin-hover"
          : "border-admin-line hover:bg-admin-hover",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-[0.8125rem] font-semibold",
          active && danger ? "text-champagne-dark" : "text-admin-fg"
        )}
      >
        {active && <CheckCircle2 className="size-3.5" strokeWidth={2} />}
        {title}
      </span>
      <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-admin-faint">
        {description}
      </span>
    </button>
  );
}

interface KeyFieldSpec {
  value: string;
  hint: string | null;
  error?: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder: string;
}

function KeyPair({
  legend,
  secret,
  publicKey,
  canEdit,
}: {
  legend: string;
  secret: KeyFieldSpec;
  publicKey: KeyFieldSpec;
  canEdit: boolean;
}) {
  return (
    <div className="rounded-md border border-admin-line p-3.5">
      <p className="mb-3 text-[0.625rem] font-medium uppercase tracking-[0.16em] text-admin-faint">
        {legend}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <KeyField label="Secret key" spec={secret} canEdit={canEdit} />
        <KeyField label="Public key" spec={publicKey} canEdit={canEdit} optional />
      </div>
    </div>
  );
}

function KeyField({
  label,
  spec,
  canEdit,
  optional,
}: {
  label: string;
  spec: KeyFieldSpec;
  canEdit: boolean;
  optional?: boolean;
}) {
  return (
    <Field
      label={label}
      hint={optional ? "Optional" : undefined}
      error={spec.error}
    >
      <input
        // `text`, not `password`: there is nothing to conceal — the field is
        // empty until somebody pastes into it, and a masked input only makes
        // it harder to check a key that was mistyped.
        type="text"
        value={spec.value}
        onChange={(event) => spec.onChange(event.target.value)}
        disabled={!canEdit}
        autoComplete="off"
        spellCheck={false}
        placeholder={spec.hint ?? spec.placeholder}
        className={cn(inputClass(Boolean(spec.error)), "admin-figure text-[0.75rem]")}
      />

      {spec.hint && (
        <span className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[0.6875rem] text-admin-faint">
            Saved · {spec.hint}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={spec.onClear}
              className="inline-flex items-center gap-1 text-[0.6875rem] text-admin-faint transition-colors hover:text-destructive"
            >
              <Trash2 className="size-3" strokeWidth={2} />
              Remove
            </button>
          )}
        </span>
      )}
    </Field>
  );
}

function MethodChip({
  icon: Icon,
  label,
  on,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  on: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[0.75rem] font-medium",
        on
          ? "border-admin-fg bg-admin-fg text-admin-panel"
          : "border-admin-line text-admin-faint"
      )}
    >
      <Icon className="size-3.5" strokeWidth={2} />
      {label}
    </span>
  );
}
