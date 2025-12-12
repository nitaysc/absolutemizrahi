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
      if (currentIndex < routes.length - 1) {
        isNavigating.current = true;
        setDirection(1);
        navigate(routes[currentIndex + 1]);
      }
    } else if ((info.offset.x > threshold && info.velocity.x >= 0) || info.velocity.x > velocityThreshold) {
      if (currentIndex > 0) {
        isNavigating.current = true;
        setDirection(-1);
        navigate(routes[currentIndex - 1]);
      }
    }
  }, [currentIndex, navigate]);

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? "30%" : direction < 0 ? "-30%" : 0,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? "-30%" : direction < 0 ? "30%" : 0,
      opacity: 0,
    }),
  };

  // Don't apply swipe on auth page or unknown routes
  if (location.pathname === "/auth" || currentIndex === -1) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* Centered Page Indicators */}
      <div className="fixed top-3 left-0 right-0 z-50 flex justify-center">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/50">
          {routes.map((route, index) => (
            <motion.button
              key={route}
              onClick={() => {
                if (index !== currentIndex) {
                  setDirection(index > currentIndex ? 1 : -1);
                  navigate(route);
                }
              }}
              className="relative p-1"
            >
              <motion.div
                className={`w-2 h-2 rounded-full ${
                  index === currentIndex ? 'bg-primary' : 'bg-muted-foreground/40'
                }`}
                animate={index === currentIndex ? { scale: 1.3 } : { scale: 1 }}
                transition={{ duration: 0.15 }}
              />
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={location.pathname}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "tween", duration: 0.15, ease: "easeOut" },
            opacity: { duration: 0.1 },
          }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.12}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          className="absolute inset-0 overflow-y-auto touch-pan-y pt-10"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
