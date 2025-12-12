import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DailyHeader } from "@/components/daily-header";
import { TaskCard, TaskCategory } from "@/components/task-card";
import { TimerWidget } from "@/components/TimerWidget";
import { Button } from "@/components/ui/button";
import { RefreshCw, PartyPopper, Loader2 } from "lucide-react";
import { useDailyPlan } from "@/hooks/useDailyPlan";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

export default function Today() {
  const { user, loading: authLoading } = useAuth();
  const { plan, loading, streak, toggleTask, rerollPlan, completeDay, refetch } = useDailyPlan();
  const { profile } = useUserProfile();
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

  return (
    <div className="min-h-screen pb-28">
      <div className="app-container pt-2">
        <DailyHeader 
          streak={streak} 
          progress={progress}
          date={currentTime}
          displayName={profile?.display_name}
        />

        {/* Timer Widget */}
        <TimerWidget />

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
            onClick={rerollPlan}
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
            {plan?.items.map((item, index) => (
              <TaskCard
                key={item.id}
                id={item.id}
                title={item.title}
                description={item.description ?? ""}
                category={item.category as TaskCategory}
                duration={item.duration_min ?? undefined}
                isCompleted={item.is_done}
                onToggle={toggleTask}
                index={index}
              />
            ))}
          </div>
        )}

        {/* Complete Day Button */}
        {allComplete && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6"
          >
            <Button 
              className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              onClick={completeDay}
            >
              <PartyPopper className="w-5 h-5 mr-2" />
              Complete Day!
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
