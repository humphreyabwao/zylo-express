"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { createProduct, previewSku } from "@/app/actions/admin/products";
import { AdminButton, Panel, PanelHeader } from "@/components/admin/primitives";
import { Field, Toggle, inputClass } from "@/components/admin/modal";

/**
 * The product editor.
 *
 * Creates the row and its first variant, then hands over to the detail page.
 * It deliberately does not try to be the whole editor: imagery needs a product
 * id to upload against, and further variants are far easier to reason about
 * beside the ones that already exist. A single form doing everything would
 * have to invent a client-side draft of a product that does not exist yet and
 * reconcile it on submit — which is where this kind of screen usually goes
 * wrong.
 *
 * Grouped into panels rather than one long column: an operator filling this in
 * for the tenth time is scanning for the section they care about, not reading.
 */

const FLAGS = [
  { value: "new", label: "New", hint: "Shows a New badge" },
  { value: "exclusive", label: "Exclusive", hint: "Only available here" },
  { value: "limited", label: "Limited", hint: "Limited run" },
  { value: "made-to-order", label: "Made to order", hint: "Final sale applies" },
  { value: "final-sale", label: "Final sale", hint: "Not returnable" },
  { value: "archive", label: "Archive", hint: "Past season" },
] as const;

export interface CategoryOption {
  slug: string;
  name: string;
}

export interface CountryOption {
  code: string;
  name: string;
}

/**
 * Derive a URL slug from a name.
 *
 * Runs only while the operator has not typed a slug themselves — once they
 * have, the field is theirs and retyping the name must not silently overwrite
 * it. `normalize("NFD")` strips accents so "Théâtre" becomes "theatre" rather
 * than losing those characters entirely to the a-z filter.
 */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

/** How long to sit on a name change before asking the server for a SKU. */
const SKU_PREVIEW_DEBOUNCE_MS = 500;

export function ProductCreateForm({
  categories,
  countries,
}: {
  categories: CategoryOption[];
  countries: CountryOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Tracks whether the operator has taken ownership of the derived slug.
  const slugTouched = React.useRef(false);

  /**
   * What an auto-generated SKU would be for the current name.
   *
   * Stored with the name it was generated for, so staleness is decided during
   * render by comparing the two. The alternative — an effect that clears the
   * preview when the name changes — sets state synchronously inside an effect,
   * which cascades a render and is what `react-hooks` flags. Deriving is both
   * correct and simpler.
   *
   * A preview only: the value actually written is generated again server-side
   * at insert, because this one may be taken by then.
   */
  const [preview, setPreview] = React.useState<{
    forName: string;
    sku: string;
  } | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  const [values, setValues] = React.useState({
    name: "",
    slug: "",
    tagline: "",
    excerpt: "",
    description: "",
    categorySlug: "",
    originCountryCode: "",
    originCity: "",
    price: "",
    compareAtPrice: "",
    flags: [] as string[],
    isActive: false,
    isFeatured: false,
    skuMode: "auto" as "auto" | "manual",
    sku: "",
    variantTitle: "Standard",
    stock: "0",
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onNameChange = (name: string) => {
    setValues((current) => ({
      ...current,
      name,
      slug: slugTouched.current ? current.slug : slugify(name),
    }));
  };

  const toggleFlag = (flag: string) =>
    setValues((current) => ({
      ...current,
      flags: current.flags.includes(flag)
        ? current.flags.filter((f) => f !== flag)
        : [...current.flags, flag],
    }));

  /**
   * Keep the auto SKU preview in step with the name.
   *
   * Debounced, and only while the mode is auto — the generator queries every
   * SKU sharing the name's stem, which is not a per-keystroke question. Stale
   * responses are discarded rather than allowed to overwrite a newer one:
   * server actions are dispatched one at a time per client, but they still
   * resolve in the order they were sent, and a slow first request landing
   * after a fast second would show a preview for a name no longer typed.
   */
  React.useEffect(() => {
    if (values.skuMode !== "auto") return;

    const name = values.name.trim();
    if (!name) return;

    let cancelled = false;

    // Every state update happens inside the timeout, never in the effect body.
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      setPreviewing(true);

      const result = await previewSku(name);
      if (cancelled) return;

      setPreview(result.ok && result.sku ? { forName: name, sku: result.sku } : null);
      setPreviewing(false);
    }, SKU_PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [values.name, values.skuMode]);

  const trimmedName = values.name.trim();
  // Stale the moment the name moves on — no effect needed to notice.
  const skuPreview =
    preview && preview.forName === trimmedName ? preview.sku : null;

  const refreshPreview = async () => {
    if (!trimmedName) return;

    setPreviewing(true);
    const result = await previewSku(trimmedName);
    setPreview(
      result.ok && result.sku ? { forName: trimmedName, sku: result.sku } : null
    );
    setPreviewing(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = await createProduct({
      ...values,
      stock: Number(values.stock),
    });

    if (result.ok && result.id) {
      toast.success(result.message);
      // Straight to the detail page: imagery and further options are the next
      // thing anyone does, and they live there.
      router.push(`/admin/products/${result.id}`);
      return;
    }

    setSaving(false);
    toast.error(result.message);
    if (result.fieldErrors) setErrors(result.fieldErrors);
  };

  return (
    <form onSubmit={submit} className="grid gap-4 xl:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title="Essentials"
            description="What the piece is called and where it lives"
          />
          <div className="space-y-4 p-5">
            <Field label="Name" error={errors.name}>
              <input
                value={values.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Aurelia Top-Handle Bag"
                autoFocus
                className={inputClass(Boolean(errors.name))}
              />
            </Field>

            <Field
              label="Slug"
              hint="/products/…"
              error={errors.slug}
            >
              <div className="flex gap-2">
                <input
                  value={values.slug}
                  onChange={(e) => {
                    slugTouched.current = true;
                    set("slug", e.target.value);
                  }}
                  placeholder="aurelia-top-handle-bag"
                  className={cn(inputClass(Boolean(errors.slug)), "admin-figure")}
                />
                <button
                  type="button"
                  title="Regenerate from the name"
                  onClick={() => {
                    slugTouched.current = false;
                    set("slug", slugify(values.name));
                  }}
                  className="grid size-9 shrink-0 place-items-center rounded-md border border-admin-line text-admin-muted transition-colors duration-200 hover:bg-admin-hover hover:text-admin-fg"
                >
                  <Wand2 className="size-4" strokeWidth={1.7} />
                  <span className="sr-only">Regenerate slug from the name</span>
                </button>
              </div>
            </Field>

            <Field label="Tagline" hint="One line, shown under the name" error={errors.tagline}>
              <input
                value={values.tagline}
                onChange={(e) => set("tagline", e.target.value)}
                placeholder="Hand-finished calfskin, made in Florence"
                className={inputClass(Boolean(errors.tagline))}
              />
            </Field>

            <Field label="Category" error={errors.categorySlug}>
              <select
                value={values.categorySlug}
                onChange={(e) => set("categorySlug", e.target.value)}
                className={cn(
                  inputClass(Boolean(errors.categorySlug)),
                  "[&>option]:bg-admin-panel [&>option]:text-admin-fg"
                )}
              >
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Description"
            description="Optional now — it can be written later"
          />
          <div className="space-y-4 p-5">
            <Field label="Excerpt" hint="Search results and cards" error={errors.excerpt}>
              <textarea
                value={values.excerpt}
                onChange={(e) => set("excerpt", e.target.value)}
                rows={2}
                className={cn(inputClass(Boolean(errors.excerpt)), "h-auto resize-none py-2 leading-relaxed")}
              />
            </Field>

            <Field label="Description" error={errors.description}>
              <textarea
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                rows={5}
                className={cn(inputClass(Boolean(errors.description)), "h-auto resize-none py-2 leading-relaxed")}
              />
            </Field>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Origin"
            description="Shown on every card and filterable by shoppers"
          />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Country" error={errors.originCountryCode}>
              <select
                value={values.originCountryCode}
                onChange={(e) => set("originCountryCode", e.target.value)}
                className={cn(
                  inputClass(Boolean(errors.originCountryCode)),
                  "[&>option]:bg-admin-panel [&>option]:text-admin-fg"
                )}
              >
                <option value="">Not specified</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="City" hint="Optional" error={errors.originCity}>
              <input
                value={values.originCity}
                onChange={(e) => set("originCity", e.target.value)}
                placeholder="Florence"
                className={inputClass(Boolean(errors.originCity))}
              />
            </Field>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="First option"
            description="Every product needs one to be purchasable"
          />
          <div className="space-y-4 p-5">
            <p className="rounded-lg border border-admin-line px-3 py-2.5 text-[0.75rem] leading-relaxed text-admin-faint">
              Stock, SKU and the price charged all live on an option, not on the
              product. This creates the first one — add colours and sizes from
              the product page afterwards.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Option name" error={errors.variantTitle}>
                <input
                  value={values.variantTitle}
                  onChange={(e) => set("variantTitle", e.target.value)}
                  placeholder="Onyx"
                  className={inputClass(Boolean(errors.variantTitle))}
                />
              </Field>

              <Field label="Opening stock" error={errors.stock}>
                <input
                  value={values.stock}
                  onChange={(e) => set("stock", e.target.value)}
                  inputMode="numeric"
                  className={cn(inputClass(Boolean(errors.stock)), "admin-figure")}
                />
              </Field>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[0.75rem] font-semibold text-admin-fg">
                  SKU
                </span>

                {/* Two explicit modes rather than the previous behaviour,
                    which auto-filled until you typed and then silently stopped.
                    That is a hidden state: the field looked identical either
                    way, so nobody could tell whether it would keep updating. */}
                <div
                  role="radiogroup"
                  aria-label="How to set the SKU"
                  className="flex items-center gap-0.5 rounded-md border border-admin-line p-0.5"
                >
                  {(["auto", "manual"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={values.skuMode === mode}
                      onClick={() => set("skuMode", mode)}
                      className={cn(
                        "rounded px-2 py-0.5 text-[0.6875rem] font-semibold capitalize transition-colors duration-200",
                        values.skuMode === mode
                          ? "bg-admin-active text-admin-fg"
                          : "text-admin-faint hover:text-admin-fg"
                      )}
                    >
                      {mode === "auto" ? "Auto" : "Manual"}
                    </button>
                  ))}
                </div>
              </div>

              {values.skuMode === "auto" ? (
                <>
                  <div className="flex gap-2">
                    <div
                      className={cn(
                        inputClass(Boolean(errors.sku)),
                        "admin-figure flex items-center justify-between gap-2 bg-admin-hover/50 text-admin-muted"
                      )}
                    >
                      <span className={cn(!skuPreview && "text-admin-faint")}>
                        {previewing
                          ? "Checking…"
                          : (skuPreview ??
                            (values.name.trim()
                              ? "—"
                              : "Enter a name to generate one"))}
                      </span>
                      {previewing && (
                        <Loader2
                          className="size-3.5 shrink-0 animate-spin"
                          strokeWidth={2}
                        />
                      )}
                    </div>

                    <button
                      type="button"
                      title="Check again"
                      disabled={!values.name.trim() || previewing}
                      onClick={refreshPreview}
                      className="grid size-9 shrink-0 place-items-center rounded-md border border-admin-line text-admin-muted transition-colors duration-200 hover:bg-admin-hover hover:text-admin-fg disabled:pointer-events-none disabled:opacity-40"
                    >
                      <RefreshCw className="size-4" strokeWidth={1.7} />
                      <span className="sr-only">Check for a free SKU again</span>
                    </button>
                  </div>

                  <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-admin-faint">
                    Generated from the name as{" "}
                    <span className="admin-figure">ZY-STEM-GGVV</span>, matching
                    the rest of the catalogue. This is a preview — the final
                    value is issued when you save, so it cannot be taken in the
                    meantime.
                  </p>
                </>
              ) : (
                <>
                  <input
                    value={values.sku}
                    onChange={(e) => set("sku", e.target.value)}
                    placeholder="ZY-AURELI-0101"
                    className={cn(
                      inputClass(Boolean(errors.sku)),
                      "admin-figure"
                    )}
                  />
                  <p className="mt-1.5 text-[0.6875rem] text-admin-faint">
                    Must be unique across every option in the shop.
                  </p>
                </>
              )}

              {errors.sku && (
                <span className="mt-1.5 block text-[0.75rem] font-medium text-destructive">
                  {errors.sku}
                </span>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {/* Sidebar: the decisions that determine whether this goes live. */}
      <div className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
        <Panel>
          <PanelHeader title="Pricing" />
          <div className="space-y-4 p-5">
            <Field label="Price" hint="USD" error={errors.price}>
              <input
                value={values.price}
                onChange={(e) => set("price", e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={cn(inputClass(Boolean(errors.price)), "admin-figure")}
              />
            </Field>

            <Field
              label="Compare-at"
              hint="Was-price, optional"
              error={errors.compareAtPrice}
            >
              <input
                value={values.compareAtPrice}
                onChange={(e) => set("compareAtPrice", e.target.value)}
                inputMode="decimal"
                placeholder="—"
                className={cn(
                  inputClass(Boolean(errors.compareAtPrice)),
                  "admin-figure"
                )}
              />
            </Field>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Visibility" />
          <div className="space-y-3 p-5">
            <Toggle
              checked={values.isActive}
              onChange={(v) => set("isActive", v)}
              label="Publish immediately"
              hint="Off by default — a product with no photographs is rarely ready to sell"
            />
            <Toggle
              checked={values.isFeatured}
              onChange={(v) => set("isFeatured", v)}
              label="Featured"
              hint="Eligible for the homepage and edits"
            />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Badges" description="Optional" />
          <div className="space-y-2.5 p-5">
            {FLAGS.map((flag) => (
              <label
                key={flag.value}
                className="flex cursor-pointer items-start gap-2.5"
              >
                <input
                  type="checkbox"
                  checked={values.flags.includes(flag.value)}
                  onChange={() => toggleFlag(flag.value)}
                  className="mt-0.5 size-3.5 shrink-0 accent-champagne"
                />
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] font-medium text-admin-fg">
                    {flag.label}
                  </span>
                  <span className="block text-[0.6875rem] leading-snug text-admin-faint">
                    {flag.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Panel>

        <div className="flex flex-col gap-2">
          <AdminButton type="submit" disabled={saving} className="w-full">
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Creating…" : "Create product"}
          </AdminButton>
          <AdminButton
            variant="secondary"
            href="/admin/products"
            className="w-full"
          >
            Cancel
          </AdminButton>
        </div>
      </div>
    </form>
  );
}
