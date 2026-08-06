"use client";

import type { Control, FieldValues, Path } from "react-hook-form";
import { useWatch } from "react-hook-form";

import { SHIPPING_COUNTRIES, countryByCode } from "@/lib/validation";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AddressFieldsProps<T extends FieldValues> {
  control: Control<T>;
  /** Dot-path prefix, e.g. `shippingAddress`. */
  prefix: string;
  autoCompleteSection?: "shipping" | "billing";
}

/**
 * One address block reused for shipping and billing. Postal and region labels
 * follow the selected country so the form reads correctly outside the US.
 */
export function AddressFields<T extends FieldValues>({
  control,
  prefix,
  autoCompleteSection = "shipping",
}: AddressFieldsProps<T>) {
  const path = (field: string) => `${prefix}.${field}` as Path<T>;
  const section = autoCompleteSection;

  const countryCode = useWatch({
    control,
    name: path("country"),
  }) as string | undefined;
  const country = countryByCode(countryCode ?? "US");

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <FormField
        control={control}
        name={path("firstName")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>First name</FormLabel>
            <FormControl>
              <Input {...field} autoComplete={`${section} given-name`} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path("lastName")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Last name</FormLabel>
            <FormControl>
              <Input {...field} autoComplete={`${section} family-name`} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path("company")}
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Company (optional)</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ""}
                autoComplete={`${section} organization`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path("line1")}
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Address</FormLabel>
            <FormControl>
              <Input
                {...field}
                autoComplete={`${section} address-line1`}
                placeholder="Street and number"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path("line2")}
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Apartment, floor (optional)</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ""}
                autoComplete={`${section} address-line2`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path("city")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>City</FormLabel>
            <FormControl>
              <Input {...field} autoComplete={`${section} address-level2`} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path("region")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{country.regionLabel}</FormLabel>
            <FormControl>
              <Input {...field} autoComplete={`${section} address-level1`} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path("postalCode")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{country.postalLabel}</FormLabel>
            <FormControl>
              <Input {...field} autoComplete={`${section} postal-code`} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path("country")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Country</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {SHIPPING_COUNTRIES.map((entry) => (
                  <SelectItem key={entry.code} value={entry.code}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path("phone")}
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Contact number</FormLabel>
            <FormControl>
              <Input {...field} type="tel" autoComplete={`${section} tel`} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
