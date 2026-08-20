import { SelectedOptionCard } from "@/components/SelectionIndicator";

export type QRFormat = "png" | "svg" | "jpeg";

const formats: { id: QRFormat; label: string; hint: string }[] = [
  { id: "png", label: "PNG", hint: "Best all-around" },
  { id: "svg", label: "SVG", hint: "Vector — print-ready" },
  { id: "jpeg", label: "JPG", hint: "Smaller, no transparency" },
];

interface FormatSelectorProps {
  value: QRFormat;
  onChange: (value: QRFormat) => void;
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {formats.map((f) => (
        <SelectedOptionCard
          key={f.id}
          isSelected={value === f.id}
          onSelect={() => onChange(f.id)}
          title={f.hint}
          className="rounded-2xl px-4 py-3 text-sm font-medium"
        >
          {f.label}
        </SelectedOptionCard>
      ))}
    </div>
  );
}
