import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Loader2, Trophy, Flame, Zap } from "lucide-react";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { RankBadge } from "@/components/RankBadge";
import { getRankFromXP } from "@/lib/ranks";
import { cn } from "@/lib/utils";

export default function Leaderboard() {
  const { user, loading: authLoading } = useAuth();
  const { leaderboard, loading } = useLeaderboard();

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const topThree = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  const userRank = leaderboard.findIndex(e => e.id === user.id) + 1;

  return (
    <div className="min-h-screen pb-28">
      <div className="app-container pt-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-foreground mb-1">Leaderboard</h1>
          <p className="text-muted-foreground text-sm">Compete with the best</p>
        </motion.div>

        {/* Top 3 Podium */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex justify-center items-end gap-2 mb-6"
        >
          {/* 2nd Place */}
          {topThree[1] && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className={cn(
                "glass rounded-xl p-3 text-center w-24",
                topThree[1].id === user.id && "ring-2 ring-primary"
              )}
            >
              <div className="text-2xl mb-1">🥈</div>
              <RankBadge xp={topThree[1].total_xp} size="sm" showName={false} className="justify-center mb-1" />
              <p className="text-sm font-medium text-foreground truncate">
                {topThree[1].display_name || 'Anonymous'}
              </p>
              <p className="text-xs text-muted-foreground">{topThree[1].total_xp} XP</p>
            </motion.div>
          )}

          {/* 1st Place */}
          {topThree[0] && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className={cn(
                "glass rounded-xl p-4 text-center w-28 -mt-4",
                topThree[0].id === user.id && "ring-2 ring-primary"
              )}
            >
              <motion.div 
                className="text-3xl mb-1"
                animate={{ rotate: [0, -10, 10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
              >
                👑
              </motion.div>
              <RankBadge xp={topThree[0].total_xp} size="sm" showName={false} className="justify-center mb-1" />
              <p className="text-sm font-medium text-foreground truncate">
                {topThree[0].display_name || 'Anonymous'}
              </p>
              <p className="text-xs text-muted-foreground">{topThree[0].total_xp} XP</p>
            </motion.div>
          )}

          {/* 3rd Place */}
          {topThree[2] && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={cn(
                "glass rounded-xl p-3 text-center w-24",
                topThree[2].id === user.id && "ring-2 ring-primary"
              )}
            >
              <div className="text-2xl mb-1">🥉</div>
              <RankBadge xp={topThree[2].total_xp} size="sm" showName={false} className="justify-center mb-1" />
              <p className="text-sm font-medium text-foreground truncate">
                {topThree[2].display_name || 'Anonymous'}
              </p>
              <p className="text-xs text-muted-foreground">{topThree[2].total_xp} XP</p>
            </motion.div>
          )}
        </motion.div>

        {/* Your position */}
        {userRank > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl p-4 mb-4 ring-2 ring-primary"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">#{userRank}</span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Your Position</p>
                <p className="text-xs text-muted-foreground">Keep grinding to climb higher!</p>
              </div>
              <Trophy className="w-5 h-5 text-primary" />
            </div>
          </motion.div>
        )}

        {/* Rest of leaderboard */}
        <div className="space-y-2">
          {rest.map((entry, index) => {
            const rank = getRankFromXP(entry.total_xp);
            const position = index + 4;
            const isCurrentUser = entry.id === user.id;
            
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "glass rounded-xl p-3 flex items-center gap-3",
                  isCurrentUser && "ring-2 ring-primary"
                )}
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-sm font-medium text-muted-foreground">#{position}</span>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{rank.icon}</span>
                    <p className="font-medium text-foreground truncate">
                      {entry.display_name || 'Anonymous'}
                      {isCurrentUser && <span className="text-primary ml-1">(You)</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Flame className="w-4 h-4 text-orange-500" />
                    <span>{entry.current_streak}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="font-medium text-foreground">{entry.total_xp}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {leaderboard.length === 0 && (
          <div className="glass rounded-xl p-8 text-center">
            <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No warriors yet</p>
            <p className="text-sm text-muted-foreground">Be the first to log a workout!</p>
          </div>
        )}
      </div>
    </div>
  );
}
