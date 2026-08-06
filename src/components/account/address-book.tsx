"use client";

import * as React from "react";
import { Check, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteAddress,
  saveAddress,
  setDefaultAddress,
  type ActionState,
} from "@/app/actions/account";
import type { AccountAddress } from "@/lib/account";
import { SHIPPING_COUNTRIES, countryByCode } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The address book.
 *
 * Client-side only for the dialog and pending states — every mutation is a
 * Server Action, so nothing here talks to Supabase and ownership is decided
 * from the session on the server, never from a hidden field.
 */
export function AddressBook({ addresses }: { addresses: AccountAddress[] }) {
  const [editing, setEditing] = React.useState<AccountAddress | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (address: AccountAddress) => {
    setEditing(address);
    setOpen(true);
  };

  const run = (
    action: (state: ActionState, formData: FormData) => Promise<ActionState>,
    formData: FormData,
    onDone?: () => void
  ) => {
    startTransition(async () => {
      const result = await action({}, formData);

      if (result.error) {
        toast.error("Something went wrong", { description: result.error });
        return;
      }
      if (result.fieldErrors) {
        toast.error("Check the form", {
          description: Object.values(result.fieldErrors)[0],
        });
        return;
      }
      if (result.success) toast.success(result.success);
      onDone?.();
    });
  };

  return (
    <div>
      {addresses.length > 0 && (
        <div className="mb-6 flex justify-end">
          <Button variant="outline" size="sm" onClick={openNew}>
            <Plus className="size-3.5" strokeWidth={1.5} />
            Add address
          </Button>
        </div>
      )}

      {addresses.length === 0 && (
        <Button onClick={openNew}>
          <Plus className="size-3.5" strokeWidth={1.5} />
          Add an address
        </Button>
      )}

      {addresses.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2">
          {addresses.map((address) => {
            const country = countryByCode(address.country);

            return (
              <li
                key={address.id}
                className={cn(
                  "flex flex-col border p-5",
                  address.isDefault
                    ? "border-champagne-dark/50"
                    : "border-hairline"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="flex items-center gap-2 eyebrow-sm text-foreground">
                    <MapPin
                      className="size-3.5 text-muted-foreground"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    {address.label || "Address"}
                  </p>
                  {address.isDefault && (
                    <span className="flex items-center gap-1.5 eyebrow-sm text-champagne-dark">
                      <Check className="size-3" strokeWidth={2} />
                      Default
                    </span>
                  )}
                </div>

                <address className="mt-4 flex-1 text-sm font-light not-italic leading-relaxed text-muted-foreground">
                  {address.firstName} {address.lastName}
                  {address.company && (
                    <>
                      <br />
                      {address.company}
                    </>
                  )}
                  <br />
                  {address.line1}
                  {address.line2 && (
                    <>
                      <br />
                      {address.line2}
                    </>
                  )}
                  <br />
                  {address.city}, {address.region} {address.postalCode}
                  <br />
                  {country.name}
                  <br />
                  {address.phone}
                </address>

                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <button
                    type="button"
                    onClick={() => openEdit(address)}
                    className="inline-flex items-center gap-1.5 eyebrow-sm text-muted-foreground transition-colors duration-400 hover:text-foreground"
                  >
                    <Pencil className="size-3" strokeWidth={1.5} />
                    Edit
                  </button>

                  {!address.isDefault && (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("id", address.id);
                          run(setDefaultAddress, fd);
                        }}
                        className="eyebrow-sm text-muted-foreground transition-colors duration-400 hover:text-foreground disabled:opacity-50"
                      >
                        Make default
                      </button>

                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("id", address.id);
                          run(deleteAddress, fd);
                        }}
                        className="ml-auto inline-flex items-center gap-1.5 eyebrow-sm text-muted-foreground transition-colors duration-400 hover:text-[#d12d2d] disabled:opacity-50"
                      >
                        <Trash2 className="size-3" strokeWidth={1.5} />
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Trigger lives above; this is controlled so Edit can open it too. */}
        <DialogTrigger className="sr-only">Add address</DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit address" : "Add an address"}
            </DialogTitle>
            <DialogDescription>
              Used at checkout and for arranging returns.
            </DialogDescription>
          </DialogHeader>

          <form
            action={(formData) => run(saveAddress, formData, () => setOpen(false))}
            className="space-y-5"
            // Remounted per record so the uncontrolled inputs pick up the
            // right defaults when switching between add and edit.
            key={editing?.id ?? "new"}
          >
            {editing && <input type="hidden" name="id" value={editing.id} />}

            <Field name="label" label="Label (optional)" defaultValue={editing?.label ?? ""} placeholder="Home, Office…" />

            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="firstName" label="First name" defaultValue={editing?.firstName ?? ""} required autoComplete="given-name" />
              <Field name="lastName" label="Last name" defaultValue={editing?.lastName ?? ""} required autoComplete="family-name" />
            </div>

            <Field name="company" label="Company (optional)" defaultValue={editing?.company ?? ""} autoComplete="organization" />
            <Field name="line1" label="Address" defaultValue={editing?.line1 ?? ""} required autoComplete="address-line1" />
            <Field name="line2" label="Apartment, suite (optional)" defaultValue={editing?.line2 ?? ""} autoComplete="address-line2" />

            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="city" label="City" defaultValue={editing?.city ?? ""} required autoComplete="address-level2" />
              <Field name="region" label="Region / State" defaultValue={editing?.region ?? ""} required autoComplete="address-level1" />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="postalCode" label="Postcode" defaultValue={editing?.postalCode ?? ""} required autoComplete="postal-code" />

              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Select
                  name="country"
                  defaultValue={editing?.country ?? SHIPPING_COUNTRIES[0].code}
                >
                  <SelectTrigger id="country">
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIPPING_COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Field name="phone" label="Phone" defaultValue={editing?.phone ?? ""} required type="tel" autoComplete="tel" />

            <label className="flex cursor-pointer items-center gap-3">
              <Checkbox
                name="isDefault"
                defaultChecked={editing?.isDefault ?? addresses.length === 0}
              />
              <span className="text-sm font-light text-muted-foreground">
                Use as my default address
              </span>
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : editing ? "Save changes" : "Add address"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
  type = "text",
  placeholder,
  autoComplete,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </div>
  );
}
