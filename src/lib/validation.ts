import { z } from "zod";

/**
 * Shared schemas. These are imported by the client forms today and will be
 * reused verbatim by the Supabase Edge Functions, so a payload can never pass
 * the browser and fail the server for a different reason.
 *
 * No schema here uses `.default()`. A default makes Zod's input type differ
 * from its output type, which in turn splits React Hook Form's generics — so
 * defaults live in each form's `defaultValues` instead, where they belong.
 */

const requiredString = (field: string, max = 120) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(max, `${field} must be under ${max} characters`);

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email address is required")
  .email("Enter a valid email address")
  .max(254, "Email address is too long");

/** Consent stays a plain boolean so an unchecked box is still a valid input. */
const mustAccept = (message: string) =>
  z.boolean().refine((value) => value === true, { message });

export const newsletterSchema = z.object({
  email: emailSchema,
  consent: mustAccept("Please accept to continue"),
});
export type NewsletterValues = z.infer<typeof newsletterSchema>;

/* ------------------------------------------------------------------- auth */

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
  remember: z.boolean(),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    firstName: requiredString("First name", 60),
    lastName: requiredString("Last name", 60),
    email: emailSchema,
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(72, "Password must be under 72 characters")
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[0-9]/, "Include a number"),
    confirmPassword: z.string(),
    marketingOptIn: z.boolean(),
    terms: mustAccept("Please accept the terms of sale"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type SignUpValues = z.infer<typeof signUpSchema>;

export const resetRequestSchema = z.object({ email: emailSchema });
export type ResetRequestValues = z.infer<typeof resetRequestSchema>;

/* --------------------------------------------------------------- checkout */

/** ISO-3166 alpha-2 subset the boutique currently ships to. */
export const SHIPPING_COUNTRIES = [
  { code: "US", name: "United States", postalLabel: "ZIP code", regionLabel: "State" },
  { code: "CA", name: "Canada", postalLabel: "Postal code", regionLabel: "Province" },
  { code: "GB", name: "United Kingdom", postalLabel: "Postcode", regionLabel: "County" },
  { code: "FR", name: "France", postalLabel: "Code postal", regionLabel: "Région" },
  { code: "IT", name: "Italy", postalLabel: "CAP", regionLabel: "Provincia" },
  { code: "DE", name: "Germany", postalLabel: "PLZ", regionLabel: "Bundesland" },
  { code: "JP", name: "Japan", postalLabel: "Postal code", regionLabel: "Prefecture" },
  { code: "AE", name: "United Arab Emirates", postalLabel: "PO Box", regionLabel: "Emirate" },
  { code: "AU", name: "Australia", postalLabel: "Postcode", regionLabel: "State" },
  { code: "KE", name: "Kenya", postalLabel: "Postal code", regionLabel: "County" },
] as const;

const COUNTRY_CODES = SHIPPING_COUNTRIES.map((c) => c.code);

export const addressSchema = z.object({
  firstName: requiredString("First name", 60),
  lastName: requiredString("Last name", 60),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  line1: requiredString("Address", 160),
  line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: requiredString("City", 80),
  region: requiredString("Region", 80),
  postalCode: requiredString("Postal code", 16),
  country: z.enum(COUNTRY_CODES as unknown as [string, ...string[]], {
    errorMap: () => ({ message: "Select a delivery country" }),
  }),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a contact number")
    .max(24, "Contact number is too long")
    .regex(/^[+0-9()\-.\s]+$/, "Enter a valid contact number"),
});
export type AddressValues = z.infer<typeof addressSchema>;

export const contactStepSchema = z.object({
  email: emailSchema,
  marketingOptIn: z.boolean(),
});
export type ContactStepValues = z.infer<typeof contactStepSchema>;

export const deliveryStepSchema = z.object({
  shippingAddress: addressSchema,
  shippingMethodId: z.enum(["standard", "express", "same-day"]),
  giftMessage: z.string().trim().max(280).optional().or(z.literal("")),
});
export type DeliveryStepValues = z.infer<typeof deliveryStepSchema>;

export const PAYMENT_METHODS = ["card", "mpesa", "paypal"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

/**
 * Kenyan mobile number, in any of the four forms people actually type.
 *
 * Must stay in step with `normaliseKenyanMsisdn` in `@/lib/payments/paystack`,
 * which is what Paystack is actually handed. This copy exists because that
 * module is server-only and the checkout needs to reject a typo before it
 * costs a round trip — it is a convenience check, not the authority.
 */
const KENYAN_MOBILE = /^(?:\+?254|0)?[17]\d{8}$/;

/**
 * No card fields.
 *
 * Cards are collected on Paystack's hosted page, which this app redirects to,
 * so no PAN, expiry or CVC ever reaches this origin — there is nothing here to
 * validate and nothing to accidentally log. What the customer chooses is the
 * *method*; everything sensitive belongs to the provider.
 */
const paymentStepFields = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS, {
    errorMap: () => ({ message: "Choose how you would like to pay" }),
  }),
  mpesaPhone: z.string().trim().max(24).optional().or(z.literal("")),
  billingSameAsShipping: z.boolean(),
  billingAddress: addressSchema.optional(),
});

/**
 * The two cross-field rules, applied identically to the step schema and the
 * whole-checkout schema.
 *
 * Kept as a function rather than duplicated: a refinement that exists on one
 * of the two is a rule the step gate enforces and the submit does not, or the
 * reverse — and either way the customer meets it at the wrong moment.
 */
function withPaymentRules<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .refine(
      (values: z.infer<typeof paymentStepFields>) =>
        values.billingSameAsShipping || !!values.billingAddress,
      { message: "A billing address is required", path: ["billingAddress"] }
    )
    .refine(
      (values: z.infer<typeof paymentStepFields>) =>
        values.paymentMethod !== "mpesa" ||
        KENYAN_MOBILE.test((values.mpesaPhone ?? "").replace(/[\s-]/g, "")),
      {
        message: "Enter the M-Pesa number to send the prompt to",
        path: ["mpesaPhone"],
      }
    );
}

export const paymentStepSchema = withPaymentRules(paymentStepFields);
export type PaymentStepValues = z.infer<typeof paymentStepFields>;

export const checkoutSchema = withPaymentRules(
  contactStepSchema.merge(deliveryStepSchema).merge(paymentStepFields)
);
export type CheckoutValues = z.infer<typeof contactStepSchema> &
  z.infer<typeof deliveryStepSchema> &
  z.infer<typeof paymentStepFields>;

/**
 * What the browser is allowed to send when starting a checkout.
 *
 * Deliberately carries variant ids and quantities and no prices. The server
 * re-reads every amount from the catalogue in `@/lib/orders`; a `price` field
 * here would be a field someone could set.
 */
export const startCheckoutSchema = z.object({
  email: emailSchema,
  marketingOptIn: z.boolean(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional().nullable(),
  billingSameAsShipping: z.boolean(),
  shippingMethodId: z.enum(["standard", "express", "same-day"]),
  giftMessage: z.string().trim().max(280).optional().or(z.literal("")),
  promotionCode: z.string().trim().max(24).optional().nullable(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  mpesaPhone: z.string().trim().max(24).optional().or(z.literal("")),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid("Unrecognised item"),
        quantity: z.number().int().min(1).max(20),
      })
    )
    .min(1, "Your bag is empty")
    .max(50, "Too many items in one order"),
});
export type StartCheckoutValues = z.infer<typeof startCheckoutSchema>;

/* ------------------------------------------------------------------ misc */

export const promotionSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Enter a valid code")
    .max(24, "Enter a valid code"),
});
export type PromotionValues = z.infer<typeof promotionSchema>;

export const contactSchema = z.object({
  name: requiredString("Name", 80),
  email: emailSchema,
  subject: requiredString("Subject", 120),
  orderReference: z.string().trim().max(24).optional().or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(20, "Please give us a little more detail")
    .max(2000, "Message is too long"),
});
export type ContactValues = z.infer<typeof contactSchema>;

export const reviewSchema = z.object({
  rating: z.number().int().min(1, "Select a rating").max(5),
  title: requiredString("Title", 100),
  body: z
    .string()
    .trim()
    .min(20, "Please write at least 20 characters")
    .max(1500, "Review is too long"),
  recommend: z.boolean(),
});
export type ReviewValues = z.infer<typeof reviewSchema>;

/* -------------------------------------------------------------- helpers */

// The Luhn and expiry-date checks that used to live here are gone with the
// card fields they validated. Card details are entered on Paystack's hosted
// page now, so there is no card number on this origin to check.

export function countryByCode(code: string) {
  return SHIPPING_COUNTRIES.find((c) => c.code === code) ?? SHIPPING_COUNTRIES[0];
}
