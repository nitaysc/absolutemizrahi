import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  size?: number;
}

/** Stylized "M" coin badge representing Mizrahi Coins. */
export function MizrahiCoin({ className, size = 20 }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-black text-background shadow-[0_0_12px_hsl(var(--primary)/0.6)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 30% 30%, hsl(45 100% 70%), hsl(35 100% 50%) 60%, hsl(25 95% 40%))",
        fontSize: size * 0.6,
        lineHeight: 1,
      }}
      aria-hidden
    >
      M
    </span>
  );
}