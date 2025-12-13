import { motion, AnimatePresence } from "framer-motion";
import { Coins } from "lucide-react";

interface CoinEarnedPopupProps {
  show: boolean;
  amount: number;
  reason?: string;
  onComplete?: () => void;
}

export function CoinEarnedPopup({ show, amount, reason, onComplete }: CoinEarnedPopupProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: "spring", damping: 15 }}
          onAnimationComplete={() => {
            setTimeout(() => onComplete?.(), 1500);
          }}
          className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50"
        >
          <motion.div
            animate={{
              boxShadow: [
                "0 0 20px rgba(245, 158, 11, 0.3)",
                "0 0 40px rgba(245, 158, 11, 0.5)",
                "0 0 20px rgba(245, 158, 11, 0.3)",
              ],
            }}
            transition={{ duration: 1, repeat: Infinity }}
            className="glass rounded-2xl px-6 py-4 flex items-center gap-3 border border-amber-500/30"
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 0.5, repeat: 2 }}
              className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center"
            >
              <Coins className="w-6 h-6 text-amber-500" />
            </motion.div>
            <div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-lg font-bold text-amber-500"
              >
                +{amount} 🔥
              </motion.p>
              <p className="text-xs text-muted-foreground">
                {reason || "Focus Coins earned!"}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
