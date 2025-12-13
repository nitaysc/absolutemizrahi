import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DailyHeader } from "@/components/daily-header";
import { DailyIdentity } from "@/components/DailyIdentity";
import { TaskCard, TaskCategory } from "@/components/task-card";
import { TimerWidget } from "@/components/TimerWidget";
import { Button } from "@/components/ui/button";
import { RefreshCw, PartyPopper, Loader2, Lock } from "lucide-react";
import { useDailyPlan } from "@/hooks/useDailyPlan";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useHaptics } from "@/hooks/useHaptics";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

export default function Today() {
  const { user, loading: authLoading } = useAuth();
  const { plan, loading, streak, toggleTask, rerollPlan, completeDay, refetch } = useDailyPlan();
  const { profile } = useUserProfile();
  const haptics = useHaptics();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute for greeting changes
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

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

  const completedCount = plan?.items.filter(i => i.is_done).length ?? 0;
  const totalCount = plan?.items.length ?? 0;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allComplete = completedCount === totalCount && totalCount > 0;
  const rerollsLeft = 1 - (plan?.rerolls_used ?? 0);

  // Check task completion for urgency messaging
  const remainingTasks = totalCount - completedCount;
  const hasProductiveTask = plan?.items.some(i => i.category === 'productive' && i.is_done);
  const restTasks = plan?.items.filter(i => i.category === 'rest') ?? [];
  const canUnlockRest = hasProductiveTask || completedCount >= Math.ceil(totalCount * 0.5);

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

        {/* Timer Widget */}
        <TimerWidget />

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
              const isLocked = isRestTask && !canUnlockRest && !item.is_done;
              
              return (
                <div key={item.id} className="relative">
                  {isLocked && (
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
                    onToggle={isLocked ? () => {} : toggleTask}
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
                onClick={() => {
                  haptics.success();
                  completeDay();
                }}
              >
                <PartyPopper className="w-5 h-5 mr-2" />
                Complete Day! 🎉
              </Button>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
