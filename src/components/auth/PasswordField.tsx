"use client";

import { useState } from "react";
import { IconEye, IconEyeOff } from "@/components/icons";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: "current-password" | "new-password";
  minLength?: number;
  helper?: string;
  required?: boolean;
  describedById?: string;
};

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  helper,
  required,
  describedById,
}: Props): JSX.Element {
  const [visible, setVisible] = useState(false);
  const helperId = helper ? `${id}-helper` : undefined;
  const describedBy = [describedById, helperId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          className="input pr-11"
          value={value}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-r-md"
        >
          {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      </div>
      {helper ? (
        <p id={helperId} className="text-xs text-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
