"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "light"}
      position="bottom-right"
      duration={4200}
      gap={10}
      offset={24}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-none !border !border-hairline !bg-background !text-foreground !shadow-[0_18px_48px_rgba(0,0,0,0.14)] !font-sans !gap-3 !p-5",
          title: "!text-[0.6875rem] !uppercase !tracking-[0.24em] !font-normal",
          description: "!text-sm !font-light !text-muted-foreground !mt-1",
          actionButton:
            "!rounded-none !bg-primary !text-primary-foreground !text-[0.625rem] !uppercase !tracking-[0.18em] !h-9 !px-4",
          cancelButton:
            "!rounded-none !bg-transparent !text-muted-foreground !text-[0.625rem] !uppercase !tracking-[0.18em]",
          icon: "!text-champagne-dark",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
