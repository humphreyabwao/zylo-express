"use client";

import * as React from "react";
import { MailCheck } from "lucide-react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { contactSchema, type ContactValues } from "@/lib/validation";
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

  // Posted to a Supabase Edge Function in the backend phase, which writes the
  // enquiry and notifies the advisor queue.
  const onSubmit = async () => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    setSent(true);
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
        onSubmit={form.handleSubmit(onSubmit)}
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
