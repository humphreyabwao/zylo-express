import { NextResponse } from "next/server";

import { AdminAuthorizationError, requireAdminAction } from "@/lib/admin/guard";
import {
  SALES_EXPORT_LIMIT,
  listSalesForExport,
  type SaleFilters,
} from "@/lib/admin/queries";
import { getStoreSettings } from "@/lib/settings";
import { minorUnitExponent } from "@/lib/currency";

/**
 * Sales export.
 *
 * CSV rather than a real `.xlsx`. Excel, Numbers and Sheets all open it
 * natively, it is diffable, and it costs no dependency — where a true
 * spreadsheet binary would mean pulling in a writer library to gain a bold
 * header row. The `.csv` extension and the text/csv type are what make Excel
 * treat it as a spreadsheet rather than offer to download it as a file.
 *
 * Two shapes, because they answer different questions:
 *
 *   sales  one row per sale — what the day took, for reconciliation
 *   items  one row per line — what actually sold, for stock and buying
 *
 * Amounts are written as major-unit decimals with no currency symbol or
 * thousands separator: a spreadsheet has to be able to sum the column, and
 * "Ksh 1,154,422" is text. The currency is named in its own column instead.
 */

/** RFC 4180: quote everything, double the quotes inside. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function row(values: unknown[]): string {
  return values.map(cell).join(",");
}

export async function GET(request: Request) {
  try {
    await requireAdminAction({ module: "sales" });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return new NextResponse(error.message, { status: 403 });
    }
    throw error;
  }

  const url = new URL(request.url);
  const get = (key: string) => url.searchParams.get(key) ?? undefined;

  const filters: SaleFilters = {
    search: get("q"),
    method: (get("method") ?? "all") as SaleFilters["method"],
    range: (get("range") ?? "today") as SaleFilters["range"],
    status: (get("status") ?? "all") as SaleFilters["status"],
  };

  const shape = get("shape") === "items" ? "items" : "sales";

  const [{ rows, truncated }, settings] = await Promise.all([
    listSalesForExport(filters),
    getStoreSettings(),
  ]);

  const exponent = minorUnitExponent(settings.currency.base);
  const major = (minor: number) => (minor / 10 ** exponent).toFixed(exponent);

  const lines: string[] = [];

  if (shape === "items") {
    lines.push(
      row([
        "Reference",
        "Date",
        "Status",
        "Product",
        "Variant",
        "SKU",
        "Quantity",
        "Unit price",
        "Line total",
        "Currency",
        "Operator",
      ])
    );

    for (const sale of rows) {
      for (const item of sale.items) {
        lines.push(
          row([
            sale.reference,
            sale.created_at,
            sale.status,
            item.product_name,
            item.variant_title,
            item.sku,
            item.quantity,
            major(item.unit_price),
            major(item.line_total),
            sale.currency,
            sale.operator_name,
          ])
        );
      }
    }
  } else {
    lines.push(
      row([
        "Reference",
        "Date",
        "Status",
        "Operator",
        "Customer",
        "Email",
        "Payment method",
        "Items",
        "Subtotal",
        "Discount",
        "Total",
        "Currency",
        "Cancelled at",
        "Cancel reason",
        "Note",
      ])
    );

    for (const sale of rows) {
      lines.push(
        row([
          sale.reference,
          sale.created_at,
          sale.status,
          sale.operator_name,
          sale.customer_name ?? "",
          sale.customer_email ?? "",
          sale.payment_method,
          sale.items.reduce((sum, item) => sum + item.quantity, 0),
          major(sale.subtotal),
          major(sale.discount),
          major(sale.total),
          sale.currency,
          sale.cancelled_at ?? "",
          sale.cancel_reason,
          sale.note,
        ])
      );
    }
  }

  if (truncated) {
    lines.push("");
    lines.push(
      row([
        `Truncated at ${SALES_EXPORT_LIMIT} sales. Narrow the period and export again.`,
      ])
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `zylo-sales-${shape}-${filters.range ?? "today"}-${stamp}.csv`;

  // The BOM is what makes Excel on Windows read this as UTF-8. Without it a
  // customer name with an accent arrives mojibaked, and the shop's own
  // currency label is one of the things that breaks.
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
