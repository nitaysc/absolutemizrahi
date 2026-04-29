import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ButtonHTMLAttributes, forwardRef, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Strength of magnetic pull in px (default 12) */
  strength?: number;
  /** Add a subtle shimmer sweep on hover */
  shimmer?: boolean;
};

/**
 * Premium button that gently follows the cursor on hover and releases on leave.
 * Falls back gracefully on touch (no movement, just tap).
 */
export const MagneticButton = forwardRef<HTMLButtonElement, Props>(function MagneticButton(
  { className, children, strength = 12, shimmer = true, onMouseMove, onMouseLeave, ...rest },
  ref,
) {
  const localRef = useRef<HTMLButtonElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });
  const rx = useTransform(sy, (v) => v * -0.4);
  const ry = useTransform(sx, (v) => v * 0.4);

  return (
    <motion.button
      ref={(node) => {
        localRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
      }}
      style={{ x: sx, y: sy, rotateX: rx, rotateY: ry, transformPerspective: 600 }}
      whileTap={{ scale: 0.96 }}
      onMouseMove={(e) => {
        const el = localRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        x.set((dx / r.width) * strength * 2);
        y.set((dy / r.height) * strength * 2);
        onMouseMove?.(e);
      }}
      onMouseLeave={(e) => {
        x.set(0);
        y.set(0);
        onMouseLeave?.(e);
      }}
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-full",
        shimmer && "group",
        className,
      )}
      {...rest}
    >
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      {shimmer && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
        />
      )}
    </motion.button>
  );
});