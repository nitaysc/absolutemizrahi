import { AnimatePresence, motion } from "framer-motion";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

type CashoutPopProps = {
  show: boolean;
  multiplier: number;
  payout: number;
  className?: string;
};

export function CashoutPop({ show, multiplier, payout, className }: CashoutPopProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className={cn("pointer-events-none fixed left-1/2 top-24 z-[70] -translate-x-1/2", className)}
        >
          <div className="rounded-2xl border-2 border-[hsl(var(--success))] bg-[#0f220f]/95 px-5 py-3 text-center shadow-[0_0_32px_rgba(34,197,94,0.42)]">
            <div className="text-4xl font-black leading-none text-[hsl(var(--success))] drop-shadow-[0_0_12px_rgba(34,197,94,0.65)]">
              {multiplier.toFixed(2)}×
            </div>
            <div className="mt-1.5 flex items-center justify-center gap-1.5 text-base font-extrabold text-[hsl(var(--success))]">
              <span>{formatCoins(Math.max(0, payout))}</span>
              <MizrahiCoin size={14} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
