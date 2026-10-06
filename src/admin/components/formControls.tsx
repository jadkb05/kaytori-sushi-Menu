/** Champs de formulaire partagés par l'édition et la création de produit. */
import type { ReactNode } from "react";
import { inputClass } from "./ui";

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-stone-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const fieldError = (base: string, error?: string) => `${base} ${error ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""}`;

export function PriceInput({ id, value, onChange, error }: { id: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldError(`${inputClass} pr-11 tabular-nums`, error)}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-stone-500">DH</span>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
      {children}
    </section>
  );
}
