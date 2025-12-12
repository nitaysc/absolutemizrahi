import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";

const routes = ["/", "/calendar", "/stats", "/profile"];

interface SwipeablePagesProps {
  children: React.ReactNode;
}

export function SwipeablePages({ children }: SwipeablePagesProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [direction, setDirection] = useState(0);
  const isNavigating = useRef(false);
  const prevPathRef = useRef(location.pathname);

  const currentIndex = routes.indexOf(location.pathname);

  // Track direction based on route changes
  if (prevPathRef.current !== location.pathname) {
    const prevIndex = routes.indexOf(prevPathRef.current);
    const newIndex = routes.indexOf(location.pathname);
    if (prevIndex !== -1 && newIndex !== -1) {
      setDirection(newIndex > prevIndex ? 1 : -1);
    }
    prevPathRef.current = location.pathname;
    isNavigating.current = false;
  }

  const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isNavigating.current) return;
    
    const threshold = 80;
    const velocityThreshold = 500;

    if ((info.offset.x < -threshold && info.velocity.x <= 0) || info.velocity.x < -velocityThreshold) {
      // Swipe left - go to next page
      if (currentIndex < routes.length - 1) {
        isNavigating.current = true;
        setDirection(1);
        navigate(routes[currentIndex + 1]);
      }
    } else if ((info.offset.x > threshold && info.velocity.x >= 0) || info.velocity.x > velocityThreshold) {
      // Swipe right - go to previous page
      if (currentIndex > 0) {
        isNavigating.current = true;
        setDirection(-1);
        navigate(routes[currentIndex - 1]);
      }
    }
  }, [currentIndex, navigate]);

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? "100%" : direction < 0 ? "-100%" : 0,
      opacity: 0.5,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? "-50%" : direction < 0 ? "50%" : 0,
      opacity: 0,
    }),
  };

  // Don't apply swipe on auth page or unknown routes
  if (location.pathname === "/auth" || currentIndex === -1) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div
          key={location.pathname}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 400, damping: 35 },
            opacity: { duration: 0.15 },
          }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          className="absolute inset-0 overflow-y-auto touch-pan-y"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
