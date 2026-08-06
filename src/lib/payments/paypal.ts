import "server-only";

import { env } from "@/lib/env";

import { toDecimalString } from "./currency";

/**
 * PayPal adapter — Orders v2, server-side redirect flow.
 *
 *   create order → redirect the customer to PayPal's approval page
 *                → they return to /api/payments/paypal/return
 *                → capture → settle
 *
 * Not the JS SDK Buttons. Those need the client id in the browser and hand the
 * capture decision to a script this origin loads from PayPal's CDN — which the
 * app's CSP forbids and its architecture rules out. The redirect flow keeps
 * both credentials server-side and puts the capture on our server, where the
 * amount can be checked against the order before anything is marked paid.
 *
 * PayPal is charged the store's own currency (USD), so no conversion happens
 * here — but amounts still cross the boundary as decimal strings, because v2
 * takes `"1234.56"` where Paystack takes minor units. `toDecimalString` is the
 * only place that difference is expressed.
 */

const TIMEOUT_MS = 20_000;

export class PaypalError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = "PaypalError";
  }
}

/* ------------------------------------------------------------------ auth */

let tokenCache: { value: string; expiresAt: number } | null = null;

/**
 * Client-credentials access token, cached until shortly before it expires.
 *
 * Tokens last ~9 hours; fetching one per API call would triple the latency of
 * every checkout. The 60-second safety margin covers clock skew and the time
 * the token spends in flight on the call it was fetched for.
 */
async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.value;

  const credentials = Buffer.from(
    `${env.paypalClientId}:${env.paypalClientSecret}`
  ).toString("base64");

  const response = await fetch(`${env.paypalApiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new PaypalError(
      `PayPal refused the credentials (${response.status}).`,
      response.status
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return tokenCache.value;
}

async function request<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; requestId?: string }
): Promise<T> {
  const token = await accessToken();

  let response: Response;
  try {
    response = await fetch(`${env.paypalApiBase}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // Idempotency. A retried capture with the same key returns the
        // original result instead of taking the money twice.
        ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    throw new PaypalError(
      cause instanceof Error && cause.name === "TimeoutError"
        ? "PayPal did not respond in time."
        : "Could not reach PayPal."
    );
  }

  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const details = data.details as { description?: string }[] | undefined;
    throw new PaypalError(
      details?.[0]?.description ||
        (data.message as string) ||
        `PayPal rejected the request (${response.status}).`,
      response.status
    );
  }

  return data as T;
}

/* ---------------------------------------------------------------- orders */

interface PaypalLink {
  href: string;
  rel: string;
  method?: string;
}

export interface CreateOrderInput {
  /** Minor units of `currency` — converted to PayPal's decimal string here. */
  amount: number;
  currency: string;
  /** Our payment reference. Surfaces on the customer's PayPal statement. */
  reference: string;
  orderReference: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreateOrderResult {
  id: string;
  approvalUrl: string;
}

export async function createOrder(
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  const data = await request<{ id: string; links: PaypalLink[] }>(
    "/v2/checkout/orders",
    {
      method: "POST",
      requestId: input.reference,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.reference,
            // Echoed back on capture and on every webhook, which is how a
            // payload is matched to a payment row without trusting a URL.
            custom_id: input.reference,
            invoice_id: input.reference,
            description: `ZYLO Express order ${input.orderReference}`,
            amount: {
              currency_code: input.currency,
              value: toDecimalString(input.amount, input.currency),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "ZYLO Express",
              // The delivery address is already collected and priced by this
              // point; letting PayPal offer a different one would produce an
              // order shipping somewhere the tax and shipping were not
              // calculated for.
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      },
    }
  );

  // `payer-action` is what v2 returns alongside `payment_source`; `approve` is
  // the older `application_context` spelling. Accept both so an API-version
  // change does not strand customers on a page with nowhere to go.
  const approval = data.links.find(
    (link) => link.rel === "payer-action" || link.rel === "approve"
  );

  if (!approval) {
    throw new PaypalError("PayPal returned no approval link.");
  }

  return { id: data.id, approvalUrl: approval.href };
}

export interface CaptureResult {
  status: string;
  /** The capture id — the thing a refund is issued against, not the order id. */
  captureId: string | null;
  amount: number;
  currency: string;
  /** `custom_id` round-tripped from creation: our payment reference. */
  reference: string | null;
}

interface CaptureResponse {
  status: string;
  purchase_units?: {
    custom_id?: string;
    payments?: {
      captures?: {
        id: string;
        status: string;
        custom_id?: string;
        amount: { currency_code: string; value: string };
      }[];
    };
  }[];
}

function readCapture(data: CaptureResponse): CaptureResult {
  const unit = data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];

  return {
    status: capture?.status ?? data.status,
    captureId: capture?.id ?? null,
    amount: capture
      ? Math.round(Number(capture.amount.value) * 100)
      : 0,
    currency: capture?.amount.currency_code ?? "USD",
    reference: capture?.custom_id ?? unit?.custom_id ?? null,
  };
}

/**
 * Take the money.
 *
 * PayPal answers `COMPLETED` here or nothing is captured. The caller still has
 * to check the captured amount against the order: an approval flow that was
 * tampered with, or an order edited between creation and approval, must not
 * settle just because PayPal said the capture itself succeeded.
 */
export async function captureOrder(
  paypalOrderId: string,
  requestId: string
): Promise<CaptureResult> {
  const data = await request<CaptureResponse>(
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    { method: "POST", body: {}, requestId }
  );

  return readCapture(data);
}

/** Read an order back without capturing — used to recover a stuck return. */
export async function getOrder(paypalOrderId: string): Promise<CaptureResult> {
  const data = await request<CaptureResponse>(
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
    { method: "GET" }
  );

  return readCapture(data);
}

/* --------------------------------------------------------------- webhook */

export interface WebhookHeaders {
  transmissionId: string | null;
  transmissionTime: string | null;
  transmissionSig: string | null;
  certUrl: string | null;
  authAlgo: string | null;
}

/**
 * Authenticate a webhook delivery.
 *
 * PayPal has no local HMAC to recompute — verification is a call back to their
 * API with the transmission headers and the parsed event. Consequently this
 * costs a round trip, and returns false (never throws) so a handler treats an
 * unverifiable delivery exactly like a forged one.
 *
 * With no `PAYPAL_WEBHOOK_ID` configured there is nothing to verify against,
 * so everything is rejected. That is deliberate: an unverified webhook that
 * settles orders is a public endpoint for marking anything paid.
 */
export async function verifyWebhookSignature(
  headers: WebhookHeaders,
  event: unknown
): Promise<boolean> {
  const webhookId = env.paypalWebhookId;
  if (!webhookId) {
    console.warn("[paypal] PAYPAL_WEBHOOK_ID unset; rejecting webhook.");
    return false;
  }

  if (
    !headers.transmissionId ||
    !headers.transmissionTime ||
    !headers.transmissionSig ||
    !headers.certUrl ||
    !headers.authAlgo
  ) {
    return false;
  }

  try {
    const data = await request<{ verification_status: string }>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: {
          auth_algo: headers.authAlgo,
          cert_url: headers.certUrl,
          transmission_id: headers.transmissionId,
          transmission_sig: headers.transmissionSig,
          transmission_time: headers.transmissionTime,
          webhook_id: webhookId,
          webhook_event: event,
        },
      }
    );

    return data.verification_status === "SUCCESS";
  } catch (error) {
    console.error("[paypal] webhook verification failed:", error);
    return false;
  }
}
