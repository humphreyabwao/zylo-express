"use client";

import * as React from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { suggestVariantSku } from "@/app/actions/admin/variants";
import { Field, inputClass } from "@/components/admin/modal";

/**
 * A SKU input with a generate button.
 *
 * The editing counterpart to the create form's auto/manual switch. A mode
 * toggle would be wrong here: the field already holds a real SKU that is on
 * picking slips and labels, so the default has to be "leave it alone". One
 * click to propose a free one is the useful affordance; anything more
 * automatic risks rewriting an identifier somebody is holding in their hand.
 *
 * The proposal comes from the server, which derives the stem from the
 * product's own name and checks what is taken. It is still only a proposal —
 * the unique index decides, and `updateVariant` reports a collision against
 * this field.
 */
export function SkuField({
  productId,
  value,
  onChange,
  error,
}: {
  productId: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [working, setWorking] = React.useState(false);

  const generate = async () => {
    setWorking(true);
    const result = await suggestVariantSku(productId);
    setWorking(false);

    if (result.ok && result.sku) {
      onChange(result.sku);
    } else {
      toast.error("Could not generate a SKU. Enter one manually.");
    }
  };

  return (
    <Field label="SKU" hint="Unique across the shop" error={error}>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(inputClass(Boolean(error)), "admin-figure")}
        />
        <button
          type="button"
          title="Generate a free SKU"
          disabled={working}
          onClick={generate}
          className="grid size-9 shrink-0 place-items-center rounded-md border border-admin-line text-admin-muted transition-colors duration-200 hover:bg-admin-hover hover:text-admin-fg disabled:pointer-events-none disabled:opacity-40"
        >
          {working ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} />
          ) : (
            <Wand2 className="size-4" strokeWidth={1.7} />
          )}
          <span className="sr-only">Generate a free SKU</span>
        </button>
      </div>
    </Field>
  );
}
