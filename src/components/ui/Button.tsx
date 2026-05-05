import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
  }
>;

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-blue-600 bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-blue-600",
  secondary:
    "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-blue-600",
  danger:
    "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:outline-red-500",
  ghost:
    "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:outline-blue-600",
};

export function Button({
  children,
  className = "",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${variants[variant]} ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
