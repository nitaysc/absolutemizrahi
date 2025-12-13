import { motion, AnimatePresence, Easing } from "framer-motion";
import { useState } from "react";
import { useTimer } from "@/hooks/useTimer";
import { useHaptics } from "@/hooks/useHaptics";
import { Play, Pause, Square, Timer, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const easeInOut: Easing = "easeInOut";

export function TimerWidget() {
  const { isRunning, isPaused, elapsed, formattedTime, start, pause, resume, stop } = useTimer();
  const [isExpanded, setIsExpanded] = useState(false);
  const haptics = useHaptics();

  const hasActiveTimer = isRunning || isPaused || elapsed > 0;

  // Pulsing animation for running timer
  const pulseVariants = {
    running: {
      scale: [1, 1.02, 1],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: easeInOut,
      },
    },
    paused: {
      scale: 1,
      opacity: [1, 0.7, 1],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: easeInOut,
      },
    },
    stopped: {
      scale: 1,
    },
  };

  const getAnimationState = () => {
    if (isRunning) return "running";
    if (isPaused) return "paused";
    return "stopped";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass rounded-2xl overflow-hidden mb-4"
    >
      {/* Header - always visible */}
      <motion.button
        onClick={() => {
          haptics.selection();
          setIsExpanded(!isExpanded);
        }}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isRunning 
                ? "bg-primary/20" 
                : isPaused 
                  ? "bg-amber-500/20" 
                  : "bg-muted/50"
            }`}
            variants={pulseVariants}
            animate={getAnimationState()}
          >
            <Timer className={`w-5 h-5 ${
              isRunning 
                ? "text-primary" 
                : isPaused 
                  ? "text-amber-500" 
                  : "text-muted-foreground"
            }`} />
          </motion.div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">
              {hasActiveTimer ? "Timer Active" : "Start Timer"}
            </p>
            {hasActiveTimer && (
              <motion.p 
                className={`text-xs ${isPaused ? "text-amber-500" : "text-muted-foreground"}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {isPaused ? "Paused" : "Running"}
              </motion.p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasActiveTimer && (
            <motion.span
              className="font-mono text-xl font-bold text-foreground"
              key={formattedTime}
              initial={{ scale: 1.1, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.1 }}
            >
              {formattedTime}
            </motion.span>
          )}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          </motion.div>
        </div>
      </motion.button>

      {/* Expanded controls */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-border/50">
              {/* Large timer display */}
              <motion.div
                className="text-center py-6"
                variants={pulseVariants}
                animate={getAnimationState()}
              >
                <motion.span
                  className={`font-mono text-5xl font-bold ${
                    isRunning 
                      ? "text-primary" 
                      : isPaused 
                        ? "text-amber-500" 
                        : "text-foreground"
                  }`}
                  key={formattedTime}
                  initial={{ scale: 1.05 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.1 }}
                >
                  {formattedTime}
                </motion.span>
                <p className="text-sm text-muted-foreground mt-2">
                  {isRunning 
                    ? "Timer is running..." 
                    : isPaused 
                      ? "Timer paused" 
                      : "Ready to start"}
                </p>
              </motion.div>

              {/* Control buttons */}
              <div className="flex items-center justify-center gap-4">
                {!isRunning && !isPaused && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <Button
                      onClick={() => {
                        haptics.medium();
                        start();
                      }}
                      size="lg"
                      className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90"
                    >
                      <Play className="w-6 h-6 ml-0.5" />
                    </Button>
                  </motion.div>
                )}

                {isRunning && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <Button
                      onClick={() => {
                        haptics.light();
                        pause();
                      }}
                      size="lg"
                      className="h-14 w-14 rounded-full bg-amber-500 hover:bg-amber-500/90"
                    >
                      <Pause className="w-6 h-6" />
                    </Button>
                  </motion.div>
                )}

                {isPaused && (
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    >
                      <Button
                        onClick={() => {
                          haptics.medium();
                          resume();
                        }}
                        size="lg"
                        className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90"
                      >
                        <Play className="w-6 h-6 ml-0.5" />
                      </Button>
                    </motion.div>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.1 }}
                    >
                      <Button
                        onClick={() => {
                          haptics.heavy();
                          stop();
                        }}
                        size="lg"
                        variant="outline"
                        className="h-14 w-14 rounded-full border-destructive text-destructive hover:bg-destructive/10"
                      >
                        <Square className="w-5 h-5" />
                      </Button>
                    </motion.div>
                  </>
                )}

                {isRunning && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.1 }}
                  >
                    <Button
                      onClick={() => {
                        haptics.heavy();
                        stop();
                      }}
                      size="lg"
                      variant="outline"
                      className="h-14 w-14 rounded-full border-destructive text-destructive hover:bg-destructive/10"
                    >
                      <Square className="w-5 h-5" />
                    </Button>
                  </motion.div>
                )}
              </div>

              {/* Hint text */}
              <motion.p 
                className="text-xs text-center text-muted-foreground mt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                Timer saves automatically if you leave
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
