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

/**
 * Card fields are validated for shape only. In production the inputs are
 * replaced by the payment provider's hosted fields and no PAN ever touches
 * this origin — the schema stays so the demo flow behaves realistically.
 */
export const paymentStepSchema = z.object({
  cardholder: requiredString("Cardholder name", 80),
  cardNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(
      z
        .string()
        .regex(/^\d{13,19}$/, "Enter a valid card number")
        .refine(luhn, "Enter a valid card number")
    ),
  expiry: z
    .string()
    .trim()
    .regex(/^(0[1-9]|1[0-2])\s?\/\s?\d{2}$/, "Use MM/YY")
    .refine(notExpired, "This card has expired"),
  cvc: z
    .string()
    .trim()
    .regex(/^\d{3,4}$/, "Enter the security code"),
  billingSameAsShipping: z.boolean(),
  billingAddress: addressSchema.optional(),
});
export type PaymentStepValues = z.infer<typeof paymentStepSchema>;

export const checkoutSchema = contactStepSchema
  .merge(deliveryStepSchema)
  .merge(paymentStepSchema)
  .refine(
    (values) => values.billingSameAsShipping || !!values.billingAddress,
    { message: "A billing address is required", path: ["billingAddress"] }
  );
export type CheckoutValues = z.infer<typeof checkoutSchema>;

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

function luhn(value: string): boolean {
  let sum = 0;
  let double = false;

  for (let i = value.length - 1; i >= 0; i--) {
    let digit = value.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
}

function notExpired(value: string): boolean {
  const [monthRaw, yearRaw] = value.split("/").map((p) => p.trim());
  const month = Number(monthRaw);
  const year = 2000 + Number(yearRaw);
  if (!Number.isFinite(month) || !Number.isFinite(year)) return false;

  // Cards remain valid through the final day of the printed month.
  const expiry = new Date(year, month, 1);
  return expiry.getTime() > Date.now();
}

export function countryByCode(code: string) {
  return SHIPPING_COUNTRIES.find((c) => c.code === code) ?? SHIPPING_COUNTRIES[0];
}
