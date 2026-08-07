"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  refreshExchangeRates,
  updateCurrencySettings,
  updateStorefrontSettings,
} from "@/app/actions/admin/settings";
import {
  CURRENCY_LABEL,
  SUPPORTED_CURRENCIES,
  formatBaseAmount,
  formatCurrency,
  minorUnitExponent,
  type CurrencyConfig,
} from "@/lib/currency";
import { AdminButton, Badge, Panel, PanelHeader } from "@/components/admin/primitives";
import { Field, inputClass } from "@/components/admin/modal";

/**
 * Settings forms.
 *
 * Two independent panels, each saving on its own. A single "Save settings"
 * button spanning both would mean an operator correcting one exchange rate
 * also re-writes the announcement bar — and would make a validation failure in
 * one half block the other.
 */

/* ----------------------------------------------------------------- currency */

export function CurrencySettingsForm({
  config,
  ratesUpdatedAt,
  ratesSource,
}: {
  config: CurrencyConfig;
  ratesUpdatedAt: string | null;
  ratesSource: string | null;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [defaultCurrency, setDefaultCurrency] = React.useState(config.default);
  const [enabled, setEnabled] = React.useState<string[]>(config.enabled);
  const [rates, setRates] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const code of SUPPORTED_CURRENCIES) {
      const rate = config.rates[code];
      initial[code] = rate ? String(rate) : "";
    }
    return initial;
  });

  const base = config.base;

  const toggle = (code: string) => {
    // The base is always offered — it is the only currency guaranteed exact,
    // and removing it would leave the switcher unable to fall back.
    if (code === base) return;

    setEnabled((current) =>
      current.includes(code)
        ? current.filter((value) => value !== code)
        : [...current, code]
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const parsedRates: Record<string, number> = {};
    for (const code of enabled) {
      if (code === base) continue;
      const value = Number.parseFloat(rates[code] ?? "");
      // NaN rather than a default: zod reports it as "no exchange rate"
      // against the currency, instead of silently pricing at parity.
      parsedRates[code] = Number.isFinite(value) ? value : Number.NaN;
    }

    const result = await updateCurrencySettings({
      base,
      defaultCurrency,
      enabled,
      rates: parsedRates,
    });

    setSaving(false);

    if (result.ok) {
      toast.success(result.message);
      router.refresh();
    } else if (result.fieldErrors) {
      setErrors(result.fieldErrors);
    } else {
      toast.error(result.message);
    }
  };

  /** A worked example, so a rate is checkable at a glance. */
  const sample = 125_000;

  return (
    <Panel>
      <PanelHeader
        title="Currency"
        description={
          ratesUpdatedAt
            ? `Rates from ${ratesSource ?? "provider"} · ${new Date(ratesUpdatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
            : "Rates not yet fetched"
        }
        action={
          <AdminButton
            variant="secondary"
            size="sm"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              const result = await refreshExchangeRates();
              setRefreshing(false);
              if (result.ok) {
                toast.success(result.message);
                router.refresh();
              } else {
                toast.error(result.message);
              }
            }}
          >
            <RefreshCw
              className={cn("size-3.5", refreshing && "animate-spin")}
              strokeWidth={2}
            />
            {refreshing ? "Fetching…" : "Refresh rates"}
          </AdminButton>
        }
      />

      <form onSubmit={submit} className="space-y-5 p-5">

        <Field
          label="Default currency"
          hint="What a visitor sees before choosing"
          error={errors.defaultCurrency}
        >
          <select
            value={defaultCurrency}
            onChange={(event) => setDefaultCurrency(event.target.value)}
            className={cn(
              "h-9 w-full rounded-md border bg-transparent px-3 text-[0.8125rem] text-admin-fg outline-none transition-colors duration-200",
              "[&>option]:bg-admin-panel [&>option]:text-admin-fg",
              errors.defaultCurrency
                ? "border-destructive"
                : "border-admin-line focus:border-champagne"
            )}
          >
            {enabled.map((code) => (
              <option key={code} value={code}>
                {code} — {CURRENCY_LABEL[code] ?? code}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <p className="mb-2 text-[0.75rem] font-semibold text-admin-fg">
            Offered in the switcher
          </p>
          {errors.enabled && (
            <p className="mb-2 text-[0.75rem] font-medium text-destructive">
              {errors.enabled}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {SUPPORTED_CURRENCIES.map((code) => {
              const on = enabled.includes(code);
              const locked = code === base;

              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggle(code)}
                  aria-pressed={on}
                  disabled={locked}
                  title={locked ? `${base} is the ledger currency` : undefined}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-[0.75rem] font-semibold transition-colors duration-200",
                    on
                      ? "border-admin-fg bg-admin-fg text-admin-panel"
                      : "border-admin-line text-admin-muted hover:bg-admin-hover hover:text-admin-fg",
                    locked && "cursor-not-allowed opacity-70"
                  )}
                >
                  {code}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[0.75rem] font-semibold text-admin-fg">
            Exchange rates
          </p>
          <p className="mb-3 text-[0.6875rem] text-admin-faint">
            Units per 1 {base}. Display only.
          </p>

          {errors.rates && (
            <p className="mb-2 text-[0.75rem] font-medium text-destructive">
              {errors.rates}
            </p>
          )}

          <div className="space-y-2">
            {enabled
              .filter((code) => code !== base)
              .map((code) => {
                const rate = Number.parseFloat(rates[code] ?? "");
                const valid = Number.isFinite(rate) && rate > 0;

                return (
                  <div
                    key={code}
                    className="grid grid-cols-[4rem_1fr_auto] items-center gap-3"
                  >
                    <span className="admin-figure text-[0.8125rem] font-semibold text-admin-fg">
                      {code}
                    </span>

                    <input
                      value={rates[code] ?? ""}
                      onChange={(event) =>
                        setRates((current) => ({
                          ...current,
                          [code]: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={`Rate for ${code} per 1 ${base}`}
                      className={cn(inputClass(!valid), "admin-figure")}
                    />

                    {/* The check that catches a misplaced decimal point: a
                        wrong rate is obvious as a price and invisible as a
                        number. */}
                    <span className="admin-figure whitespace-nowrap text-[0.75rem] text-admin-faint">
                      {valid
                        ? `${formatCurrency(sample, base)} → ${formatCurrency(
                            Math.round(
                              (sample / 10 ** minorUnitExponent(base)) *
                                rate *
                                10 ** minorUnitExponent(code)
                            ),
                            code
                          )}`
                        : "—"}
                    </span>
                  </div>
                );
              })}

            {enabled.length === 1 && (
              <p className="text-[0.75rem] text-admin-faint">
                Only {base} is enabled, so there is nothing to convert and the
                storefront switcher is hidden.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Save currency"}
          </AdminButton>
        </div>
      </form>
    </Panel>
  );
}

/* --------------------------------------------------------------- storefront */

export function StorefrontSettingsForm({
  freeShippingThreshold,
  announcements,
  base,
}: {
  freeShippingThreshold: number;
  announcements: string[];
  base: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const exponent = minorUnitExponent(base);

  // Shown in major units — an operator thinks in dollars, not cents.
  const [threshold, setThreshold] = React.useState(
    (freeShippingThreshold / 10 ** exponent).toFixed(2)
  );
  const [lines, setLines] = React.useState<string[]>(announcements);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const major = Number.parseFloat(threshold);

    const result = await updateStorefrontSettings({
      freeShippingThreshold: Number.isFinite(major)
        ? Math.round(major * 10 ** exponent)
        : Number.NaN,
      announcements: lines.map((line) => line.trim()).filter(Boolean),
    });

    setSaving(false);

    if (result.ok) {
      toast.success(result.message);
      router.refresh();
    } else if (result.fieldErrors) {
      setErrors(result.fieldErrors);
    } else {
      toast.error(result.message);
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="Storefront"
        
      />

      <form onSubmit={submit} className="space-y-5 p-5">
        <Field
          label="Free delivery above"
          hint={base}
          error={errors.freeShippingThreshold}
        >
          <input
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            inputMode="decimal"
            placeholder="500.00"
            className={cn(
              inputClass(Boolean(errors.freeShippingThreshold)),
              "admin-figure"
            )}
          />
        </Field>

        <div>
          <p className="mb-2 text-[0.75rem] font-semibold text-admin-fg">
            Announcement bar
          </p>
          {errors.announcements && (
            <p className="mb-2 text-[0.75rem] font-medium text-destructive">
              {errors.announcements}
            </p>
          )}

          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={line}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, i) =>
                        i === index ? event.target.value : entry
                      )
                    )
                  }
                  aria-label={`Announcement ${index + 1}`}
                  className={inputClass(false)}
                />
                <AdminButton
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setLines((current) => current.filter((_, i) => i !== index))
                  }
                  // One line has to remain: the bar rotates through this list
                  // and an empty one renders as a bare strip.
                  disabled={lines.length <= 1}
                  aria-label={`Remove announcement ${index + 1}`}
                >
                  <X className="size-3.5" strokeWidth={2} />
                </AdminButton>
              </div>
            ))}
          </div>

          {lines.length < 8 && (
            <AdminButton
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => setLines((current) => [...current, ""])}
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              Add line
            </AdminButton>
          )}
        </div>

        <div className="flex justify-end">
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Save storefront"}
          </AdminButton>
        </div>
      </form>
    </Panel>
  );
}

/* ------------------------------------------------------------------ preview */

/**
 * What a shopper sees, per enabled currency.
 *
 * Worth its own panel: a rate is a number nobody can sanity-check, and a price
 * is. A misplaced decimal shows up here instantly.
 */
export function CurrencyPreview({ config }: { config: CurrencyConfig }) {
  const samples = [4_500, 125_000, 1_250_000];

  return (
    <Panel>
      <PanelHeader
        title="Preview"
        
      />

      <div className="admin-scroll overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead>
            <tr>
              <th className="border-b border-admin-line px-5 py-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-admin-faint">
                Currency
              </th>
              {samples.map((sample) => (
                <th
                  key={sample}
                  className="border-b border-admin-line px-5 py-3 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-admin-faint"
                >
                  {formatCurrency(sample, config.base)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {config.enabled.map((code) => (
              <tr key={code} className="transition-colors hover:bg-admin-hover">
                <td className="border-b border-admin-line px-5 py-3 text-[0.8125rem]">
                  <span className="admin-figure font-semibold text-admin-fg">
                    {code}
                  </span>
                  {code === config.base && (
                    <Badge tone="neutral">
                      <span className="ml-1.5">ledger</span>
                    </Badge>
                  )}
                  {code === config.default && code !== config.base && (
                    <Badge tone="accent">
                      <span className="ml-1.5">default</span>
                    </Badge>
                  )}
                </td>

                {samples.map((sample) => (
                  <td
                    key={sample}
                    className="admin-figure border-b border-admin-line px-5 py-3 text-right text-[0.8125rem] text-admin-muted"
                  >
                    {/* The storefront's own converter, not a copy of it —
                        including the whole-unit rounding that makes a KES
                        price read 161,250 rather than 161,247. */}
                    {formatBaseAmount(sample, code, config)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
