import "server-only";

import { getEmailCredentials } from "@/lib/email/credentials";

/**
 * Resend adapter.
 *
 * A `fetch` against one REST endpoint rather than the `resend` npm package.
 * The package is a thin wrapper over the same call and would add a dependency
 * plus its own transitive tree to send a JSON body — the same reasoning that
 * keeps `paystack.ts` and `paypal.ts` on plain fetch.
 *
 * Nothing here decides *whether* to send. That is `notifications.ts`, which owns
 * the idempotency ledger; this module knows how to talk to Resend and nothing
 * about orders.
 */

const API = "https://api.resend.com/emails";
const TIMEOUT_MS = 15_000;

export class ResendError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = "ResendError";
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Always send one — see `text()` in templates.ts. */
  text: string;
  /**
   * Resend's own idempotency header.
   *
   * Belt and braces with the `email_deliveries` unique key: ours stops a second
   * *attempt*, this stops a retried HTTP request that our ledger already thinks
   * succeeded — a socket that died after Resend accepted it, say.
   */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  id: string;
}

/**
 * Send one email.
 *
 * Throws rather than returning a result union, because every caller is already
 * inside a try//catch that records the failure on the delivery row — and a
 * caller that forgot to check a boolean would silently mark mail as sent.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const credentials = await getEmailCredentials();

  if (!credentials) {
    throw new ResendError(
      "Email is not configured. Add a Resend API key in Settings → Email."
    );
  }

  const from = credentials.fromName
    ? `${credentials.fromName} <${credentials.fromEmail}>`
    : credentials.fromEmail;

  let response: Response;

  try {
    response = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey
          ? { "Idempotency-Key": input.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(credentials.replyTo ? { reply_to: credentials.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    throw new ResendError(
      cause instanceof Error && cause.name === "TimeoutError"
        ? "Resend did not respond in time."
        : "Could not reach Resend."
    );
  }

  const body = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; name?: string }
    | null;

  if (!response.ok) {
    /*
     * The two failures an operator will actually hit, named rather than
     * relayed. Resend's own text for the second is "You can only send testing
     * emails to your own email address", which is accurate and gives no hint
     * that the fix is domain verification.
     */
    const message =
      response.status === 401 || response.status === 403
        ? "Resend rejected that API key. Check it was copied in full."
        : /testing emails|own email address/i.test(body?.message ?? "")
          ? "Resend is in sandbox: it will only deliver to your own account address until you verify a sending domain and set the From address to it."
          : (body?.message ?? `Resend rejected the request (${response.status}).`);

    throw new ResendError(message, response.status);
  }

  if (!body?.id) {
    throw new ResendError("Resend accepted the request but returned no id.");
  }

  return { id: body.id };
}
