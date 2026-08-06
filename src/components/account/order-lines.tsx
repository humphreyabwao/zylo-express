import Link from "next/link";

import type { AccountOrder } from "@/lib/account";
import { getCountry } from "@/lib/countries";
import { formatPrice } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * The itemised contents of an order, collapsed by default.
 *
 * Full lines are noise on the orders list — what most visits want is status
 * and total, which the summary card already shows. This is here for the visit
 * that needs to check exactly what was in the parcel and what it cost.
 */
export function OrderLines({ order }: { order: AccountOrder }) {
  if (order.lines.length === 0) return null;

  return (
    <Accordion type="single" collapsible className="border border-hairline">
      <AccordionItem value={order.id} className="border-b-0">
        <AccordionTrigger className="px-5 lg:px-6">
          <span className="eyebrow-sm text-muted-foreground">
            Itemised — {order.lines.length}{" "}
            {order.lines.length === 1 ? "line" : "lines"}
          </span>
        </AccordionTrigger>

        <AccordionContent className="px-5 lg:px-6">
          <ul className="divide-y divide-hairline border-t border-hairline">
            {order.lines.map((line) => {
              const country = line.originCountry
                ? getCountry(line.originCountry)
                : undefined;

              return (
                <li
                  key={line.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${line.productSlug}`}
                      className="link-draw text-sm font-normal"
                    >
                      {line.productName}
                    </Link>
                    <p className="mt-1 text-xs font-light text-muted-foreground">
                      {line.variantTitle}
                      {country && (
                        <>
                          {" · "}
                          <span aria-hidden="true">{country.flag}</span>{" "}
                          {country.name}
                        </>
                      )}
                    </p>
                  </div>

                  <p className="text-xs font-light tabular-nums text-muted-foreground">
                    {line.quantity} ×{" "}
                    {formatPrice(line.unitPrice, { currency: order.currency })}
                  </p>
                  <p className="font-display text-sm font-semibold tabular-nums">
                    {formatPrice(line.lineTotal, { currency: order.currency })}
                  </p>
                </li>
              );
            })}
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
