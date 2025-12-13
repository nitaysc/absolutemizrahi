import { motion } from "framer-motion";
import { Flame, Coins } from "lucide-react";

interface ShopHeaderProps {
  coins: number;
  streak: number;
}

export function ShopHeader({ coins, streak }: ShopHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
          Focus Shop
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Unlock rewards for your consistency
        </p>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-xl p-4 flex items-center justify-around"
      >
        {/* Coins */}
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Coins className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Focus Coins</p>
            <p className="text-lg font-bold text-amber-500">{coins.toLocaleString()} 🔥</p>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-10 bg-border" />

        {/* Streak */}
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Flame className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current Streak</p>
            <p className="text-lg font-bold text-primary">{streak} days</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
