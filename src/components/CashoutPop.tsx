import { AnimatePresence, motion } from "framer-motion";
import { formatCoins } from "@/lib/format";

type CashoutPopProps = {
  show: boolean;
  multiplier: number;
  payout: number;
};

export function CashoutPop({ show, multiplier, payout }: CashoutPopProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="pointer-events-none fixed left-1/2 top-24 z-[70] -translate-x-1/2"
        >
          <div className="rounded-xl border-2 border-[hsl(var(--success))] bg-[#101e0f]/95 px-4 py-2 text-center shadow-[0_0_28px_rgba(34,197,94,0.3)]">
            <div className="text-3xl font-black leading-none text-[hsl(var(--success))]">
              {multiplier.toFixed(2)}×
            </div>
            <div className="mt-1 text-sm font-extrabold text-[hsl(var(--success))]">
              {formatCoins(Math.max(0, payout))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
