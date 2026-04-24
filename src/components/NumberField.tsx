import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Allow decimals (e.g. 1.05 for Limbo target). */
  decimal?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

/** Number input with a local string buffer so users can clear, retype,
 *  or paste freely without the field snapping back to min on every key. */
export function NumberField({
  value,
  onChange,
  min = 0,
  max,
  step,
  decimal,
  disabled,
  className,
  placeholder,
}: Props) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(raw: string) {
    let n = decimal ? Number(raw) : Math.floor(Number(raw));
    if (!Number.isFinite(n)) n = min;
    if (typeof min === "number" && n < min) n = min;
    if (typeof max === "number" && n > max) n = max;
    onChange(n);
    setText(String(n));
  }

  return (
    <Input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        const allowed = decimal ? /[^0-9.]/g : /[^0-9]/g;
        const v = e.target.value.replace(allowed, "");
        setText(v);
        const n = Number(v);
        if (v !== "" && v !== "." && Number.isFinite(n)) {
          if (typeof max === "number" && n > max) return;
          if (typeof min === "number" && n < min) return;
          onChange(n);
        }
      }}
      onBlur={(e) => commit(e.target.value)}
      className={cn("text-lg font-bold tabular-nums", className)}
    />
  );
}