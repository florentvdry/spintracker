import { cn } from "@/lib/utils";
import React from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-ink font-semibold shadow-[0_12px_40px_-12px_rgba(45,212,167,0.7)] hover:bg-brand-soft",
  secondary: "bg-white/[0.06] text-white hover:bg-white/10 border border-line-strong",
  outline: "border border-line-strong text-white hover:bg-white/5",
  ghost: "text-muted hover:text-white hover:bg-white/5",
};

const sizes: Record<Size, string> = {
  sm: "h-10 px-5 text-sm",
  md: "h-12 px-6 text-base",
  lg: "h-14 px-8 text-lg",
};

/** Class string so links can look like buttons without nesting a <button> in an <a>. */
export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap font-medium transition-colors duration-200 cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
    "disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    className
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button ref={ref} className={buttonStyles({ variant, size, className })} {...props} />
  )
);

Button.displayName = "Button";
