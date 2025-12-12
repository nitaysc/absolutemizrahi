import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useUserProfile, UserProfile } from "@/hooks/useUserProfile";
import { EditPreferencesSheet } from "@/components/profile/EditPreferencesSheet";
import { DataManagementSheet } from "@/components/profile/DataManagement";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { 
  User, 
  Settings, 
  Dumbbell, 
  BookOpen, 
  Clock, 
  Bell, 
  Moon, 
  Download,
  ChevronRight,
  LogOut,
  Loader2,
  Pencil
} from "lucide-react";
import { toast } from "sonner";

const workoutLabels: Record<string, string> = {
  gym: "Gym Only",
  calisthenics: "Calisthenics",
  mixed: "Mixed (Gym + Calisthenics)",
};

const timeLabels: Record<string, string> = {
  short: "30 min - 1 hour",
  medium: "1 - 2 hours",
  long: "2+ hours",
};

export default function Profile() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { profile, loading: profileLoading, updateProfile } = useUserProfile();
  const navigate = useNavigate();
  
  const [editOpen, setEditOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    // Check if notifications are supported and enabled
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleNotificationToggle = async () => {
    if (!('Notification' in window)) {
      toast.error('Notifications not supported on this device');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(false);
      toast.info('Notifications disabled');
    } else if (Notification.permission === 'denied') {
      toast.error('Notifications blocked. Enable in browser settings.');
    } else {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        toast.success('Notifications enabled');
      }
    }
  };

  const preferences = [
    { 
      label: "Workout Style", 
      value: workoutLabels[profile?.workout_style || 'mixed'] || 'Mixed', 
      icon: Dumbbell 
    },
    { 
      label: "Study Focus", 
      value: profile?.study_focus?.join(', ') || 'Not set', 
      icon: BookOpen 
    },
    { 
      label: "Daily Time", 
      value: timeLabels[profile?.daily_time || 'medium'] || '1-2 hours', 
      icon: Clock 
    },
  ];

  return (
    <div className="min-h-screen pb-28">
      <div className="app-container pt-2">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-foreground mb-2">Profile</h1>
          <p className="text-muted-foreground">Manage your preferences</p>
        </motion.div>

        {/* User Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6 mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-8 h-8 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-foreground truncate">
                {profile?.display_name || 'Set your name'}
              </h2>
              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setEditOpen(true)}
              className="shrink-0"
            >
              <Pencil className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>

        {/* Preferences */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Preferences</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </div>
          
          <div className="space-y-3">
            {preferences.map((pref, index) => (
              <motion.div
                key={pref.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/30"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <pref.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">{pref.label}</p>
                  <p className="text-foreground font-medium truncate">{pref.value}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-2xl p-6 mb-6"
        >
          <div className="space-y-1">
            {/* Notifications */}
            <div className="flex items-center gap-3 p-3 rounded-xl">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 text-foreground">Notifications</span>
              <Switch 
                checked={notificationsEnabled} 
                onCheckedChange={handleNotificationToggle}
              />
            </div>

            {/* Dark Mode */}
            <div className="flex items-center gap-3 p-3 rounded-xl">
              <Moon className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 text-foreground">Dark Mode</span>
              <Switch 
                checked={theme === 'dark'} 
                onCheckedChange={toggleTheme}
              />
            </div>

            {/* Data Management */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setDataOpen(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors"
            >
              <Download className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 text-left text-foreground">Export / Import Data</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </motion.button>
          </div>
        </motion.div>

        {/* Logout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Button 
            variant="ghost" 
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleSignOut}
          >
            <LogOut className="w-5 h-5 mr-2" />
            Sign Out
          </Button>
        </motion.div>
      </div>

      <EditPreferencesSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={profile}
        onSave={async (updates: Partial<UserProfile>) => {
          const result = await updateProfile(updates);
          // Delete today's plan so it regenerates with new preferences
          if (!result.error && user) {
            const today = new Date().toISOString().split('T')[0];
            await supabase
              .from('daily_plans')
              .delete()
              .eq('user_id', user.id)
              .eq('plan_date', today);
          }
          return result;
        }}
      />

      <DataManagementSheet
        open={dataOpen}
        onOpenChange={setDataOpen}
      />
    </div>
  );
}
