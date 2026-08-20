import { Check, Lock, RefreshCw, X } from "lucide-react";

export type HandleOptionStatus = "available" | "taken" | "reserved";
export interface HandleOption {
  handle: string;
  status: HandleOptionStatus;
}

interface Props {
  options: HandleOption[];
  loading: boolean;
  value: string;
  onSelect: (handle: string) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

/**
 * Verified members pick their handle from server-generated name combinations
 * instead of typing free text. Every option holds at least one full name
 * part, and availability is checked server-side (never trust a client guess).
 */
export function HandleOptionPicker({
  options,
  loading,
  value,
  onSelect,
  onRegenerate,
  regenerating,
}: Props) {
  if (loading) {
    return (
      <ul aria-label="Loading handle options" className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="h-11 animate-pulse border border-border bg-muted/40"
            aria-hidden
          />
        ))}
      </ul>
    );
  }

  if (options.length === 0) {
    return (
      <div className="border border-border bg-card p-4">
        <p className="text-sm text-foreground">We couldn't generate any handle options.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This can happen if your name is very short or every combination is already taken.
        </p>
        {onRegenerate ? (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} aria-hidden />
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Verified accounts choose from name-based handles. Pick the one you want.
      </p>
      <ul role="radiogroup" aria-label="Available verified handles" className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = option.handle === value;
          const disabled = option.status !== "available";
          return (
            <li key={option.handle}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => !disabled && onSelect(option.handle)}
                className={`flex w-full items-center justify-between gap-2 border px-3 py-2.5 text-left font-mono text-sm transition-colors ${
                  disabled
                    ? "cursor-not-allowed border-border bg-muted/30 text-muted-foreground/50"
                    : selected
                      ? "border-foreground bg-foreground/5 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="truncate">rout.be/u/@{option.handle}</span>
                {selected ? (
                  <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                ) : option.status === "taken" ? (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide">
                    <X className="h-3 w-3" aria-hidden /> Taken
                  </span>
                ) : option.status === "reserved" ? (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide">
                    <Lock className="h-3 w-3" aria-hidden /> Reserved
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {onRegenerate ? (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} aria-hidden />
          Generate more options
        </button>
      ) : null}
    </div>
  );
}
