import type { ReactNode } from "react";
import { classNames } from "@/lib/utils";
import { Switch } from "@/components/ui/shadcn/switch";

export function AdminCard({
  children,
  className,
  compact,
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={classNames("card", compact ? "p-3" : "p-5 sm:p-6", className)}
    >
      {children}
    </div>
  );
}

export function AdminHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-foreground dark:text-primary-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function AdminButton({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "success" | "link";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-50";
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary:
      "bg-card text-card-foreground border border-border hover:bg-muted/50 dark:bg-card dark:text-muted-foreground/60 dark:border-white/5 dark:hover:bg-white/5",
    danger:
      "bg-card text-red-600 border border-red-200 hover:bg-red-50 dark:bg-card dark:text-red-400 dark:border-red-500/20 dark:hover:bg-red-500/10",
    success: "bg-emerald-500 text-primary-foreground hover:bg-emerald-600",
    link: "bg-transparent text-brand-purple hover:underline px-0 py-0",
  };
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={classNames(base, variants[variant], className)}
    >
      {children}
    </Button>
  );
}

export function StateMessage({
  type,
  title,
  message,
  action,
}: {
  type: "loading" | "error" | "empty";
  title: string;
  message: string;
  action?: ReactNode;
}) {
  const styles = {
    loading:
      "border-border bg-muted/50 text-muted-foreground dark:border-white/5 dark:bg-white/5 dark:text-muted-foreground",
    error:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
    empty:
      "border-dashed border-border bg-muted/50 text-muted-foreground dark:border-white/10 dark:bg-white/5 dark:text-muted-foreground",
  };
  return (
    <div
      className={classNames("rounded-lg border p-8 text-center", styles[type])}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}

export function AdminField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-card-foreground dark:text-muted-foreground/60">
        {label}
      </span>
      {hint && (
        <span className="mt-0.5 block text-xs text-muted-foreground dark:text-muted-foreground">
          {hint}
        </span>
      )}
      <div className="mt-1.5">{children}</div>
      {error && (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}

// =========================================================
// CollapsibleGroup, used to break long flat admin lists
// (colors, materials, products, …) into organized, collapsible
// sections grouped by category/family instead of one endless scroll.
// =========================================================

export function CollapsibleGroup({
  title,
  count,
  isOpen,
  onToggle,
  children,
  preview,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  preview?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border dark:border-white/5">
      <Button
        variant="ghost"
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50 dark:bg-card dark:hover:bg-white/5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <svg
            className={classNames(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isOpen && "rotate-90",
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span className="truncate text-sm font-bold text-foreground dark:text-primary-foreground">
            {title}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground dark:bg-white/10 dark:text-muted-foreground">
            {count}
          </span>
        </div>
        {preview && (
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            {preview}
          </div>
        )}
      </Button>
      {isOpen && (
        <div className="border-t border-border bg-muted/60 p-3 dark:border-white/5 dark:bg-white/[0.02]">
          {children}
        </div>
      )}
    </div>
  );
}

export function GroupControls({
  onExpandAll,
  onCollapseAll,
  groupLabel = "groups",
}: {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  groupLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground dark:text-muted-foreground">
      <span>Organized into {groupLabel}</span>
      <Button
        variant="link"
        type="button"
        onClick={onExpandAll}
        className="text-brand-purple hover:underline dark:text-brand-purple-lighter"
      >
        Expand all
      </Button>
      <span className="text-muted-foreground/80 dark:text-muted-foreground">
        ·
      </span>
      <Button
        variant="link"
        type="button"
        onClick={onCollapseAll}
        className="text-brand-purple hover:underline dark:text-brand-purple-lighter"
      >
        Collapse all
      </Button>
    </div>
  );
}

// =========================================================
// AdminInput / AdminTextarea, shadcn-based form controls
// with FRELUX dark-mode styling baked in. Drop-in replacement
// for the old `input-field` CSS class pattern.
// =========================================================

import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import { Textarea as ShadcnTextarea } from "@/components/ui/shadcn/textarea";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function AdminInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <ShadcnInput
      className={classNames(
        "rounded-lg px-3.5 py-2.5 dark:bg-card dark:border-white/10",
        className,
      )}
      {...props}
    />
  );
}

export function AdminTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <ShadcnTextarea
      className={classNames(
        "rounded-lg px-3.5 py-2.5 dark:bg-card dark:border-white/10",
        className,
      )}
      {...props}
    />
  );
}

// =========================================================
// AdminSelect, native <select> with FRELUX dark-mode styling.
// shadcn-compatible border/ring tokens. Drop-in replacement
// for the old input-field CSS class on <select> elements.
// =========================================================

import type { SelectHTMLAttributes } from "react";
import { Button } from "@/components/ui/shadcn/button";

export function AdminSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={classNames(
        "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        "dark:bg-card dark:border-white/10",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

// =========================================================
// AdminIconButton, compact icon-only action button for
// edit/delete/move/close patterns. Two variants: ghost (neutral)
// and danger (red for delete actions).
// =========================================================

export function AdminIconButton({
  children,
  onClick,
  variant = "ghost",
  type = "button",
  disabled,
  className,
  title,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
  "aria-label"?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-md p-1 transition-all active:scale-95 disabled:opacity-50";
  const variants = {
    ghost:
      "text-muted-foreground hover:bg-muted hover:text-brand-purple dark:hover:bg-white/10",
    danger:
      "text-muted-foreground hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10",
  };
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={classNames(base, variants[variant], className)}
    >
      {children}
    </Button>
  );
}

// =========================================================
// AdminTabButton, tab/filter selector with active/inactive
// states. Three variants:
//   underline, bottom-border tab (default, classic tab bar)
//   pill     , rounded bordered pill (icon + label tabs)
//   filter   , solid/outline filter chip (severity filters)
// =========================================================

export function AdminTabButton({
  active = false,
  onClick,
  children,
  variant = "underline",
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  variant?: "underline" | "pill" | "filter";
  className?: string;
}) {
  const base = "text-sm font-medium transition-colors";
  const variants = {
    underline: {
      base: "px-4 py-2.5",
      active:
        "border-b-2 border-brand-purple text-brand-purple dark:text-brand-purple-lighter",
      inactive:
        "text-muted-foreground hover:text-card-foreground dark:text-muted-foreground",
    },
    pill: {
      base: "flex items-center gap-2 rounded-lg px-4 py-2 border",
      active: "border-brand-purple bg-primary/10 text-brand-purple",
      inactive:
        "border-border text-muted-foreground hover:border-border dark:border-white/10",
    },
    filter: {
      base: "rounded-lg px-3 py-1.5 capitalize",
      active:
        "bg-foreground text-background",
      inactive:
        "bg-card border border-border text-muted-foreground hover:bg-muted/50 dark:bg-white/5 dark:border-white/10 dark:text-muted-foreground",
    },
  };
  const v = variants[variant];
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onClick}
      className={classNames(
        base,
        v.base,
        active ? v.active : v.inactive,
        className,
      )}
    >
      {children}
    </Button>
  );
}
