"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Send, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  clearEmailKey,
  sendTestEmail,
  updateEmailSettings,
} from "@/app/actions/admin/email";
import type { MaskedEmailCredentials } from "@/lib/email/credentials";
import {
  AdminButton,
  Badge,
  Panel,
  PanelHeader,
} from "@/components/admin/primitives";
import { Field, Toggle, inputClass } from "@/components/admin/modal";

/**
 * Resend configuration.
 *
 * The stored key is never sent here — the props carry a hint like `re_••••a91f`
 * and nothing more. An empty input therefore means "leave the saved key alone",
 * which is why the placeholder says so and why removing it is its own button
 * rather than clearing the field.
 *
 * Supabase is not an option for this. Its email is Auth-only — confirmation,
 * magic link, password reset — with no API for arbitrary order mail, so an
 * external provider is a requirement rather than a preference.
 */

export function EmailSettingsForm({
  credentials,
  canEdit,
  operatorEmail,
}: {
  credentials: MaskedEmailCredentials;
  /** Only a superadmin may hold a key that can send mail as this shop. */
  canEdit: boolean;
  /** Pre-fills the test field with somewhere the operator can actually check. */
  operatorEmail: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [apiKey, setApiKey] = React.useState("");
  const [fromEmail, setFromEmail] = React.useState(credentials.fromEmail);
  const [fromName, setFromName] = React.useState(credentials.fromName);
  const [replyTo, setReplyTo] = React.useState(credentials.replyTo ?? "");
  const [enabled, setEnabled] = React.useState(credentials.enabled);
  const [onStatus, setOnStatus] = React.useState(credentials.notifyOnStatus);
  const [onTracking, setOnTracking] = React.useState(credentials.notifyOnTracking);
  const [testTo, setTestTo] = React.useState(operatorEmail);

  const ready =
    Boolean(credentials.apiKeyHint) ||
    Boolean(apiKey.trim()) ||
    credentials.source === "environment";

  // Recomputed from the field rather than the prop, so the warning appears as
  // soon as somebody types the sandbox address back in.
  const sandbox = fromEmail.trim().toLowerCase() === "onboarding@resend.dev";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = await updateEmailSettings({
      apiKey,
      fromEmail,
      fromName,
      replyTo,
      enabled,
      notifyOnStatus: onStatus,
      notifyOnTracking: onTracking,
    });

    setSaving(false);

    if (result.ok) {
      toast.success(result.message);
      // What was typed is now stored and must not sit in the DOM where the next
      // person at this screen can read it.
      setApiKey("");
      router.refresh();
    } else {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      toast.error(result.message);
    }
  };

  const test = async () => {
    setTesting(true);
    const result = await sendTestEmail({ to: testTo });
    setTesting(false);

    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  };

  const remove = async () => {
    const result = await clearEmailKey();
    if (result.ok) {
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="Email"
        description="Order and tracking mail, via Resend."
        action={
          !ready ? (
            <Badge tone="neutral">Not configured</Badge>
          ) : !enabled ? (
            <Badge tone="neutral">Off</Badge>
          ) : sandbox ? (
            <Badge tone="warning">Sandbox</Badge>
          ) : (
            <Badge tone="positive">Live</Badge>
          )
        }
      />

      <form onSubmit={submit} className="space-y-6 p-5">
        {/* ------------------------------------------------------------ key */}

        <div className="space-y-4">
          <Field
            label="API key"
            hint={
              credentials.apiKeyHint
                ? `Stored: ${credentials.apiKeyHint}. Leave blank to keep it.`
                : "From resend.com → API Keys. Starts with re_."
            }
          >
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              disabled={!canEdit}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                credentials.apiKeyHint ? "•••••••••••• (unchanged)" : "re_…"
              }
              className={cn(inputClass(Boolean(errors.apiKey)), "mt-1")}
            />
            {errors.apiKey && (
              <p className="mt-1 text-[0.75rem] text-destructive">{errors.apiKey}</p>
            )}
          </Field>

          {credentials.source === "environment" && (
            <p className="text-[0.6875rem] leading-relaxed text-admin-faint">
              Currently running on <code>RESEND_API_KEY</code> from the
              environment. Saving a key here takes over from it.
            </p>
          )}
        </div>

        {/* --------------------------------------------------------- sender */}

        <div className="space-y-4 border-t border-admin-line pt-5">
          <p className="text-[0.75rem] font-semibold text-admin-fg">Sender</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From name">
              <input
                value={fromName}
                disabled={!canEdit}
                onChange={(event) => setFromName(event.target.value)}
                maxLength={80}
                className={cn(inputClass(Boolean(errors.fromName)), "mt-1")}
              />
            </Field>

            <Field label="From address">
              <input
                type="email"
                value={fromEmail}
                disabled={!canEdit}
                onChange={(event) => setFromEmail(event.target.value)}
                maxLength={200}
                className={cn(inputClass(Boolean(errors.fromEmail)), "mt-1")}
              />
            </Field>
          </div>

          <Field
            label="Reply-to"
            hint="Optional. Where a customer's reply lands."
          >
            <input
              type="email"
              value={replyTo}
              disabled={!canEdit}
              onChange={(event) => setReplyTo(event.target.value)}
              placeholder="orders@zylo.example.com"
              maxLength={200}
              className={cn(inputClass(Boolean(errors.replyTo)), "mt-1")}
            />
          </Field>

          {/*
            The failure that otherwise looks like a bug: Resend returns 200 for
            a sandbox send and then delivers only to the account's own address.
            Every customer email silently goes nowhere, and nothing in the UI
            would say so.
          */}
          {sandbox && (
            <p className="flex items-start gap-2 rounded-md border border-champagne/40 bg-champagne/10 px-3 py-2.5 text-[0.6875rem] leading-relaxed text-champagne-dark">
              <TriangleAlert className="mt-px size-3.5 shrink-0" strokeWidth={2} />
              <span>
                This is Resend&rsquo;s shared sandbox sender. Mail sent from it
                reaches <strong>only your own Resend account address</strong> —
                customers get nothing, and the API still reports success. Verify
                a domain at resend.com and put an address on it here.
              </span>
            </p>
          )}
        </div>

        {/* ---------------------------------------------------------- what */}

        <div className="space-y-4 border-t border-admin-line pt-5">
          <p className="text-[0.75rem] font-semibold text-admin-fg">
            What goes out
          </p>

          <Toggle
            checked={enabled}
            onChange={setEnabled}
            disabled={!canEdit}
            label="Email customers"
            hint="The master switch. Off means nothing is sent, whatever is set below."
          />
          <Toggle
            checked={onStatus}
            onChange={setOnStatus}
            disabled={!canEdit || !enabled}
            label="Status changes"
            hint="Confirmed, being prepared, dispatched, delivered, cancelled, refunded."
          />
          <Toggle
            checked={onTracking}
            onChange={setOnTracking}
            disabled={!canEdit || !enabled}
            label="Tracking checkpoints"
            hint="Each location update an operator records against an order."
          />
        </div>

        {/* ---------------------------------------------------------- actions */}

        <div className="flex flex-wrap items-center gap-2 border-t border-admin-line pt-5">
          <AdminButton type="submit" disabled={!canEdit || saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Save"}
          </AdminButton>

          {credentials.apiKeyHint && (
            <AdminButton
              type="button"
              variant="secondary"
              disabled={!canEdit}
              onClick={remove}
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
              Remove key
            </AdminButton>
          )}
        </div>

        {/* ------------------------------------------------------------ test */}

        <div className="space-y-3 border-t border-admin-line pt-5">
          <p className="flex items-center gap-2 text-[0.75rem] font-semibold text-admin-fg">
            <Mail className="size-3.5" strokeWidth={2} />
            Send a test
          </p>
          <p className="text-[0.6875rem] leading-relaxed text-admin-faint">
            Uses the key that is <em>saved</em>, not what is typed above — what
            matters is whether order mail will work, and order mail reads the
            saved one.
          </p>

          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
              placeholder="you@example.com"
              className={cn(inputClass(false), "min-w-0 flex-1")}
            />
            <AdminButton
              type="button"
              variant="secondary"
              disabled={!canEdit || testing || !ready}
              onClick={test}
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <Send className="size-3.5" strokeWidth={2} />
              )}
              {testing ? "Sending…" : "Send"}
            </AdminButton>
          </div>
        </div>

        {!canEdit && (
          <p className="text-[0.6875rem] leading-relaxed text-admin-faint">
            A key that can send mail as this shop is a super administrator
            setting, like the payment keys.
          </p>
        )}
      </form>
    </Panel>
  );
}
