import "server-only";

import { ORDER_STATUS } from "@/lib/order-status";
import type { OrderStatusDb } from "@/lib/supabase/types";

/**
 * Order email, as HTML that survives a mail client.
 *
 * Written by hand rather than with a component library because email HTML is
 * not web HTML: no external stylesheet, no flexbox or grid in Outlook, no
 * `<style>` at all in Gmail's clipped view, and a hard 102KB ceiling before
 * Gmail truncates the message and hides the tracking button. Tables and inline
 * styles are the compatible subset, and a renderer that produced anything nicer
 * would produce it in some clients only.
 *
 * The timeline is drawn with table cells and a border-left rather than SVG or
 * background images, both of which are commonly stripped.
 */

export interface TrackingEmailEvent {
  label: string;
  location: string | null;
  detail: string | null;
  occurredAt: string;
}

export interface TrackingEmailInput {
  reference: string;
  status: OrderStatusDb;
  /** The customer's first name, when we have one. */
  name: string | null;
  /** Absolute — an email has no origin to be relative to. */
  trackingUrl: string;
  carrier: string | null;
  trackingNumber: string | null;
  /** The carrier's own page, when the operator recorded one. */
  carrierUrl: string | null;
  /** Newest first. Rendered newest-first: the reason they opened this. */
  events: TrackingEmailEvent[];
  cancelReason: string | null;
}

/* ---------------------------------------------------------------- helpers */

/**
 * Escape before interpolation. Every field below is operator- or
 * customer-supplied, and a checkpoint reading `Held at <b>customs` must not be
 * able to reshape the message — nor, in a client that renders it, inject a link.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function when(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "" : `${STAMP.format(parsed)} UTC`;
}

/** The palette, inline. Matches the storefront's champagne/obsidian. */
const INK = "#161616";
const MUTED = "#6b6b6b";
const FAINT = "#9a9a9a";
const LINE = "#e6e3de";
const CHAMPAGNE = "#8a6d3b";
const CANVAS = "#faf9f7";

/* ------------------------------------------------------------------- copy */

/**
 * The subject line, and the sentence under the heading.
 *
 * Keyed by status so the message says what happened rather than "your order has
 * been updated", which is the phrasing that trains people to stop opening them.
 */
function copyFor(status: OrderStatusDb, reference: string) {
  switch (status) {
    case "confirmed":
      return {
        subject: `Order ${reference} confirmed`,
        heading: "Your order is confirmed",
        lede: "We have your payment and your order is being picked. You will hear from us again when it leaves us.",
      };
    case "in-atelier":
      return {
        subject: `Order ${reference} is being prepared`,
        heading: "Your order is being prepared",
        lede: "Your pieces are being checked and packed. Items from different countries may travel separately.",
      };
    case "shipped":
      return {
        subject: `Order ${reference} is on its way`,
        heading: "Your order is on its way",
        lede: "Your parcel has left us. Follow it any time with the link below — no sign-in needed.",
      };
    case "delivered":
      return {
        subject: `Order ${reference} delivered`,
        heading: "Your order has arrived",
        lede: "This one is marked delivered. If anything is not right, reply to this email within thirty days.",
      };
    case "cancelled":
      return {
        subject: `Order ${reference} cancelled`,
        heading: "Your order has been cancelled",
        lede: "Anything already charged goes back to the original payment method.",
      };
    case "refunded":
      return {
        subject: `Order ${reference} refunded`,
        heading: "Your order has been refunded",
        lede: "The refund is on its way back to your original payment method. Banks usually take a few working days.",
      };
    default:
      return {
        subject: `Order ${reference} update`,
        heading: "There is an update on your order",
        lede: "Here is where your order stands.",
      };
  }
}

/* ------------------------------------------------------------------- html */

function timelineRows(events: TrackingEmailEvent[]): string {
  return events
    .map((event, index) => {
      const first = index === 0;
      const dot = first ? CHAMPAGNE : LINE;
      const label = first ? INK : MUTED;

      const meta = [event.location, when(event.occurredAt)]
        .filter(Boolean)
        .map((part) => esc(part!))
        .join(" &middot; ");

      return `
      <tr>
        <td width="24" valign="top" style="padding:0;">
          <div style="width:9px;height:9px;border-radius:50%;background:${dot};margin:6px auto 0;"></div>
          ${
            index === events.length - 1
              ? ""
              : `<div style="width:1px;height:100%;min-height:26px;background:${LINE};margin:4px auto 0;"></div>`
          }
        </td>
        <td valign="top" style="padding:0 0 18px 10px;">
          <div style="font:600 15px/1.4 Helvetica,Arial,sans-serif;color:${label};">${esc(event.label)}</div>
          ${meta ? `<div style="font:400 13px/1.5 Helvetica,Arial,sans-serif;color:${FAINT};margin-top:2px;">${meta}</div>` : ""}
          ${event.detail ? `<div style="font:400 13px/1.5 Helvetica,Arial,sans-serif;color:${MUTED};margin-top:4px;">${esc(event.detail)}</div>` : ""}
        </td>
      </tr>`;
    })
    .join("");
}

export function renderTrackingEmail(input: TrackingEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { subject, heading, lede } = copyFor(input.status, input.reference);
  const greeting = input.name ? `Hello ${esc(input.name)},` : "Hello,";

  const carrierLine = [input.carrier, input.trackingNumber]
    .filter(Boolean)
    .map((part) => esc(part!))
    .join(" &middot; ");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
<!-- Preheader: the grey line beside the subject in an inbox list. Hidden in the
     body itself, or it renders twice. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(lede)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};">
<tr><td align="center" style="padding:32px 16px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};">

    <tr><td style="padding:28px 32px 0;">
      <div style="font:400 13px/1 Helvetica,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:${CHAMPAGNE};">ZYLO Express</div>
    </td></tr>

    <tr><td style="padding:20px 32px 0;">
      <h1 style="margin:0;font:300 25px/1.25 Georgia,'Times New Roman',serif;color:${INK};">${esc(heading)}</h1>
      <p style="margin:14px 0 0;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">${greeting}</p>
      <p style="margin:8px 0 0;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">${esc(lede)}</p>
      ${
        input.cancelReason
          ? `<p style="margin:12px 0 0;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">Reason: ${esc(input.cancelReason)}</p>`
          : ""
      }
    </td></tr>

    <tr><td style="padding:22px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};background:${CANVAS};">
        <tr><td style="padding:14px 16px;">
          <div style="font:400 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:${FAINT};">Order</div>
          <div style="font:600 17px/1.3 Helvetica,Arial,sans-serif;color:${INK};margin-top:5px;">${esc(input.reference)}</div>
          ${carrierLine ? `<div style="font:400 13px/1.5 Helvetica,Arial,sans-serif;color:${MUTED};margin-top:6px;">${carrierLine}</div>` : ""}
        </td></tr>
      </table>
    </td></tr>

    ${
      input.events.length > 0
        ? `<tr><td style="padding:26px 32px 0;">
      <div style="font:400 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:${FAINT};padding-bottom:14px;">Progress</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${timelineRows(input.events)}</table>
    </td></tr>`
        : ""
    }

    <tr><td style="padding:12px 32px 0;">
      <!-- A table wrapping the anchor, not a styled <a> alone: Outlook ignores
           padding on inline elements and the button collapses to bare text. -->
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td style="background:${INK};">
          <a href="${esc(input.trackingUrl)}" style="display:inline-block;padding:13px 26px;font:600 13px/1 Helvetica,Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#ffffff;text-decoration:none;">Track this order</a>
        </td></tr>
      </table>
      <p style="margin:12px 0 0;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:${FAINT};">This link is yours — it opens your tracking page without signing in, so keep it to yourself.</p>
      ${
        input.carrierUrl
          ? `<p style="margin:10px 0 0;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};"><a href="${esc(input.carrierUrl)}" style="color:${CHAMPAGNE};">Follow it on the carrier&rsquo;s own site</a></p>`
          : ""
      }
    </td></tr>

    <tr><td style="padding:26px 32px 30px;">
      <div style="border-top:1px solid ${LINE};padding-top:16px;font:400 12px/1.7 Helvetica,Arial,sans-serif;color:${FAINT};">
        Pieces from different countries ship separately and may arrive on different days.
        Reply to this email if anything looks wrong.
      </div>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;

  /*
   * The plain-text alternative is not a formality. A message with no text part
   * scores as spam with most filters, and some corporate gateways strip HTML
   * outright — for those readers this is the email.
   */
  const text = [
    heading,
    "",
    input.name ? `Hello ${input.name},` : "Hello,",
    lede,
    input.cancelReason ? `Reason: ${input.cancelReason}` : "",
    "",
    `Order: ${input.reference}`,
    input.carrier ? `Carrier: ${input.carrier}` : "",
    input.trackingNumber ? `Tracking number: ${input.trackingNumber}` : "",
    "",
    input.events.length > 0 ? "Progress:" : "",
    ...input.events.map((event) =>
      [
        `  - ${event.label}`,
        [event.location, when(event.occurredAt)].filter(Boolean).join(" - "),
        event.detail,
      ]
        .filter(Boolean)
        .join("\n    ")
    ),
    "",
    `Track this order: ${input.trackingUrl}`,
    input.carrierUrl ? `Carrier tracking: ${input.carrierUrl}` : "",
    "",
    "This link opens your tracking page without signing in, so keep it to yourself.",
    "",
    "ZYLO Express",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text };
}

/** Used by the Settings "send a test" button. */
export function renderTestEmail(to: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "ZYLO Express — email is working";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;background:${CANVAS};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid ${LINE};">
    <tr><td style="padding:28px 32px;">
      <div style="font:400 13px/1 Helvetica,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:${CHAMPAGNE};">ZYLO Express</div>
      <h1 style="margin:18px 0 0;font:300 23px/1.3 Georgia,serif;color:${INK};">Email is working</h1>
      <p style="margin:12px 0 0;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
        Sent to ${esc(to)} from the portal. Order and tracking mail will go out the same way.
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  return {
    subject,
    html,
    text: `ZYLO Express — email is working.\n\nSent to ${to} from the portal. Order and tracking mail will go out the same way.`,
  };
}

/** Re-exported so callers do not import the status map from two places. */
export { ORDER_STATUS };
