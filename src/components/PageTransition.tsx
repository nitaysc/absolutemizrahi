import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { ReactNode } from "react";

/**
 * Wraps a route's content in a smooth fade + lift transition.
 * Keyed by pathname so each navigation re-runs the animation.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}