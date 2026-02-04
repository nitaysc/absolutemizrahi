import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Loader2, LogOut, User, Zap, Flame, Trophy, Moon, Sun, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserProfile } from "@/hooks/useUserProfile";
import { RankBadge } from "@/components/RankBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { getProgressToNextRank, RANKS } from "@/lib/ranks";
import { useTheme } from "@/contexts/ThemeContext";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function Profile() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading, updateProfile } = useUserProfile();
  const { theme, toggleTheme } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');

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

  const rankProgress = profile ? getProgressToNextRank(profile.total_xp) : null;

  const handleSaveName = async () => {
    if (displayName.trim()) {
      await updateProfile({ display_name: displayName.trim() });
    }
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen pb-28">
      <div className="app-container pt-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-foreground mb-1">Profile</h1>
          <p className="text-muted-foreground text-sm">Your fitness journey</p>
        </motion.div>

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-2xl p-5 mb-4"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-8 h-8 text-primary" />
            </div>
            <div className="flex-1">
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="h-9"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaveName}>Save</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-foreground">
                    {profile?.display_name || 'Warrior'}
                  </h2>
                  <button
                    onClick={() => {
                      setDisplayName(profile?.display_name || '');
                      setIsEditing(true);
                    }}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>
          </div>

          {profile && <RankBadge xp={profile.total_xp} size="lg" className="mb-4" />}

          {rankProgress && rankProgress.next && (
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Progress to {rankProgress.next.name}</span>
                <span className="text-foreground font-medium">{rankProgress.xpNeeded} XP left</span>
              </div>
              <ProgressBar progress={rankProgress.progress} />
            </div>
          )}
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3 mb-4"
        >
          <div className="glass rounded-xl p-4 text-center">
            <Zap className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{profile?.total_xp ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total XP</p>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <Flame className="w-6 h-6 text-orange-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{profile?.current_streak ?? 0}</p>
            <p className="text-xs text-muted-foreground">Current Streak</p>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{profile?.longest_streak ?? 0}</p>
            <p className="text-xs text-muted-foreground">Best Streak</p>
          </div>
        </motion.div>

        {/* Rank tiers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-5 mb-4"
        >
          <h3 className="font-semibold text-foreground mb-4">Rank Tiers</h3>
          <div className="space-y-2">
            {RANKS.map((rank) => {
              const isCurrentRank = rankProgress?.current.name === rank.name;
              const isAchieved = (profile?.total_xp ?? 0) >= rank.minXP;
              
              return (
                <div 
                  key={rank.name}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg transition-colors",
                    isCurrentRank && "bg-primary/10 ring-1 ring-primary",
                    !isAchieved && "opacity-50"
                  )}
                >
                  <span className="text-xl">{rank.icon}</span>
                  <div className="flex-1">
                    <p className={cn("font-medium", rank.color)}>{rank.name}</p>
                    <p className="text-xs text-muted-foreground">{rank.minXP} XP</p>
                  </div>
                  {isAchieved && (
                    <span className="text-green-500 text-sm">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Theme toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-2xl p-5 mb-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Sun className="w-5 h-5 text-yellow-500" />
              )}
              <div>
                <p className="font-medium text-foreground">Theme</p>
                <p className="text-sm text-muted-foreground">
                  {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </Button>
          </div>
        </motion.div>

        {/* Sign out */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Button
            variant="outline"
            className="w-full"
            onClick={signOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
