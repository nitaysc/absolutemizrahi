import { useState, useEffect, useCallback, useRef } from "react";

const TIMER_STORAGE_KEY = "daily-planner-timer";

interface TimerState {
  isRunning: boolean;
  startTime: number | null;
  elapsed: number;
  isPaused: boolean;
}

export function useTimer() {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved timer state on mount
  useEffect(() => {
    const saved = localStorage.getItem(TIMER_STORAGE_KEY);
    if (saved) {
      try {
        const state: TimerState = JSON.parse(saved);
        if (state.isRunning && state.startTime && !state.isPaused) {
          // Timer was running when user left - calculate elapsed time in seconds
          const now = Date.now();
          const secondsSinceStart = Math.floor((now - state.startTime) / 1000);
          const totalElapsed = state.elapsed + secondsSinceStart;
          setElapsed(totalElapsed);
          setStartTime(now);
          setIsRunning(true);
          setIsPaused(false);
        } else if (state.isPaused) {
          // Timer was paused - restore elapsed seconds
          setElapsed(state.elapsed);
          setIsRunning(false);
          setIsPaused(true);
        }
      } catch (e) {
        console.error("Failed to restore timer state:", e);
        localStorage.removeItem(TIMER_STORAGE_KEY);
      }
    }
  }, []);

  // Save timer state whenever it changes
  useEffect(() => {
    const state: TimerState = {
      isRunning,
      startTime,
      elapsed,
      isPaused,
    };
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
  }, [isRunning, startTime, elapsed, isPaused]);

  // Timer tick - increment by 1 second
  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        setElapsed(prev => prev + 1); // Increment by 1 second
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, isPaused]);

  const start = useCallback(() => {
    setStartTime(Date.now());
    setIsRunning(true);
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
    setIsRunning(false);
  }, []);

  const resume = useCallback(() => {
    setStartTime(Date.now());
    setIsRunning(true);
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setElapsed(0);
    setStartTime(null);
    localStorage.removeItem(TIMER_STORAGE_KEY);
  }, []);

  // Format time - elapsed is now in seconds
  const formatTime = useCallback((totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }, []);

  return {
    isRunning,
    isPaused,
    elapsed,
    formattedTime: formatTime(elapsed),
    start,
    pause,
    resume,
    stop,
  };
}
