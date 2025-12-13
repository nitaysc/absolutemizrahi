import { useCallback } from "react";

type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";

const vibrationPatterns: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 30],
  warning: [30, 50, 30],
  error: [50, 100, 50, 100, 50],
  selection: 5,
};

export function useHaptics() {
  const vibrate = useCallback((style: HapticStyle = "medium") => {
    // Check if vibration API is supported
    if (!("vibrate" in navigator)) {
      return false;
    }

    try {
      const pattern = vibrationPatterns[style];
      navigator.vibrate(pattern);
      return true;
    } catch (e) {
      console.warn("Haptic feedback failed:", e);
      return false;
    }
  }, []);

  const light = useCallback(() => vibrate("light"), [vibrate]);
  const medium = useCallback(() => vibrate("medium"), [vibrate]);
  const heavy = useCallback(() => vibrate("heavy"), [vibrate]);
  const success = useCallback(() => vibrate("success"), [vibrate]);
  const warning = useCallback(() => vibrate("warning"), [vibrate]);
  const error = useCallback(() => vibrate("error"), [vibrate]);
  const selection = useCallback(() => vibrate("selection"), [vibrate]);

  return {
    vibrate,
    light,
    medium,
    heavy,
    success,
    warning,
    error,
    selection,
  };
}

// Standalone function for use outside React components
export function hapticFeedback(style: HapticStyle = "medium") {
  if (!("vibrate" in navigator)) {
    return false;
  }

  try {
    const pattern = vibrationPatterns[style];
    navigator.vibrate(pattern);
    return true;
  } catch (e) {
    console.warn("Haptic feedback failed:", e);
    return false;
  }
}
