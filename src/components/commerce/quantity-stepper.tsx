"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 10,
  label = "Quantity",
  className,
  size = "md",
  disabled = false,
}: QuantityStepperProps) {
  const dims =
    size === "sm"
      ? { button: "size-8", text: "w-8 text-xs", icon: "size-3" }
      : { button: "size-11", text: "w-10 text-sm", icon: "size-3.5" };

  return (
    <div
      className={cn(
        "inline-flex items-center border border-input",
        disabled && "opacity-50",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
        className={cn(
          "grid place-items-center text-foreground transition-colors duration-400",
          "hover:bg-secondary disabled:pointer-events-none disabled:opacity-30",
          dims.button
        )}
      >
        <Minus className={dims.icon} strokeWidth={1.25} />
      </button>

      <span
        aria-live="polite"
        className={cn(
          "select-none text-center font-light tabular-nums",
          dims.text
        )}
      >
        {value}
      </span>

      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
        className={cn(
          "grid place-items-center text-foreground transition-colors duration-400",
          "hover:bg-secondary disabled:pointer-events-none disabled:opacity-30",
          dims.button
        )}
      >
        <Plus className={dims.icon} strokeWidth={1.25} />
      </button>
    </div>
  );
}
