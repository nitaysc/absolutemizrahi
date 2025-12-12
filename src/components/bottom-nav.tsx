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
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          
          return (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div className="relative">
                <item.icon className="w-6 h-6" />
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </RouterNavLink>
          );
        })}
      </div>
    </nav>
  );
}
