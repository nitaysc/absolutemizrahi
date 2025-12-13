import { motion } from "framer-motion";
import { Calendar, BarChart3, User, Flame } from "lucide-react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { hapticFeedback } from "@/hooks/useHaptics";

const navItems = [
  { to: "/", icon: Flame, label: "Today" },
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/stats", icon: BarChart3, label: "Stats" },
  { to: "/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
  const location = useLocation();

  const handleNavClick = (to: string) => {
    if (location.pathname !== to) {
      hapticFeedback("selection");
    }
  };

  return (
    <motion.nav 
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      className="fixed bottom-0 left-0 right-0 z-50"
    >
      <div className="mx-3 mb-3 rounded-2xl glass-strong safe-bottom">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            
            return (
              <RouterNavLink
                key={item.to}
                to={item.to}
                onClick={() => handleNavClick(item.to)}
                className="flex flex-col items-center justify-center gap-0.5 px-5 py-2 touch-target"
              >
                <motion.div 
                  className="relative"
                  whileTap={{ scale: 0.85 }}
                >
                  <motion.div
                    animate={{ 
                      scale: isActive ? 1 : 0.9,
                      y: isActive ? -2 : 0,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <item.icon 
                      className={`w-6 h-6 transition-colors duration-200 ${
                        isActive ? 'text-primary' : 'text-muted-foreground'
                      }`}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                  </motion.div>
                  {isActive && (
                    <motion.div
                      layoutId="nav-glow"
                      className="absolute -inset-2 bg-primary/20 rounded-xl blur-md -z-10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </motion.div>
                <motion.span 
                  className={`text-[10px] font-semibold tracking-wide transition-colors duration-200 ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}
                  animate={{ opacity: isActive ? 1 : 0.7 }}
                >
                  {item.label}
                </motion.span>
              </RouterNavLink>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
