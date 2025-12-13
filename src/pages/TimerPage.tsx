import { motion, AnimatePresence } from "framer-motion";
import { useTimer } from "@/hooks/useTimer";
import { useHaptics } from "@/hooks/useHaptics";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Play, Pause, Square, Timer, Zap, Target, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TimerPage() {
  const { user, loading: authLoading } = useAuth();
  const { isRunning, isPaused, elapsed, start, pause, resume, stop } = useTimer();
  const haptics = useHaptics();

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

  // Calculate ring progress (max 60 minutes = 3600 seconds)
  const maxTime = 3600;
  const progress = Math.min((elapsed / maxTime) * 100, 100);
  const circumference = 2 * Math.PI * 140;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Format for display
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  // Format time string
  const timeDisplay = hours > 0 
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="min-h-screen pb-28 overflow-hidden">
      {/* Simple Static Background */}
      <div className="fixed inset-0 -z-10">
        <div 
          className="absolute top-20 left-1/4 w-72 h-72 rounded-full blur-[120px] opacity-20"
          style={{ background: 'hsl(var(--primary))' }}
        />
        <div 
          className="absolute bottom-40 right-1/4 w-96 h-96 rounded-full blur-[140px] opacity-15"
          style={{ background: 'hsl(var(--primary))' }}
        />
      </div>

      <div className="app-container pt-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-4 transition-all duration-300 ${
            isRunning 
              ? 'bg-primary/20 border-primary/40 shadow-lg shadow-primary/20' 
              : 'bg-primary/10 border-primary/20'
          }`}>
            <Timer className={`w-4 h-4 text-primary transition-transform duration-300 ${isRunning ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
            <span className="text-sm font-medium text-primary">Focus Timer</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Stay Focused</h1>
          <p className="text-sm text-muted-foreground">Track your productivity sessions</p>
        </motion.div>

        {/* Main Timer Display */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="relative flex items-center justify-center mb-12"
        >
          {/* SVG Progress Ring */}
          <svg width="320" height="320" className="transform -rotate-90">
            <circle
              cx="160"
              cy="160"
              r="140"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="8"
              opacity="0.3"
            />
            <circle
              cx="160"
              cy="160"
              r="140"
              fill="none"
              stroke="url(#timerGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500 ease-out"
            />
            <defs>
              <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--primary))" />
                <stop offset="100%" stopColor="hsl(var(--primary) / 0.6)" />
              </linearGradient>
            </defs>
          </svg>

          {/* Timer content inside ring */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* Status indicator */}
            <div className={`w-3 h-3 rounded-full mb-4 transition-colors duration-300 ${
              isRunning ? 'bg-green-500 shadow-lg shadow-green-500/50' : isPaused ? 'bg-amber-500' : 'bg-muted-foreground/30'
            }`} />

            {/* Time Display - Simple, no crazy animations */}
            <div className={`font-mono font-bold text-6xl transition-all duration-300 ${
              isRunning 
                ? 'text-foreground' 
                : 'text-foreground'
            }`}
              style={{
                textShadow: isRunning ? '0 0 40px hsl(var(--primary) / 0.5)' : 'none'
              }}
            >
              {timeDisplay}
            </div>

            {/* Status text */}
            <p className={`mt-4 text-sm font-medium transition-colors duration-300 ${
              isRunning ? 'text-green-500' : isPaused ? 'text-amber-500' : 'text-muted-foreground'
            }`}>
              {isRunning ? '🔥 In the zone...' : isPaused ? '⏸️ Paused' : 'Ready when you are'}
            </p>
          </div>

          {/* Glow effect when running */}
          {isRunning && (
            <div 
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: '0 0 80px hsl(var(--primary) / 0.3)',
              }}
            />
          )}
        </motion.div>

        {/* Control Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-6 mb-10"
        >
          <AnimatePresence mode="wait">
            {!isRunning && !isPaused && (
              <motion.div
                key="start"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <Button
                  onClick={() => {
                    haptics.medium();
                    start();
                  }}
                  className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/30"
                >
                  <Play className="w-8 h-8 ml-1" />
                </Button>
              </motion.div>
            )}

            {isRunning && (
              <motion.div
                key="running-controls"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="flex items-center gap-4"
              >
                <Button
                  onClick={() => {
                    haptics.light();
                    pause();
                  }}
                  className="h-20 w-20 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-500/30"
                >
                  <Pause className="w-8 h-8" />
                </Button>
                <Button
                  onClick={() => {
                    haptics.heavy();
                    stop();
                  }}
                  variant="outline"
                  className="h-16 w-16 rounded-full border-2 border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
                >
                  <Square className="w-6 h-6" />
                </Button>
              </motion.div>
            )}

            {isPaused && (
              <motion.div
                key="paused-controls"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="flex items-center gap-4"
              >
                <Button
                  onClick={() => {
                    haptics.medium();
                    resume();
                  }}
                  className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/30"
                >
                  <Play className="w-8 h-8 ml-1" />
                </Button>
                <Button
                  onClick={() => {
                    haptics.heavy();
                    stop();
                  }}
                  variant="outline"
                  className="h-16 w-16 rounded-full border-2 border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
                >
                  <Square className="w-6 h-6" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-3 gap-3"
        >
          <div className="glass rounded-2xl p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">{Math.floor(elapsed / 60)}</p>
            <p className="text-xs text-muted-foreground">Minutes</p>
          </div>
          <div className="glass rounded-2xl p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-foreground">{Math.round(progress)}%</p>
            <p className="text-xs text-muted-foreground">To 1hr</p>
          </div>
          <div className="glass rounded-2xl p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-foreground">{hours > 0 ? `${hours}h` : `${seconds}s`}</p>
            <p className="text-xs text-muted-foreground">{hours > 0 ? 'Hours' : 'Seconds'}</p>
          </div>
        </motion.div>

        {/* Motivational Text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-sm text-muted-foreground mt-8"
        >
          {isRunning ? "You're crushing it! Stay focused. 🚀" : "Every minute counts. Start now. ⚡"}
        </motion.p>
      </div>
    </div>
  );
}
