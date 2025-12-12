import { useState, useEffect } from "react";
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

  const currentIndex = routes.indexOf(location.pathname);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50;
    const velocity = 0.5;

    if (info.offset.x < -threshold || info.velocity.x < -velocity) {
      // Swipe left - go to next page
      if (currentIndex < routes.length - 1) {
        setDirection(1);
        navigate(routes[currentIndex + 1]);
      }
    } else if (info.offset.x > threshold || info.velocity.x > velocity) {
      // Swipe right - go to previous page
      if (currentIndex > 0) {
        setDirection(-1);
        navigate(routes[currentIndex - 1]);
      }
    }
  };

  // Update direction based on navigation
  useEffect(() => {
    const prevIndex = routes.indexOf(location.pathname);
    setDirection(0);
  }, [location.pathname]);

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? "100%" : direction < 0 ? "-100%" : 0,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? "-100%" : direction < 0 ? "100%" : 0,
      opacity: 0,
    }),
  };

  // Don't apply swipe on auth page
  if (location.pathname === "/auth") {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={location.pathname}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          className="absolute inset-0 overflow-y-auto"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
