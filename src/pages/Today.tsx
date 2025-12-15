import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DailyHeader } from "@/components/daily-header";
import { DailyIdentity } from "@/components/DailyIdentity";
import { TaskCard, TaskCategory } from "@/components/task-card";
import { CoinEarnedPopup } from "@/components/shop/CoinEarnedPopup";
import { WaterIntakeWidget } from "@/components/WaterIntakeWidget";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { RefreshCw, PartyPopper, Loader2, Lock } from "lucide-react";
import { useDailyPlan } from "@/hooks/useDailyPlan";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useHaptics } from "@/hooks/useHaptics";
import { useCoins } from "@/hooks/useCoins";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { LockBreakAnimation } from "@/components/ui/lock-break-animation";

export default function Today() {
  const { user, loading: authLoading } = useAuth();
  const { plan, loading, streak, toggleTask, rerollPlan, completeDay, refetch } = useDailyPlan();
  const { profile } = useUserProfile();
  const { awardTaskComplete, awardDailyBonus, awardStreakBonus, COIN_REWARDS } = useCoins();
  const haptics = useHaptics();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showLock, setShowLock] = useState(true);
  const prevCanUnlockRef = useRef<boolean | null>(null);
  
  // Coin popup state
  const [showCoinPopup, setShowCoinPopup] = useState(false);
  const [coinAmount, setCoinAmount] = useState(0);
  const [coinReason, setCoinReason] = useState("");
  
  // Track which tasks have been rewarded to prevent exploit (persisted per user/day)
  const rewardedTasksRef = useRef<Set<string>>(new Set());
  const todayKey = new Date().toISOString().split("T")[0];
  const storageKey = user ? `rewardedTasks:${user.id}:${todayKey}` : null;
  const dayBonusKey = user ? `dayBonusAwarded:${user.id}:${todayKey}` : null;
  const dayBonusAwardedRef = useRef<boolean>(false);

  // Compute values needed for hooks (before any conditional returns)
  const completedCount = plan?.items.filter(i => i.is_done).length ?? 0;
  const totalCount = plan?.items.length ?? 0;
  const hasProductiveTask = plan?.items.some(i => i.category === 'productive' && i.is_done);
  const canUnlockRest = hasProductiveTask || completedCount >= Math.ceil(totalCount * 0.5);

  // Load rewarded tasks and day bonus status from localStorage
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        rewardedTasksRef.current = new Set(ids);
      }
    } catch (e) {
      console.error("Failed to load rewarded tasks", e);
    }
    // Load day bonus status
    if (dayBonusKey) {
      dayBonusAwardedRef.current = localStorage.getItem(dayBonusKey) === 'true';
    }
  }, [storageKey, dayBonusKey]);

  // Helper to mark a task as rewarded and persist it
  const markTaskRewarded = (taskId: string) => {
    rewardedTasksRef.current.add(taskId);
    if (!storageKey) return;
    try {
      const ids = Array.from(rewardedTasksRef.current);
      localStorage.setItem(storageKey, JSON.stringify(ids));
    } catch (e) {
      console.error("Failed to save rewarded tasks", e);
    }
  };

  // Initialize rewarded tasks with already-completed tasks on load (e.g. from other devices)
  useEffect(() => {
    if (plan?.items) {
      plan.items.forEach(item => {
        if (item.is_done && !rewardedTasksRef.current.has(item.id)) {
          markTaskRewarded(item.id);
        }
      });
    }
  }, [plan?.id]); // Only run when plan changes (new day or reroll)

  // Update time every minute for greeting changes
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Detect when rest tasks become unlocked and trigger animation
  useEffect(() => {
    if (prevCanUnlockRef.current === false && canUnlockRest === true) {
      setIsUnlocking(true);
    }
    prevCanUnlockRef.current = canUnlockRest;
  }, [canUnlockRest]);

  // Reset lock visibility when canUnlockRest changes to false (e.g., user unchecks productive task)
  useEffect(() => {
    if (!canUnlockRest) {
      setShowLock(true);
      setIsUnlocking(false);
    }
  }, [canUnlockRest]);

  const handleUnlockComplete = () => {
    setIsUnlocking(false);
    setShowLock(false);
  };

  // Early returns AFTER all hooks
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Derived values for rendering
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allComplete = completedCount === totalCount && totalCount > 0;
  const rerollsLeft = 5 - (plan?.rerolls_used ?? 0);
  const remainingTasks = totalCount - completedCount;

  // Urgency message based on progress
  const getUrgencyMessage = () => {
    if (allComplete) return null;
    if (remainingTasks === 1) return "1 task left → finish strong! 💪";
    if (remainingTasks === 2) return `${remainingTasks} tasks left → you're almost there! 🔥`;
    if (completedCount === 0) return "Start with one task. Just one. 👊";
    if (progress < 50) return `${remainingTasks} tasks to go → keep pushing! ⚡`;
    return `${remainingTasks} left → unlock rest time! 🎯`;
  };

  const urgencyMessage = getUrgencyMessage();

  return (
    <div className="min-h-screen pb-28">
      <div className="app-container pt-2">
        <DailyHeader 
          streak={streak} 
          progress={progress}
          date={currentTime}
          displayName={profile?.display_name}
        />

        {/* Daily Identity */}
        <DailyIdentity date={currentTime} />

        {/* Water Intake Widget */}
        <div className="mb-4">
          <WaterIntakeWidget />
        </div>

        {/* Urgency Message */}
        <AnimatePresence mode="wait">
          {urgencyMessage && (
            <motion.div
              key={urgencyMessage}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="glass rounded-xl p-3 mb-4 text-center"
            >
              <p className="text-sm font-medium text-foreground">{urgencyMessage}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reroll Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex justify-end mb-4"
        >
          <div className="flex flex-col items-end gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                haptics.medium();
                rerollPlan();
              }}
              disabled={rerollsLeft <= 0 || loading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reroll ({rerollsLeft} left)
            </Button>
            <span className="text-[10px] text-muted-foreground/70 pr-2">5 rerolls per day</span>
          </div>
        </motion.div>

        {/* Tasks */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {plan?.items.map((item, index) => {
              const isRestTask = item.category === 'rest';
              // Show lock if rest task is not unlocked and not completed - ignore showLock state during animation interruption
              const isLocked = isRestTask && !canUnlockRest && !item.is_done;
              const shouldShowBreakAnimation = isRestTask && isUnlocking && canUnlockRest;
              
              return (
                <div key={item.id} className="relative">
                  {/* Lock break animation */}
                  {shouldShowBreakAnimation && (
                    <LockBreakAnimation 
                      isUnlocking={isUnlocking} 
                      onComplete={handleUnlockComplete}
                    />
                  )}
                  
                  {/* Static lock overlay */}
                  {isLocked && !isUnlocking && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-background/60 backdrop-blur-[2px] rounded-xl z-10 flex items-center justify-center"
                    >
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Lock className="w-4 h-4" />
                        <span className="text-sm">Complete 1 productive task first</span>
                      </div>
                    </motion.div>
                  )}
                  <TaskCard
                    id={item.id}
                    title={item.title}
                    description={item.description ?? ""}
                    category={item.category as TaskCategory}
                    duration={item.duration_min ?? undefined}
                    isCompleted={item.is_done}
                    onToggle={isLocked ? async () => {} : async (id) => {
                      // Check if this task has ever been rewarded today (persists via localStorage)
                      const alreadyRewarded = rewardedTasksRef.current.has(id);

                      // Toggle task completion in backend/state
                      const isNowCompleted = await toggleTask(id);

                      // Only proceed if task ended up completed
                      if (!isNowCompleted) {
                        return;
                      }

                      // Only award once per task per day, even if user unchecks/rechecks later
                      if (!alreadyRewarded) {
                        markTaskRewarded(id);
                        awardTaskComplete();
                        setCoinAmount(COIN_REWARDS.task_complete);
                        setCoinReason("Task completed!");
                        setShowCoinPopup(true);
                      }
                    }}
                    index={index}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Complete Day Button */}
        {allComplete && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
            }}
            className="mt-6"
          >
            <motion.div
              animate={{ 
                boxShadow: [
                  '0 0 20px hsl(var(--primary) / 0.3)',
                  '0 0 40px hsl(var(--primary) / 0.5)',
                  '0 0 20px hsl(var(--primary) / 0.3)'
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="rounded-xl"
            >
              <Button 
                className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                onClick={async () => {
                  // Prevent double-awarding day bonus
                  if (dayBonusAwardedRef.current) {
                    haptics.light();
                    return;
                  }
                  
                  haptics.success();
                  const newStreak = await completeDay();
                  if (newStreak !== null) {
                    // Mark day bonus as awarded and persist
                    dayBonusAwardedRef.current = true;
                    if (dayBonusKey) {
                      localStorage.setItem(dayBonusKey, 'true');
                    }
                    
                    // Award daily bonus
                    awardDailyBonus();
                    let totalBonus = COIN_REWARDS.daily_bonus;
                    
                    // Check for streak milestones
                    const streakBonus = awardStreakBonus(newStreak);
                    if (streakBonus > 0) {
                      totalBonus += streakBonus;
                    }
                    
                    setCoinAmount(totalBonus);
                    setCoinReason(streakBonus > 0 ? `Day complete + ${newStreak}-day streak bonus!` : "Day completed!");
                    setShowCoinPopup(true);
                  }
                }}
              >
                <PartyPopper className="w-5 h-5 mr-2" />
                Complete Day! 🎉
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* Coin Earned Popup */}
        <CoinEarnedPopup
          show={showCoinPopup}
          amount={coinAmount}
          reason={coinReason}
          onComplete={() => setShowCoinPopup(false)}
        />
      </div>
    </div>
  );
}
