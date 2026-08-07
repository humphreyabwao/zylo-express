"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  PauseCircle,
  Plus,
  Printer,
  ScanLine,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useAdminCurrency } from "@/components/admin/admin-currency";
import { recordSale } from "@/app/actions/admin/pos";
import {
  abandonSalePayment,
  chargeSale,
  pollSalePayment,
} from "@/app/actions/admin/pos-payment";
import type { PosItem } from "@/lib/admin/queries";
import type { SaleRow } from "@/lib/supabase/types";
import { AdminButton, Badge, Panel } from "@/components/admin/primitives";
import { Field, Modal, ModalBody, ModalFooter, inputClass } from "@/components/admin/modal";

/**
 * The till.
 *
 * Stacked, not columned: search at the top, three results under it, then the
 * sale running full width. A cart in a 22rem side column could show a product
 * name and nothing else — at counter width the sale is the thing being worked
 * on and deserves the page.
 *
 * Prices render in the **base currency** throughout. The shopper-facing display
 * currency has no business here: an operator counting cash needs the number the
 * books will hold.
 */

/**
 * Payment methods, each with a fixed colour.
 *
 * Solid and static — not tinted from the theme. A till is operated at speed and
 * often glanced at rather than read, so the tender is easier to confirm by
 * colour than by reading four similar words. Pulled from the brand palette so
 * the counter still looks like the rest of the product, and each carries a
 * `dot` for the unselected state, which keeps the mapping learnable before
 * anything is chosen.
 */
const METHODS = [
  {
    value: "cash",
    label: "Cash",
    // Forest: money.
    active: "border-forest bg-forest text-porcelain",
    dot: "bg-forest",
  },
  {
    value: "card",
    label: "Card",
    active: "border-midnight bg-midnight text-porcelain",
    dot: "bg-midnight",
  },
  {
    value: "mpesa",
    label: "M-Pesa",
    active: "border-champagne bg-champagne text-obsidian",
    dot: "bg-champagne",
  },
  {
    value: "other",
    label: "Other",
    active: "border-wine bg-wine text-porcelain",
    dot: "bg-wine",
  },
] as const;

type Method = (typeof METHODS)[number]["value"];

/** Search results: three at a time, the rest a page away. */
const PAGE_SIZE = 3;

/**
 * Lines shown on one page of the sale.
 *
 * A basket of twenty items would otherwise push the tender column off the
 * bottom of the screen, so an operator has to scroll away from the sale to
 * take payment for it. Paging the lines keeps the panel a fixed height and the
 * arithmetic beside it wherever the sale gets to.
 */
const LINES_PER_PAGE = 5;

/** Held sales live here. Per-terminal by design; see `HeldSale`. */
const HOLD_KEY = "zylo_pos_holds";

/** `storage` only fires in *other* tabs, so same-tab writes announce themselves. */
const HOLD_EVENT = "zylo:pos-holds";

interface Line {
  item: PosItem;
  quantity: number;
}

/**
 * A parked sale.
 *
 * Kept in `localStorage`, so holds belong to the terminal that took them. A
 * shared table would let one till resume another's sale, which is usually a
 * mistake rather than a feature — the customer whose basket it is is standing
 * at a particular counter.
 */
interface HeldSale {
  id: string;
  label: string;
  at: string;
  lines: { item: PosItem; quantity: number }[];
}

/**
 * Held sales, read straight from `localStorage`.
 *
 * `useSyncExternalStore` rather than "read in an effect, then setState": that
 * pattern renders once with the wrong value and once with the right one, and
 * React flags the synchronous setState for exactly that reason. This also gets
 * cross-tab sync free — two windows on the same terminal show the same holds.
 *
 * The server snapshot is a stable empty array, so the first client render
 * matches the HTML and nothing mismatches on hydration.
 */
const EMPTY_HOLDS: HeldSale[] = [];

function readHolds(): HeldSale[] {
  try {
    const raw = window.localStorage.getItem(HOLD_KEY);
    if (!raw) return EMPTY_HOLDS;
    const parsed = JSON.parse(raw) as HeldSale[];
    return Array.isArray(parsed) ? parsed : EMPTY_HOLDS;
  } catch {
    // A corrupt or unavailable store is not worth failing the till over.
    return EMPTY_HOLDS;
  }
}

function useHeldSales(): HeldSale[] {
  // Cached so the snapshot is referentially stable between reads — returning a
  // fresh array every time would spin the store forever.
  const cache = React.useRef<{ raw: string | null; value: HeldSale[] }>({
    raw: null,
    value: EMPTY_HOLDS,
  });

  return React.useSyncExternalStore(
    React.useCallback((onChange: () => void) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(HOLD_EVENT, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(HOLD_EVENT, onChange);
      };
    }, []),
    () => {
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(HOLD_KEY);
      } catch {
        raw = null;
      }
      if (raw !== cache.current.raw) {
        cache.current = { raw, value: readHolds() };
      }
      return cache.current.value;
    },
    () => EMPTY_HOLDS
  );
}

/** A Paystack charge the till is waiting on. */
interface PendingCharge {
  saleId: string;
  sale: SaleRow;
  lines: Line[];
  /** Our payment reference — what the poll and the abandon both key on. */
  reference: string;
  method: "card" | "mpesa";
  /** M-Pesa: Paystack's own instruction copy. */
  displayText?: string;
  /** M-Pesa: the handset the prompt went to. */
  phone?: string;
  /** Card: the hosted page to show as a link and a QR. */
  url?: string;
  startedAt: number;
}

/**
 * How long the till waits before giving up on a prompt.
 *
 * Paystack abandons an unanswered mobile-money charge at around three minutes.
 * Stopping a little short of that keeps the counter's copy of the story ahead
 * of the provider's rather than behind it.
 */
const CHARGE_TIMEOUT_MS = 165_000;
const POLL_INTERVAL_MS = 3_000;

export function PosTerminal({
  items,
  paystackReady = false,
}: {
  items: PosItem[];
  /**
   * Whether card and M-Pesa should actually charge.
   *
   * Resolved on the server from Settings → Paystack. False leaves the two
   * buttons behaving as they always did — labels on a sale settled some other
   * way — so a shop with no Paystack account keeps a working till.
   */
  paystackReady?: boolean;
}) {
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  const [pageIndex, setPageIndex] = React.useState(0);
  const [linePage, setLinePage] = React.useState(0);
  const [lines, setLines] = React.useState<Line[]>([]);
  const [method, setMethod] = React.useState<Method>("cash");
  const [tendered, setTendered] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [scanning, setScanning] = React.useState(true);
  const [completed, setCompleted] = React.useState<{
    sale: SaleRow;
    lines: Line[];
  } | null>(null);

  const [customerEmail, setCustomerEmail] = React.useState("");
  const [mpesaPhone, setMpesaPhone] = React.useState("");

  /** A charge in flight: the sale exists, pending, holding its stock. */
  const [pending, setPending] = React.useState<PendingCharge | null>(null);

  const searchRef = React.useRef<HTMLInputElement>(null);
  const holds = useHeldSales();
  const { format: formatPrice } = useAdminCurrency();

  /* ------------------------------------------------------------- matching */

  const bySku = React.useMemo(() => {
    const map = new Map<string, PosItem>();
    for (const item of items) map.set(item.sku.toLowerCase(), item);
    return map;
  }, [items]);

  const matches = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;

    return items.filter(
      (item) =>
        item.sku.toLowerCase().includes(term) ||
        item.product_name.toLowerCase().includes(term) ||
        item.variant_title.toLowerCase().includes(term)
    );
  }, [items, query]);

  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const safePage = Math.min(pageIndex, pageCount - 1);
  const results = matches.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  /* ------------------------------------------------------------------ cart */

  const subtotal = lines.reduce((sum, l) => sum + l.item.price * l.quantity, 0);
  const discountMinor = Math.max(
    0,
    Math.min(subtotal, Math.round((Number.parseFloat(discount) || 0) * 100))
  );
  const total = subtotal - discountMinor;
  const tenderedMinor = Math.round((Number.parseFloat(tendered) || 0) * 100);
  const change = method === "cash" ? tenderedMinor - total : 0;
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  const linePageCount = Math.max(1, Math.ceil(lines.length / LINES_PER_PAGE));
  // Clamped rather than reset: removing the last line on page three should land
  // on page two, not throw the operator back to the top of the basket.
  const safeLinePage = Math.min(linePage, linePageCount - 1);
  const visibleLines = lines.slice(
    safeLinePage * LINES_PER_PAGE,
    safeLinePage * LINES_PER_PAGE + LINES_PER_PAGE
  );

  const remainingFor = React.useCallback(
    (item: PosItem) =>
      item.inventory_quantity -
      (lines.find((l) => l.item.variant_id === item.variant_id)?.quantity ?? 0),
    [lines]
  );

  const add = React.useCallback(
    (item: PosItem, quiet = false) => {
      const remaining =
        item.inventory_quantity -
        (lines.find((l) => l.item.variant_id === item.variant_id)?.quantity ?? 0);

      if (remaining <= 0) {
        toast.error(`${item.sku} is out of stock.`);
        return false;
      }

      setLines((current) => {
        const existing = current.find((l) => l.item.variant_id === item.variant_id);
        if (existing) {
          return current.map((l) =>
            l.item.variant_id === item.variant_id
              ? { ...l, quantity: l.quantity + 1 }
              : l
          );
        }
        return [...current, { item, quantity: 1 }];
      });

      // A brand-new line is appended, so it may land on a page the operator
      // is not looking at. Follow it — an item that appears to have not been
      // added gets scanned twice.
      const isNew = !lines.some((l) => l.item.variant_id === item.variant_id);
      if (isNew) {
        setLinePage(Math.ceil((lines.length + 1) / LINES_PER_PAGE) - 1);
      }

      if (!quiet) {
        setQuery("");
        searchRef.current?.focus();
      }
      return true;
    },
    [lines]
  );

  const setQuantity = (variantId: string, quantity: number) =>
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.item.variant_id !== variantId)
        : current.map((l) =>
            l.item.variant_id === variantId ? { ...l, quantity } : l
          )
    );

  const reset = React.useCallback(() => {
    setLines([]);
    setLinePage(0);
    setQuery("");
    setTendered("");
    setCustomerName("");
    setDiscount("");
    setMethod("cash");
    setCompleted(null);
    searchRef.current?.focus();
  }, []);

  /* --------------------------------------------------------------- scanner */

  /**
   * Barcode scanners are keyboards.
   *
   * A USB or Bluetooth scanner in its default mode types the code and presses
   * Enter — far faster than a person can. So rather than asking for camera
   * permission, this watches for a burst of keystrokes ending in Enter and
   * treats it as a scan. It works with any HID scanner, needs no driver, no
   * permission prompt and no HTTPS.
   *
   * The 40ms gate is what separates a scanner from a person: nobody types a
   * six-character SKU in a quarter of a second.
   */
  React.useEffect(() => {
    if (!scanning) return;

    let buffer = "";
    let lastKeyAt = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Typing into a real field is typing, not scanning — except the search
      // box, which is where a scanner's focus usually lands anyway.
      if (
        target &&
        target !== searchRef.current &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyAt > 120) buffer = "";
      lastKeyAt = now;

      if (event.key === "Enter") {
        const code = buffer.trim();
        buffer = "";
        if (code.length < 3) return;

        const item = bySku.get(code.toLowerCase());
        if (item) {
          event.preventDefault();
          if (add(item, true)) toast.success(`${item.sku} added`);
          setQuery("");
        } else {
          toast.error(`No item with code ${code}.`);
        }
        return;
      }

      if (event.key.length === 1) buffer += event.key;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scanning, bySku, add]);

  /* ------------------------------------------------------------------ holds */

  const persistHolds = (next: HeldSale[]) => {
    try {
      window.localStorage.setItem(HOLD_KEY, JSON.stringify(next));
      // Same-tab listeners do not receive `storage`, so nudge them directly.
      window.dispatchEvent(new Event(HOLD_EVENT));
    } catch {
      toast.error("Could not save the hold on this device.");
    }
  };

  const hold = () => {
    if (lines.length === 0) return;

    const label =
      customerName.trim() ||
      `${itemCount} ${itemCount === 1 ? "item" : "items"} · ${formatPrice(total)}`;

    persistHolds([
      { id: crypto.randomUUID(), label, at: new Date().toISOString(), lines },
      ...holds,
    ]);

    reset();
    toast.success("Sale held.");
  };

  const resume = (held: HeldSale) => {
    if (lines.length > 0) {
      toast.error("Finish or hold the current sale first.");
      return;
    }
    setLines(held.lines);
    setLinePage(0);
    persistHolds(holds.filter((h) => h.id !== held.id));
    searchRef.current?.focus();
  };

  /* ---------------------------------------------------------------- complete */

  /**
   * Poll until Paystack resolves the charge.
   *
   * The webhook is the authority and usually settles first; this exists
   * because a counter cannot wait on somebody else's network. Both paths land
   * on the same guarded RPCs, so whichever is second is a no-op.
   */
  React.useEffect(() => {
    if (!pending) return;

    let live = true;
    let timer: ReturnType<typeof setTimeout>;

    const stop = (message: string, tone: "error" | "info") => {
      if (!live) return;
      setPending(null);
      if (tone === "error") toast.error(message);
      else toast.info(message);
      router.refresh();
    };

    const tick = async () => {
      if (!live) return;

      if (Date.now() - pending.startedAt > CHARGE_TIMEOUT_MS) {
        await abandonSalePayment(pending.reference);
        stop("No response. The sale was voided and stock returned.", "error");
        return;
      }

      const result = await pollSalePayment(pending.reference);
      if (!live) return;

      if (result.state === "paid") {
        setPending(null);
        setCompleted({ sale: result.sale ?? pending.sale, lines: pending.lines });
        setLines([]);
        setTendered("");
        setDiscount("");
        setCustomerName("");
        setCustomerEmail("");
        setMpesaPhone("");
        toast.success(result.message ?? "Payment received.");
        router.refresh();
        return;
      }

      if (result.state === "failed") {
        stop(result.message ?? "That payment did not go through.", "error");
        return;
      }

      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [pending, router]);

  const canComplete =
    lines.length > 0 && !saving && (method !== "cash" || tenderedMinor >= total);

  /**
   * Card and M-Pesa go through Paystack when it is configured.
   *
   * `other` never does — it is the escape hatch for a payment taken outside
   * the system — and cash obviously does not. When Paystack is not set up the
   * card and M-Pesa buttons still work as labels, exactly as they did before,
   * so a shop that has not connected an account is not locked out of its till.
   */
  const viaPaystack =
    paystackReady && (method === "card" || method === "mpesa");

  const complete = async () => {
    if (viaPaystack && method === "mpesa" && !mpesaPhone.trim()) {
      toast.error("Enter the customer's M-Pesa number.");
      return;
    }

    setSaving(true);

    const result = await recordSale({
      items: lines.map((l) => ({
        variantId: l.item.variant_id,
        quantity: l.quantity,
      })),
      customerName,
      paymentMethod: method,
      discount: discountMinor,
      tendered: method === "cash" ? tenderedMinor : null,
      // Written pending so the charge decides whether it counts as takings.
      // Stock still comes off now — the goods are spoken for either way.
      awaitPayment: viaPaystack,
    });

    if (!result.ok || !result.sale) {
      setSaving(false);
      toast.error(result.message);
      return;
    }

    if (!viaPaystack) {
      setSaving(false);
      // The lines are kept for the receipt: the RPC returns the sale header,
      // and re-querying its items for a page that already has them would be a
      // round trip for nothing.
      setCompleted({ sale: result.sale, lines });
      router.refresh();
      return;
    }

    const charge = await chargeSale({
      saleId: result.sale.id,
      method,
      phone: method === "mpesa" ? mpesaPhone.trim() : undefined,
      email: customerEmail.trim() || undefined,
    });

    setSaving(false);

    if (!charge.ok || !charge.reference) {
      // The sale is pending with stock held. Failing the charge here would
      // need a reference we never got, so it is left for the operator to void
      // from Sales — visible, rather than silently stranded.
      toast.error(charge.message);
      router.refresh();
      return;
    }

    setPending({
      saleId: result.sale.id,
      sale: result.sale,
      lines,
      reference: charge.reference,
      method,
      displayText: charge.displayText,
      phone: charge.phone,
      url: charge.url,
      startedAt: Date.now(),
    });
  };

  /* ----------------------------------------------------------------- render */

  return (
    <>
      <div className="space-y-4">
        {/* Search */}
        <Panel>
          <div className="relative border-b border-admin-line">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-admin-faint"
              strokeWidth={1.8}
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                // A new term starts at the first page. Done here rather than in
                // an effect watching `query`: this is the event that invalidates
                // the page, so it is the place that should reset it.
                setPageIndex(0);
              }}
              placeholder="Search or scan a SKU…"
              aria-label="Search stock"
              autoFocus
              className="h-14 w-full bg-transparent pl-11 pr-40 text-[0.9375rem] text-admin-fg outline-none placeholder:text-admin-faint"
            />

            <button
              type="button"
              onClick={() => setScanning((value) => !value)}
              aria-pressed={scanning}
              title={
                scanning
                  ? "Scanner listening — a scan adds straight to the sale"
                  : "Scanner off"
              }
              className={cn(
                "absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.6875rem] font-medium transition-colors",
                scanning
                  ? "bg-success/10 text-success"
                  : "text-admin-faint hover:bg-admin-hover"
              )}
            >
              <ScanLine className="size-3.5" strokeWidth={2} />
              {scanning ? "Scanner on" : "Scanner off"}
            </button>
          </div>

          {results.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.8125rem] text-admin-faint">
              Nothing matches “{query}”.
            </p>
          ) : (
            <ul className="divide-y divide-admin-line">
              {results.map((item) => {
                const remaining = remainingFor(item);

                return (
                  <li key={item.variant_id}>
                    <button
                      type="button"
                      onClick={() => add(item)}
                      disabled={remaining <= 0}
                      className={cn(
                        "flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors duration-150",
                        remaining <= 0
                          ? "cursor-not-allowed opacity-45"
                          : "hover:bg-admin-hover"
                      )}
                    >
                      <span className="relative size-12 shrink-0 overflow-hidden border border-admin-line bg-admin-hover">
                        {item.image_path && (
                          <Image
                            src={
                              item.image_path.startsWith("/")
                                ? item.image_path
                                : `/media/${item.image_path}`
                            }
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.875rem] font-medium text-admin-fg">
                          {item.product_name}
                        </span>
                        <span className="admin-figure block truncate text-[0.75rem] text-admin-faint">
                          {item.sku}
                          {item.variant_title && ` · ${item.variant_title}`}
                        </span>
                      </span>

                      <span className="shrink-0 text-right">
                        <span className="admin-figure block text-[0.875rem] font-medium text-admin-fg">
                          {formatPrice(item.price)}
                        </span>
                        <span
                          className={cn(
                            "admin-figure block text-[0.6875rem]",
                            remaining <= 0
                              ? "text-destructive"
                              : remaining <= 3
                                ? "text-champagne-dark"
                                : "text-admin-faint"
                          )}
                        >
                          {remaining <= 0 ? "Out of stock" : `${remaining} left`}
                        </span>
                      </span>

                      <Plus
                        className="size-4 shrink-0 text-admin-faint"
                        strokeWidth={2}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {matches.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-admin-line px-5 py-2.5">
              <p className="text-[0.75rem] text-admin-faint">
                {safePage * PAGE_SIZE + 1}–
                {Math.min((safePage + 1) * PAGE_SIZE, matches.length)} of{" "}
                {matches.length}
              </p>

              <div className="flex items-center gap-1">
                <PagerButton
                  label="Previous results"
                  disabled={safePage === 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                </PagerButton>

                <span className="admin-figure px-2 text-[0.75rem] text-admin-muted">
                  {safePage + 1} / {pageCount}
                </span>

                <PagerButton
                  label="More results"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                >
                  <ChevronRight className="size-4" strokeWidth={2} />
                </PagerButton>
              </div>
            </div>
          )}
        </Panel>

        {/* Held sales */}
        {holds.length > 0 && (
          <Panel>
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <span className="text-[0.75rem] font-medium text-admin-muted">
                Held
              </span>
              {holds.map((held) => (
                <span
                  key={held.id}
                  className="flex items-center gap-1 border border-admin-line"
                >
                  <button
                    type="button"
                    onClick={() => resume(held)}
                    className="px-2.5 py-1.5 text-[0.75rem] text-admin-fg transition-colors hover:bg-admin-hover"
                  >
                    {held.label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Discard hold ${held.label}`}
                    onClick={() =>
                      persistHolds(holds.filter((h) => h.id !== held.id))
                    }
                    className="grid size-7 place-items-center text-admin-faint transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-3" strokeWidth={1.8} />
                  </button>
                </span>
              ))}
            </div>
          </Panel>
        )}

        {/* The sale */}
        <Panel className="overflow-visible">
          <div className="flex items-center justify-between border-b border-admin-line px-5 py-3.5">
            <p className="text-[0.875rem] font-medium text-admin-fg">
              Sale
              {itemCount > 0 && (
                <span className="admin-figure ml-2 text-admin-faint">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              )}
            </p>

            {lines.length > 0 && (
              <div className="flex items-center gap-2">
                <AdminButton variant="secondary" size="sm" onClick={hold}>
                  <PauseCircle className="size-3.5" strokeWidth={2} />
                  Hold
                </AdminButton>
                <AdminButton variant="ghost" size="sm" onClick={reset}>
                  Clear
                </AdminButton>
              </div>
            )}
          </div>

          {/* Lines left and wide, tender right. The sale is the thing being
              worked on, so it gets the width; the arithmetic is a column. */}
          <div className="grid items-start lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0">
          {lines.length === 0 ? (
            <p className="px-5 py-20 text-center text-[0.8125rem] text-admin-faint">
              Scan or search to start a sale.
            </p>
          ) : (
            <div className="admin-scroll w-full overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left">
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th align="right">Price</Th>
                    <Th align="center">Quantity</Th>
                    <Th align="right">Line</Th>
                    <Th align="right" className="w-12">
                      <span className="sr-only">Remove</span>
                    </Th>
                  </tr>
                </thead>

                <tbody>
                  {visibleLines.map((line) => (
                    <tr
                      key={line.item.variant_id}
                      className="border-b border-admin-line"
                    >
                      <td className="px-5 py-3">
                        <span className="block truncate text-[0.875rem] font-medium text-admin-fg">
                          {line.item.product_name}
                        </span>
                        <span className="admin-figure block truncate text-[0.75rem] text-admin-faint">
                          {line.item.sku}
                          {line.item.variant_title && ` · ${line.item.variant_title}`}
                        </span>
                      </td>

                      <td className="admin-figure px-5 py-3 text-right text-[0.8125rem] text-admin-muted">
                        {formatPrice(line.item.price)}
                      </td>

                      <td className="px-5 py-3">
                        <span className="mx-auto flex w-fit items-center border border-admin-line">
                          <Stepper
                            label={`Fewer ${line.item.sku}`}
                            onClick={() =>
                              setQuantity(line.item.variant_id, line.quantity - 1)
                            }
                          >
                            <Minus className="size-3" strokeWidth={2} />
                          </Stepper>

                          <span className="admin-figure w-10 text-center text-[0.875rem] text-admin-fg">
                            {line.quantity}
                          </span>

                          <Stepper
                            label={`More ${line.item.sku}`}
                            disabled={remainingFor(line.item) <= 0}
                            onClick={() =>
                              setQuantity(line.item.variant_id, line.quantity + 1)
                            }
                          >
                            <Plus className="size-3" strokeWidth={2} />
                          </Stepper>
                        </span>
                      </td>

                      <td className="admin-figure px-5 py-3 text-right text-[0.875rem] font-medium text-admin-fg">
                        {formatPrice(line.item.price * line.quantity)}
                      </td>

                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setQuantity(line.item.variant_id, 0)}
                          aria-label={`Remove ${line.item.sku}`}
                          className="grid size-7 place-items-center text-admin-faint transition-colors hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.8} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lines.length > LINES_PER_PAGE && (
            <div className="flex items-center justify-between border-t border-admin-line px-5 py-2.5">
              <p className="text-[0.75rem] text-admin-faint">
                Lines {safeLinePage * LINES_PER_PAGE + 1}–
                {Math.min((safeLinePage + 1) * LINES_PER_PAGE, lines.length)} of{" "}
                {lines.length}
              </p>

              <div className="flex items-center gap-1">
                <PagerButton
                  label="Previous lines"
                  disabled={safeLinePage === 0}
                  onClick={() => setLinePage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                </PagerButton>

                <span className="admin-figure px-2 text-[0.75rem] text-admin-muted">
                  {safeLinePage + 1} / {linePageCount}
                </span>

                <PagerButton
                  label="More lines"
                  disabled={safeLinePage >= linePageCount - 1}
                  onClick={() =>
                    setLinePage((p) => Math.min(linePageCount - 1, p + 1))
                  }
                >
                  <ChevronRight className="size-4" strokeWidth={2} />
                </PagerButton>
              </div>
            </div>
          )}
          </div>

          {/* Tender.

              Sticky and self-start: the totals and the Complete button stay put
              while the operator pages through the basket beside them. A column
              that scrolls away with the lines is one an operator has to hunt
              for at the moment they most need it. */}
          <div className="flex flex-col gap-5 border-t border-admin-line p-5 lg:sticky lg:top-4 lg:self-start lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {METHODS.map((option) => {
                  const active = method === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMethod(option.value)}
                      aria-pressed={active}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2.5",
                        "text-[0.75rem] font-semibold transition-colors duration-150",
                        active
                          ? option.active
                          : "border-admin-line text-admin-muted hover:bg-admin-hover hover:text-admin-fg"
                      )}
                    >
                      {/* The swatch only shows when unselected — once chosen,
                          the whole button is the colour. */}
                      {!active && (
                        <span
                          aria-hidden
                          className={cn("size-2 rounded-full", option.dot)}
                        />
                      )}
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Discount" hint="Optional">
                  <input
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={cn(inputClass(false), "admin-figure")}
                  />
                </Field>

                <Field label="Customer" hint="Optional">
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    className={inputClass(false)}
                  />
                </Field>
              </div>

              {method === "cash" && (
                <Field label="Cash tendered">
                  <input
                    value={tendered}
                    onChange={(event) => setTendered(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={cn(inputClass(false), "admin-figure")}
                  />
                </Field>
              )}

              {/* Only when the charge is real. With Paystack unconfigured
                  these two are labels on a sale settled some other way, and
                  asking for a phone number would imply a prompt that is never
                  going to arrive. */}
              {viaPaystack && method === "mpesa" && (
                <Field label="M-Pesa number" hint="The prompt goes here">
                  <input
                    value={mpesaPhone}
                    onChange={(event) => setMpesaPhone(event.target.value)}
                    inputMode="tel"
                    placeholder="07XX XXX XXX"
                    className={cn(inputClass(false), "admin-figure")}
                  />
                </Field>
              )}

              {viaPaystack && (
                <Field
                  label="Customer email"
                  hint={method === "card" ? "For the receipt" : "Optional"}
                >
                  <input
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    inputMode="email"
                    placeholder="Paystack needs one; the shop's is used otherwise"
                    className={inputClass(false)}
                  />
                </Field>
              )}
            </div>

            <div className="mt-auto flex flex-col gap-4">
              <dl className="space-y-1.5 text-[0.875rem]">
                <Row label="Subtotal" value={formatPrice(subtotal)} />
                {discountMinor > 0 && (
                  <Row label="Discount" value={`−${formatPrice(discountMinor)}`} />
                )}

                <div className="flex items-baseline justify-between border-t border-admin-line pt-3">
                  <dt className="font-medium text-admin-fg">Total</dt>
                  <dd className="admin-figure text-[1.75rem] font-light leading-none text-admin-fg">
                    {formatPrice(total)}
                  </dd>
                </div>

                {method === "cash" && tenderedMinor > 0 && (
                  <div
                    className={cn(
                      "flex items-baseline justify-between pt-1",
                      change < 0 ? "text-destructive" : "text-success"
                    )}
                  >
                    <dt className="font-medium">
                      {change < 0 ? "Short by" : "Change"}
                    </dt>
                    <dd className="admin-figure text-lg">
                      {formatPrice(Math.abs(change))}
                    </dd>
                  </div>
                )}
              </dl>

              <AdminButton
                className="h-12 w-full"
                disabled={!canComplete}
                onClick={complete}
              >
                {saving && <Loader2 className="size-4 animate-spin" strokeWidth={2} />}
                {saving ? "Recording…" : "Complete sale"}
              </AdminButton>
            </div>
          </div>
          </div>
        </Panel>
      </div>

      {pending && (
        <ChargeOverlay
          charge={pending}
          onAbandon={async () => {
            const reference = pending.reference;
            setPending(null);
            await abandonSalePayment(reference);
            toast.info("Payment cancelled and stock returned.");
            router.refresh();
          }}
        />
      )}

      {completed && (
        <ReceiptModal
          sale={completed.sale}
          lines={completed.lines}
          onClose={reset}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ charge */

/**
 * Blocking, on purpose.
 *
 * The charge is live on the customer's handset and the stock is already held.
 * An operator who wanders back to the cart and rings the sale up again takes
 * the money twice. "Cancel" is explicit and tells the server, so the sale is
 * voided and the stock returned rather than stranded pending.
 */
function ChargeOverlay({
  charge,
  onAbandon,
}: {
  charge: PendingCharge;
  onAbandon: () => void;
}) {
  const [elapsed, setElapsed] = React.useState(0);
  const [cancelling, setCancelling] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - charge.startedAt) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [charge.startedAt]);

  // Derived from the ticking state rather than a fresh Date.now(): reading the
  // clock during render is impure, and `elapsed` is already the same number.
  const remaining = Math.max(0, Math.ceil(CHARGE_TIMEOUT_MS / 1000) - elapsed);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-admin-bg/95 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-lg border border-admin-line bg-admin-panel p-7 text-center">
        <Loader2
          className="mx-auto size-7 animate-spin text-champagne-dark"
          strokeWidth={1.5}
        />

        <h2 className="mt-5 text-[1.0625rem] font-semibold text-admin-fg">
          {charge.method === "mpesa" ? "Waiting for the customer" : "Waiting for payment"}
        </h2>

        {charge.method === "mpesa" ? (
          <>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-admin-muted">
              {charge.displayText ??
                "Ask them to check their phone and enter their M-Pesa PIN."}
            </p>
            {charge.phone && (
              <p className="admin-figure mt-4 rounded-md border border-admin-line px-3 py-2 text-[0.875rem] font-semibold">
                {charge.phone}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-admin-muted">
              Have the customer open this on their own phone to enter their
              card. Nothing is typed into this device.
            </p>
            {charge.url && (
              <a
                href={charge.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block break-all rounded-md border border-admin-line px-3 py-2 text-[0.6875rem] text-champagne-dark underline-offset-2 hover:underline"
              >
                {charge.url}
              </a>
            )}
          </>
        )}

        <p className="admin-figure mt-5 text-[0.75rem] text-admin-faint">
          {formatElapsed(elapsed)} · giving up in {formatElapsed(remaining)}
        </p>

        <button
          type="button"
          disabled={cancelling}
          onClick={() => {
            setCancelling(true);
            onAbandon();
          }}
          className="mt-6 text-[0.75rem] text-admin-muted underline-offset-2 transition-colors hover:text-destructive hover:underline disabled:opacity-50"
        >
          {cancelling ? "Cancelling…" : "Cancel this payment"}
        </button>

        <p className="mt-5 text-[0.6875rem] leading-relaxed text-admin-faint">
          The sale is held with its stock reserved. Cancelling voids it and puts
          the stock back.
        </p>
      </div>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ pieces */

function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-admin-line px-5 py-3 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-admin-faint",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </th>
  );
}

function Stepper({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center text-admin-muted transition-colors hover:bg-admin-hover hover:text-admin-fg disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-admin-muted transition-colors hover:bg-admin-hover hover:text-admin-fg disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-admin-faint">{label}</dt>
      <dd className="admin-figure text-admin-muted">{value}</dd>
    </div>
  );
}

/* ----------------------------------------------------------------- receipt */

const RECEIPT_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The receipt.
 *
 * Real DOM printed through the browser's own dialog rather than a generated
 * PDF — no extra dependency, and whatever printer the counter already has set
 * up simply works. `@media print` in globals.css removes everything except the
 * `data-receipt` element and sets an 80mm roll.
 */
function ReceiptModal({
  sale,
  lines,
  onClose,
}: {
  sale: SaleRow;
  lines: Line[];
  onClose: () => void;
}) {
  const { format: formatPrice } = useAdminCurrency();

  return (
    <Modal title="Sale complete" onClose={onClose}>
      <ModalBody className="space-y-4">
        <div className="flex items-center gap-3" data-receipt-hide>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success/10 text-success">
            <Check className="size-5" strokeWidth={2} />
          </span>
          <span>
            <span className="admin-figure block text-[0.9375rem] font-medium text-admin-fg">
              {sale.reference}
            </span>
            <span className="block text-[0.75rem] text-admin-faint">
              Recorded and stock adjusted
            </span>
          </span>
        </div>

        <div
          data-receipt
          className="border border-admin-line bg-admin-panel p-5 font-mono text-[0.75rem] leading-relaxed text-admin-fg"
        >
          <p className="text-center text-[0.875rem] font-bold tracking-wide">
            ZYLO EXPRESS
          </p>
          <p className="mt-0.5 text-center">Sales receipt</p>

          <p className="mt-3 border-t border-dashed border-admin-line pt-3">
            {sale.reference}
          </p>
          <p>{RECEIPT_TIME.format(new Date(sale.created_at))}</p>
          <p>Served by {sale.operator_name || "—"}</p>
          {sale.customer_name && <p>Customer: {sale.customer_name}</p>}

          <table className="mt-3 w-full border-t border-dashed border-admin-line pt-3">
            <tbody>
              {lines.map((line) => (
                <tr key={line.item.variant_id} className="align-top">
                  <td className="py-1 pr-2">
                    {line.item.product_name}
                    <br />
                    <span className="opacity-70">
                      {line.quantity} × {formatPrice(line.item.price)}
                    </span>
                  </td>
                  <td className="py-1 text-right whitespace-nowrap">
                    {formatPrice(line.item.price * line.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-3 space-y-0.5 border-t border-dashed border-admin-line pt-3">
            <ReceiptRow label="Subtotal" value={formatPrice(sale.subtotal)} />
            {sale.discount > 0 && (
              <ReceiptRow
                label="Discount"
                value={`-${formatPrice(sale.discount)}`}
              />
            )}
            <ReceiptRow label="TOTAL" value={formatPrice(sale.total)} bold />
            <ReceiptRow label="Paid by" value={sale.payment_method} />
            {sale.tendered !== null && (
              <>
                <ReceiptRow label="Tendered" value={formatPrice(sale.tendered)} />
                <ReceiptRow
                  label="Change"
                  value={formatPrice(sale.tendered - sale.total)}
                />
              </>
            )}
          </dl>

          <p className="mt-4 border-t border-dashed border-admin-line pt-3 text-center">
            Thank you
          </p>
        </div>

        <div className="flex items-center gap-2" data-receipt-hide>
          <Badge tone="neutral">{sale.payment_method}</Badge>
          <span className="text-[0.75rem] text-admin-faint">
            {lines.length} {lines.length === 1 ? "line" : "lines"}
          </span>
        </div>
      </ModalBody>

      <ModalFooter>
        <AdminButton variant="secondary" onClick={() => window.print()}>
          <Printer className="size-3.5" strokeWidth={2} />
          Print receipt
        </AdminButton>
        <AdminButton onClick={onClose}>New sale</AdminButton>
      </ModalFooter>
    </Modal>
  );
}

function ReceiptRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-4", bold && "font-bold")}>
      <dt>{label}</dt>
      <dd className="whitespace-nowrap">{value}</dd>
    </div>
  );
}
