import { motion } from "framer-motion";
import { Calendar, BarChart3, User, Flame } from "lucide-react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";

const navItems = [
  { to: "/", icon: Flame, label: "Today" },
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/stats", icon: BarChart3, label: "Stats" },
  { to: "/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <motion.nav 
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.2 }}
      className="fixed bottom-0 left-0 right-0 z-50 glass-strong safe-bottom"
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          
          return (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 px-4 py-2 transition-all duration-200 ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <motion.div 
                className="relative"
                whileTap={{ scale: 0.85 }}
                whileHover={{ scale: 1.1 }}
              >
                <motion.div
                  animate={isActive ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <item.icon className="w-6 h-6" />
                </motion.div>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.div>
              <motion.span 
                className="text-xs font-medium"
                animate={isActive ? { fontWeight: 600 } : { fontWeight: 500 }}
              >
                {item.label}
              </motion.span>
            </RouterNavLink>
          );
        })}
      </div>
    </motion.nav>
  );
}
