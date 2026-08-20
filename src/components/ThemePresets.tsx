import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { SelectionIndicator } from "./SelectionIndicator";
import { PickerAnnouncer } from "./PickerAnnouncer";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";
import { MiniQrGlyph, type BodyShape } from "./BodyShapeSelector";

export type ThemeCategory = "minimal" | "vibrant" | "dark" | "brand";

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  fgColor: string;
  bgColor: string;
  bgGradient?: string;
  /** Swatch preview background — falls back to bgGradient/bgColor. */
  preview?: string;
  /** Pattern preset applied together with the colours. */
  shape: BodyShape;
  /** Filter-chip bucket for inline discovery. */
  category: ThemeCategory;
}

const g = (s: string) => s.replace(/\s+/g, " ").trim();

export const themePresets: ThemePreset[] = [
  {
    id: "transparent",
    shape: "square",
    category: "minimal",
    name: "None",
    description: "Transparent background",
    fgColor: "#1C1917",
    bgColor: "transparent",
    preview:
      "linear-gradient(45deg,#d4d4d4 25%,transparent 25%),linear-gradient(-45deg,#d4d4d4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d4d4d4 75%),linear-gradient(-45deg,transparent 75%,#d4d4d4 75%)",
  },
  {
    id: "paper",
    shape: "rounded",
    category: "minimal",
    name: "Paper",
    description: "Soft, minimal",
    fgColor: "#3d3225",
    bgColor: "#faf6f0",
    bgGradient: g(`
      radial-gradient(ellipse at 0% 0%, #f5ede3 0%, transparent 50%),
      radial-gradient(ellipse at 100% 0%, #ebe4d8 0%, transparent 50%),
      radial-gradient(ellipse at 100% 100%, #f0e6d6 0%, transparent 50%),
      radial-gradient(ellipse at 0% 100%, #faf6f0 0%, transparent 50%),
      linear-gradient(135deg, #faf6f0 0%, #f5ede3 100%)
    `),
  },
  {
    id: "midnight",
    shape: "dots",
    category: "dark",
    name: "Midnight",
    description: "Dark, high contrast",
    fgColor: "#ffffff",
    bgColor: "#1e293b",
    bgGradient: g(`
      radial-gradient(ellipse at 0% 0%, #334155 0%, transparent 50%),
      radial-gradient(ellipse at 100% 50%, #1e3a5f 0%, transparent 50%),
      radial-gradient(ellipse at 50% 100%, #312e81 0%, transparent 50%),
      linear-gradient(160deg, #0f172a 0%, #020617 100%)
    `),
  },
  {
    id: "pastel",
    shape: "rounded",
    category: "vibrant",
    name: "Pastel",
    description: "Soft, dreamy",
    fgColor: "#7a3f57",
    bgColor: "#fdf6f3",
    bgGradient: g(`
      radial-gradient(ellipse at 0% 0%, #fce7f3 0%, transparent 50%),
      radial-gradient(ellipse at 100% 0%, #e9d5ff 0%, transparent 50%),
      radial-gradient(ellipse at 100% 100%, #fbcfe8 0%, transparent 50%),
      linear-gradient(135deg, #fdf6f3 0%, #fce7f3 100%)
    `),
  },
  {
    id: "forest",
    shape: "classy",
    category: "brand",
    name: "Forest",
    description: "Deep green, natural",
    fgColor: "#0f3d2e",
    bgColor: "#eef7f1",
    bgGradient: g(`
      radial-gradient(ellipse at 20% 0%, #d7ede0 0%, transparent 55%),
      linear-gradient(150deg, #f3faf5 0%, #dcefe4 100%)
    `),
  },
  {
    id: "sunset",
    shape: "rounded",
    category: "vibrant",
    name: "Sunset",
    description: "Warm amber glow",
    fgColor: "#4a1d05",
    bgColor: "#fff3e2",
    bgGradient: g(`
      radial-gradient(ellipse at 100% 0%, #ffd9a8 0%, transparent 55%),
      linear-gradient(135deg, #fff6ea 0%, #ffe1bd 100%)
    `),
  },
  {
    id: "ocean",
    shape: "dots",
    category: "brand",
    name: "Ocean",
    description: "Cool marine blue",
    fgColor: "#08304d",
    bgColor: "#e9f4fb",
    bgGradient: g(`
      radial-gradient(ellipse at 0% 100%, #c5e4f7 0%, transparent 55%),
      linear-gradient(135deg, #f0f8fd 0%, #d3e9f8 100%)
    `),
  },
  {
    id: "mono",
    shape: "square",
    category: "minimal",
    name: "Mono",
    description: "Pure black on white",
    fgColor: "#000000",
    bgColor: "#ffffff",
  },
  {
    id: "inverted",
    shape: "square",
    category: "dark",
    name: "Inverted",
    description: "White on black",
    fgColor: "#ffffff",
    bgColor: "#000000",
  },
  {
    id: "neon",
    shape: "dots",
    category: "vibrant",
    name: "Neon",
    description: "Electric on charcoal",
    fgColor: "#2EE59D",
    bgColor: "#0b0f0d",
    bgGradient: g(`
      radial-gradient(ellipse at 50% 0%, #123a2c 0%, transparent 60%),
      linear-gradient(160deg, #0b0f0d 0%, #05100c 100%)
    `),
  },
  {
    id: "blueprint",
    shape: "square",
    category: "brand",
    name: "Blueprint",
    description: "Draughtsman blue",
    fgColor: "#e8f1ff",
    bgColor: "#123a6b",
    bgGradient: g(`
      radial-gradient(ellipse at 0% 0%, #1c4d8a 0%, transparent 55%),
      linear-gradient(140deg, #143f75 0%, #0d2c52 100%)
    `),
  },
  {
    id: "terracotta",
    shape: "classy",
    category: "brand",
    name: "Terracotta",
    description: "Earthy clay tones",
    fgColor: "#5b2116",
    bgColor: "#fbeee7",
    bgGradient: g(`
      radial-gradient(ellipse at 100% 100%, #f2d3c4 0%, transparent 55%),
      linear-gradient(135deg, #fdf2ec 0%, #f0d5c7 100%)
    `),
  },
];

interface ThemePresetsProps {
  selectedTheme: string;
  onThemeChange: (theme: ThemePreset) => void;
}

const FILTERS: { id: "all" | ThemeCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "minimal", label: "Minimal" },
  { id: "vibrant", label: "Vibrant" },
  { id: "dark", label: "Dark" },
  { id: "brand", label: "Brand" },
];

/**
 * Zero-popup theme engine: inline filter chips above a 3.5-tile peeking
 * carousel, so the live preview is never covered while browsing.
 */
export function ThemePresets({ selectedTheme, onThemeChange }: ThemePresetsProps) {
  const [filter, setFilter] = useState<"all" | ThemeCategory>("all");
  const group = useRovingRadioGroup<HTMLDivElement>();
  const visible = useMemo(
    () => (filter === "all" ? themePresets : themePresets.filter((t) => t.category === filter)),
    [filter],
  );

  return (
    <div className="space-y-2">
      <PickerAnnouncer
        message={
          themePresets.find((t) => t.id === selectedTheme)
            ? `${themePresets.find((t) => t.id === selectedTheme)!.name} theme selected`
            : ""
        }
      />

      <div
        data-testid="theme-filters"
        className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "shrink-0 snap-start rounded-full border px-3 py-1 text-[11px] font-medium transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              filter === f.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Mobile: peeking carousel. Desktop: full grid so every theme is
          visible without horizontal scrolling. Padding + overflow-visible on
          the desktop grid keep the selection badge from being clipped. */}
      <div
        key={filter}
        role="radiogroup"
        aria-label="Theme preset"
        ref={group.ref}
        onKeyDown={group.onKeyDown}
        data-testid="theme-carousel"
        className="-mx-1 flex animate-in fade-in snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scroll-px-1 px-1 pb-2 pt-3 duration-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-4 md:gap-2.5 md:overflow-visible md:px-1.5 md:pb-1 lg:grid-cols-5"
      >
        {visible.map((theme) => {
          const selected = selectedTheme === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onThemeChange(theme)}
              title={theme.description}
              role="radio"
              aria-checked={selected}
              aria-label={theme.name}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "relative flex w-[calc(28%-0.5rem)] min-w-[74px] shrink-0 snap-start flex-col items-center gap-1 overflow-visible rounded-2xl border-2 p-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:w-full md:min-w-0",
                selected
                  ? "border-foreground bg-cream"
                  : "border-border bg-background hover:bg-cream/70",
              )}
            >
              <SelectionIndicator visible={selected} />

              <span
                className="relative w-8 h-8 rounded-full flex-shrink-0 border border-border/70 overflow-hidden flex items-center justify-center"
                style={{
                  background: theme.preview || theme.bgGradient || theme.bgColor,
                  backgroundSize: theme.preview ? "8px 8px" : undefined,
                  backgroundPosition: theme.preview ? "0 0, 0 4px, 4px -4px, -4px 0" : undefined,
                }}
              >
                {/* Mini QR in the theme's own module shape + foreground colour,
                    so every swatch reads as a real preview instead of an empty dot. */}
                <MiniQrGlyph
                  shape={theme.shape}
                  className="relative h-5 w-5"
                  style={{ color: theme.fgColor }}
                />
              </span>
              <span className="w-full text-balance text-center text-[10px] font-medium leading-tight tracking-tight text-foreground [overflow-wrap:anywhere]">
                {theme.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
