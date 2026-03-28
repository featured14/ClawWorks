"use client";

import { forwardRef } from "react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "system"
  | "danger"
  | "success";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconOnly?: boolean;
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-[var(--btn-h-sm)] px-[var(--btn-pad-x-sm)] text-[13px] font-medium",
  md: "h-[var(--btn-h-md)] px-[var(--btn-pad-x-md)] text-[14px] font-medium",
  lg: "h-[var(--btn-h-lg)] px-[var(--btn-pad-x-lg)] text-[15px] font-semibold",
};

const radiusStyles: Record<ButtonSize, string> = {
  sm: "rounded-[var(--btn-radius-sm)]",
  md: "rounded-[var(--btn-radius-md)]",
  lg: "rounded-[var(--btn-radius-lg)]",
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border border-[var(--btn-primary-border)]",
    "hover:bg-[var(--btn-primary-bg-hover)]",
    "active:bg-[var(--btn-primary-bg-active)]",
  ].join(" "),
  secondary: [
    "bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] border border-[var(--btn-secondary-border)]",
    "hover:bg-[var(--btn-secondary-bg-hover)] hover:border-[var(--btn-secondary-border-hover)]",
    "active:bg-[var(--btn-secondary-bg-active)]",
  ].join(" "),
  ghost: [
    "bg-transparent text-[var(--btn-ghost-text)] border border-transparent",
    "hover:bg-[var(--btn-ghost-bg-hover)] hover:text-[var(--btn-ghost-text-hover)]",
    "active:bg-[var(--btn-ghost-bg-active)]",
  ].join(" "),
  system: [
    "bg-[var(--btn-system-bg)] text-[var(--btn-system-text)] border border-[var(--btn-system-border)]",
    "hover:bg-[var(--btn-system-bg-hover)]",
    "active:bg-[var(--btn-system-bg-active)]",
  ].join(" "),
  danger: [
    "bg-[var(--btn-danger-bg)] text-[var(--btn-danger-text)] border border-[var(--btn-danger-border)]",
    "hover:bg-[var(--btn-danger-bg-hover)]",
    "active:bg-[var(--btn-danger-bg-active)]",
  ].join(" "),
  success: [
    "bg-[var(--btn-success-bg)] text-[var(--btn-success-text)] border border-[var(--btn-success-border)]",
    "hover:bg-[var(--btn-success-bg-hover)]",
    "active:bg-[var(--btn-success-bg-active)]",
  ].join(" "),
};

const disabledStyles =
  "disabled:bg-[var(--btn-disabled-bg)] disabled:text-[var(--btn-disabled-text)] disabled:border-[var(--btn-disabled-border)] disabled:cursor-not-allowed disabled:shadow-none";

const focusStyles =
  "focus-visible:outline-none focus-visible:shadow-[var(--btn-focus-ring)]";

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      icon,
      iconOnly = false,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const iconOnlySize: Record<ButtonSize, string> = {
      sm: "!w-[var(--btn-h-sm)] !px-0 justify-center",
      md: "!w-[var(--btn-h-md)] !px-0 justify-center",
      lg: "!w-[var(--btn-h-lg)] !px-0 justify-center",
    };

    const classes = [
      "inline-flex items-center justify-center shrink-0 transition-colors cursor-pointer select-none",
      sizeStyles[size],
      radiusStyles[size],
      variantStyles[variant],
      focusStyles,
      disabledStyles,
      iconOnly ? iconOnlySize[size] : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} className={classes} {...props}>
        {icon && (
          <span className={`shrink-0 [&>svg]:h-4 [&>svg]:w-4${children ? " mr-2" : ""}`}>
            {icon}
          </span>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
export type { ButtonProps, ButtonVariant, ButtonSize };
