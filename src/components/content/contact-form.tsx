"use client";

import * as React from "react";
import { MailCheck } from "lucide-react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { contactSchema, type ContactValues } from "@/lib/validation";
import { submitContactMessage } from "@/app/actions/contact";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm() {
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      orderReference: "",
      message: "",
    },
  });

  /**
   * Writes the enquiry to `contact_messages`, where the admin inbox reads it.
   *
   * This used to `await` a 900ms timeout and declare success. Every message a
   * customer sent was discarded in the browser, and the confirmation panel
   * below — "Your message is with us" — was false every single time.
   *
   * The action re-validates everything this form validates. `contactSchema`
   * here is for the typing experience; the server's copy is the one that
   * decides, because a Server Action is a public endpoint whatever the UI in
   * front of it does.
   */
  const onSubmit = async (values: ContactValues) => {
    const result = await submitContactMessage(values);

    if (result.ok) {
      setSent(true);
      return;
    }

    // Field errors land on their fields; anything else goes above the button,
    // where it is next to the thing that failed rather than in a toast the
    // sender has to catch.
    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        form.setError(field as keyof ContactValues, { message });
      }
    }
    setError(result.fieldErrors ? null : result.message);
  };

  if (sent) {
    return (
      <div className="border border-hairline p-8 lg:p-10">
        <MailCheck className="size-6 text-champagne-dark" strokeWidth={1} />
        <h2 className="mt-5 font-display text-2xl font-light">
          Your message is with us
        </h2>
        <p className="mt-3 text-sm font-light leading-relaxed text-muted-foreground">
          A client advisor will reply within one business day — the same day if
          you wrote before 16:00. You will hear from a person, not a queue.
        </p>
        <Button
          variant="outline"
          className="mt-7"
          onClick={() => {
            form.reset();
            setSent(false);
          }}
        >
          Write another message
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          setError(null);
          void form.handleSubmit(onSubmit)(event);
        }}
        className="space-y-7"
        noValidate
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input {...field} type="email" autoComplete="email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="orderReference"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Order reference (optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder="ZY-000000" />
              </FormControl>
              <FormDescription>
                Quoting it lets us answer without asking you for it first.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea {...field} className="min-h-40" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && (
          <p
            role="alert"
            className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-light leading-relaxed text-destructive"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Sending…" : "Send message"}
        </Button>
      </form>
    </Form>
  );
}
