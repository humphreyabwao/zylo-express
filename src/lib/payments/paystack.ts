import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getCredentials } from "@/lib/payments/credentials";

/**
 * Paystack adapter — cards and M-Pesa.
 *
 * Two flows, one provider:
 *
 *   card   initialize → redirect to Paystack's hosted page → callback → verify
 *   mpesa  charge with an msisdn → Paystack pushes an STK prompt to the handset
 *          → poll verify, and/or take the `charge.success` webhook
 *
 * The card flow is a redirect rather than Paystack Inline on purpose. Inline
 * needs the public key in the browser and renders the card form in an iframe
 * this origin hosts; the redirect keeps card entry entirely on Paystack's
 * domain, which is both the smaller PCI footprint and consistent with this
 * app's rule that no provider key reaches the client.
 *
 * Every amount crossing this boundary is minor units of the *charge* currency
 * (KES cents for a Kenyan account), already converted by payments/currency.ts.
 */

const API = "https://api.paystack.co";
const TIMEOUT_MS = 20_000;

/** Paystack's envelope. `status` here is the API call, not the payment. */
interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = "PaystackError";
  }
}

/**
 * The key in force, from Settings if an operator has saved one and from the
 * environment otherwise. Resolved per call rather than captured at module load
 * so that switching sandbox → production in the portal takes effect on the
 * next request instead of the next deploy.
 */
async function secretKey(): Promise<string> {
  const credentials = await getCredentials("paystack");

  if (!credentials) {
    throw new PaystackError(
      "Paystack is not configured. Add a secret key in Settings → Payments."
    );
  }

  return credentials.secretKey;
}

async function request<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<T> {
  const key = await secretKey();
  let response: Response;

  try {
    response = await fetch(`${API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      // Payment calls must never be served from a cache, and Next's fetch
      // extends the platform one with caching that defaults on for GET.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    // A timeout is not a failed payment — the charge may well have landed.
    // Callers surface this as "unconfirmed" and let the webhook settle it.
    throw new PaystackError(
      cause instanceof Error && cause.name === "TimeoutError"
        ? "Paystack did not respond in time."
        : "Could not reach Paystack."
    );
  }

  let envelope: PaystackEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as PaystackEnvelope<T>;
  } catch {
    // Fall through to the status check below with no parsed message.
  }

  if (!response.ok || !envelope?.status) {
    throw new PaystackError(
      envelope?.message || `Paystack rejected the request (${response.status}).`,
      response.status
    );
  }

  return envelope.data;
}

/* ------------------------------------------------------------ key check */

export interface AccountCheck {
  /** Account name as Paystack has it, when the key is good. */
  businessName: string;
  /** Currencies the account can settle — what `settlement_currency` must be. */
  currencies: string[];
}

/**
 * Prove a key works, before a customer finds out it doesn't.
 *
 * `/balance` is the cheapest authenticated call Paystack offers: it moves no
 * money, needs no prior transaction, and fails loudly on a bad key. It also
 * answers the question behind most misconfigurations — the balance is returned
 * per currency, so an account that cannot settle KES says so here rather than
 * at the first checkout.
 */
export async function checkAccount(): Promise<AccountCheck> {
  const balances = await request<{ currency: string; balance: number }[]>(
    "/balance",
    { method: "GET" }
  );

  // Paystack's integration name lives on a separate endpoint; a failure there
  // should not turn a working key into a red cross, so it is best-effort.
  let businessName = "Paystack account";
  try {
    const integration = await request<{ business_name?: string }>(
      "/integration",
      { method: "GET" }
    );
    if (integration?.business_name) businessName = integration.business_name;
  } catch {
    // Keep the default.
  }

  return {
    businessName,
    currencies: balances.map((entry) => entry.currency.toUpperCase()),
  };
}

/* ------------------------------------------------------------------ cards */

export interface InitializeInput {
  email: string;
  /** Minor units of `currency`. */
  amount: number;
  currency: string;
  /** Our payment reference; Paystack echoes it back on verify and webhook. */
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export async function initializeTransaction(
  input: InitializeInput
): Promise<InitializeResult> {
  const data = await request<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>("/transaction/initialize", {
    method: "POST",
    body: {
      email: input.email,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      // Restricted to card. Mobile money has its own flow below, and leaving
      // it selectable here would produce a payment row whose `method` says
      // card while the customer paid by phone.
      channels: ["card"],
      metadata: input.metadata,
    },
  });

  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference,
  };
}

/* ------------------------------------------------------------------ mpesa */

export interface MobileMoneyChargeInput {
  email: string;
  amount: number;
  currency: string;
  reference: string;
  /** Local-format msisdn, e.g. "0712345678". */
  phone: string;
  metadata?: Record<string, unknown>;
}

/**
 * What Paystack says came of the charge.
 *
 * `pay_offline` is the expected happy path for M-Pesa: the STK prompt is on
 * the customer's handset and nothing more happens here until they enter their
 * PIN. `success` on the initial call is possible but rare.
 */
export type ChargeStatus =
  | "pay_offline"
  | "send_otp"
  | "send_pin"
  | "open_url"
  | "success"
  | "failed"
  | "pending";

export interface ChargeResult {
  status: ChargeStatus;
  reference: string;
  /** Paystack's own copy for the customer, e.g. the STK prompt instruction. */
  displayText?: string;
  message?: string;
}

export async function chargeMobileMoney(
  input: MobileMoneyChargeInput
): Promise<ChargeResult> {
  const data = await request<{
    status: ChargeStatus;
    reference: string;
    display_text?: string;
    message?: string;
  }>("/charge", {
    method: "POST",
    body: {
      email: input.email,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      mobile_money: { phone: input.phone, provider: "mpesa" },
      metadata: input.metadata,
    },
  });

  return {
    status: data.status,
    reference: data.reference,
    displayText: data.display_text,
    message: data.message,
  };
}

/* ----------------------------------------------------------------- verify */

export interface VerifyResult {
  /** The payment's outcome, unlike the envelope's `status`. */
  status: "success" | "failed" | "abandoned" | "pending" | "ongoing" | "reversed";
  reference: string;
  providerReference: string;
  amount: number;
  currency: string;
  channel: string | null;
  paidAt: string | null;
  gatewayResponse: string | null;
}

/**
 * Ask Paystack what actually happened.
 *
 * This is the authority, not the query string a customer's browser returned
 * with: `?reference=…` on the callback is a hint about which payment to look
 * up, and nothing more. A crafted callback URL must never be able to confirm
 * an order, which is why the callback route verifies before settling.
 */
export async function verifyTransaction(
  reference: string
): Promise<VerifyResult> {
  const data = await request<{
    status: VerifyResult["status"];
    reference: string;
    id: number;
    amount: number;
    currency: string;
    channel: string | null;
    paid_at: string | null;
    gateway_response: string | null;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });

  return {
    status: data.status,
    reference: data.reference,
    providerReference: String(data.id),
    amount: data.amount,
    currency: data.currency,
    channel: data.channel,
    paidAt: data.paid_at,
    gatewayResponse: data.gateway_response,
  };
}

/* ---------------------------------------------------------------- webhook */

/**
 * Authenticate a webhook delivery.
 *
 * Paystack signs the raw request body with HMAC-SHA512 keyed by the secret
 * key. The body must be the exact bytes received — re-serialising parsed JSON
 * reorders keys and changes whitespace, and the digest will never match.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  if (!signature) return false;

  let key: string;
  try {
    key = await secretKey();
  } catch {
    // Unconfigured means nothing can be authenticated, so nothing is trusted.
    return false;
  }

  const expected = createHmac("sha512", key)
    .update(rawBody, "utf8")
    .digest("hex");

  const received = Buffer.from(signature, "utf8");
  const computed = Buffer.from(expected, "utf8");

  // timingSafeEqual throws on a length mismatch, which is itself a leak of
  // information — check the length first and answer in constant time after.
  if (received.length !== computed.length) return false;
  return timingSafeEqual(received, computed);
}

/* --------------------------------------------------------------- msisdn */

export interface NormalisedMsisdn {
  /** "0712345678" — the form Paystack's mobile money API expects. */
  local: string;
  /** "+254712345678" — what we store and show back to the customer. */
  e164: string;
}

/**
 * Normalise a Kenyan mobile number.
 *
 * Accepts the four ways people actually type one — +254712345678,
 * 254712345678, 0712345678, 712345678 — and rejects everything else. Safaricom
 * and Airtel prefixes are both 7x and 1x, so the check is on length and the
 * leading digit rather than an operator prefix table that goes stale.
 */
export function normaliseKenyanMsisdn(input: string): NormalisedMsisdn | null {
  const digits = input.replace(/[^\d]/g, "");

  let subscriber: string;
  if (digits.length === 12 && digits.startsWith("254")) {
    subscriber = digits.slice(3);
  } else if (digits.length === 10 && digits.startsWith("0")) {
    subscriber = digits.slice(1);
  } else if (digits.length === 9) {
    subscriber = digits;
  } else {
    return null;
  }

  if (!/^[17]\d{8}$/.test(subscriber)) return null;

  return { local: `0${subscriber}`, e164: `+254${subscriber}` };
}
