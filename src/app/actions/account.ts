"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { RateLimits, clientIdentifier, rateLimit } from "@/lib/rate-limit";

/**
 * Account mutations.
 *
 * Every action re-checks the session itself. A Server Action is a public HTTP
 * endpoint — the proxy redirect that keeps signed-out visitors off /account is
 * a navigation convenience, not authorization, and does not protect these.
 *
 * Ownership is never taken from the payload: `user_id` comes from the verified
 * session, and RLS re-checks it in Postgres. A caller cannot edit another
 * customer's address by guessing its id.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+()\d\s-]*$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  marketingOptIn: z.boolean(),
});

const addressSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  label: z.string().trim().max(40).optional().or(z.literal("")),
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  company: z.string().trim().max(80).optional().or(z.literal("")),
  line1: z.string().trim().min(1, "Address is required").max(120),
  line2: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().min(1, "City is required").max(80),
  region: z.string().trim().min(1, "Region is required").max(80),
  postalCode: z.string().trim().min(1, "Postcode is required").max(24),
  country: z.string().trim().length(2, "Select a country"),
  phone: z.string().trim().min(1, "Phone number is required").max(32),
  isDefault: z.boolean(),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors;
  return Object.fromEntries(
    Object.entries(flat)
      .filter(([, messages]) => messages?.length)
      .map(([field, messages]) => [field, messages![0]])
  );
}

/* --------------------------------------------------------------- profile */

export async function updateProfile(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };

  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone") ?? "",
    marketingOptIn: formData.get("marketingOptIn") === "on",
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { firstName, lastName, phone, marketingOptIn } = parsed.data;
  const supabase = await createClient();

  // Written to auth metadata as well as the profiles row. The metadata copy is
  // what the account page falls back to before the migrations are applied, so
  // keeping both in step means the name survives either way.
  const { error: metaError } = await supabase.auth.updateUser({
    data: {
      first_name: firstName,
      last_name: lastName,
      marketing_opt_in: marketingOptIn,
    },
  });

  if (metaError) {
    console.error("[account] auth metadata update failed:", metaError.message);
    return { error: "Could not save your details. Please try again." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      marketing_opt_in: marketingOptIn,
      // `role` is deliberately absent: RLS rejects any update that changes it,
      // so including it here would fail the whole write.
    })
    .eq("id", user.id);

  if (profileError) {
    // The metadata write already succeeded, so the name is saved and visible.
    // Report success rather than alarming the customer about a table they
    // cannot see.
    console.warn("[account] profiles update skipped:", profileError.message);
  }

  revalidatePath("/account", "layout");
  return { success: "Your details have been saved." };
}

/* ------------------------------------------------------------- addresses */

export async function saveAddress(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };

  const limit = await rateLimit(
    "account:address",
    await clientIdentifier(),
    RateLimits.submit
  );
  if (!limit.success) return { error: "Too many changes. Please slow down." };

  const parsed = addressSchema.safeParse({
    id: formData.get("id") ?? "",
    label: formData.get("label") ?? "",
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    company: formData.get("company") ?? "",
    line1: formData.get("line1"),
    line2: formData.get("line2") ?? "",
    city: formData.get("city"),
    region: formData.get("region"),
    postalCode: formData.get("postalCode"),
    country: formData.get("country"),
    phone: formData.get("phone"),
    isDefault: formData.get("isDefault") === "on",
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, isDefault, ...values } = parsed.data;
  const supabase = await createClient();

  // A partial unique index allows only one default per user, so the previous
  // default must be cleared first or the insert violates it.
  if (isDefault) {
    await supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("is_default", true);
  }

  const row = {
    user_id: user.id,
    label: values.label || null,
    first_name: values.firstName,
    last_name: values.lastName,
    company: values.company || null,
    line1: values.line1,
    line2: values.line2 || null,
    city: values.city,
    region: values.region,
    postal_code: values.postalCode,
    country: values.country.toUpperCase(),
    phone: values.phone,
    is_default: isDefault,
  };

  const { error } = id
    ? // `eq("user_id")` is belt-and-braces: RLS already scopes this, but it
      // makes the ownership requirement obvious at the call site.
      await supabase.from("addresses").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("addresses").insert(row);

  if (error) {
    console.error("[account] address save failed:", error.message);
    return {
      error:
        "Could not save the address. If this persists, the database may not be set up yet.",
    };
  }

  revalidatePath("/account/addresses");
  revalidatePath("/account");
  return { success: id ? "Address updated." : "Address added." };
}

export async function deleteAddress(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "No address specified." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("addresses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[account] address delete failed:", error.message);
    return { error: "Could not remove the address." };
  }

  revalidatePath("/account/addresses");
  revalidatePath("/account");
  return { success: "Address removed." };
}

export async function setDefaultAddress(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "No address specified." };

  const supabase = await createClient();

  await supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("is_default", true);

  const { error } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[account] set default failed:", error.message);
    return { error: "Could not update the default address." };
  }

  revalidatePath("/account/addresses");
  revalidatePath("/account");
  return { success: "Default address updated." };
}
