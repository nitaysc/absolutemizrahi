import { Droplets, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWaterIntake } from "@/hooks/useWaterIntake";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = [
  { label: "250ml", amount: 250 },
  { label: "500ml", amount: 500 },
  { label: "1L", amount: 1000 },
];

export function WaterIntakeWidget() {
  const {
    totalMl,
    progressPercent,
    dailyGoal,
    addIntake,
    removeLastIntake,
    isAdding,
    todayIntake,
  } = useWaterIntake();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-blue-500/20">
            <Droplets className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Water Intake</h3>
            <p className="text-xs text-muted-foreground">
              {totalMl}ml / {dailyGoal / 1000}L goal
            </p>
          </div>
        </div>

        {todayIntake.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => removeLastIntake()}
          >
            <Minus className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-3 rounded-full bg-muted/50 overflow-hidden mb-4">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-400"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Quick add buttons */}
      <div className="flex gap-2">
        {QUICK_AMOUNTS.map(({ label, amount }) => (
          <Button
            key={amount}
            variant="outline"
            size="sm"
            disabled={isAdding}
            onClick={() => addIntake(amount)}
            className={cn(
              "flex-1 border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50",
              "transition-all duration-200"
            )}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={label}
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="text-xs font-medium"
              >
                +{label}
              </motion.span>
            </AnimatePresence>
          </Button>
        ))}
      </div>

      {/* Completion message */}
      <AnimatePresence>
        {progressPercent >= 100 && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-xs text-center text-blue-400 mt-3 font-medium"
          >
            💧 Daily goal reached! Great hydration!
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
