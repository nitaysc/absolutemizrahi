import { motion } from "framer-motion";
import { Check, Clock, Dumbbell, BookOpen, Sparkles, Coffee, Heart } from "lucide-react";

export type TaskCategory = "workout" | "study" | "productive" | "rest" | "mindset";

interface TaskCardProps {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  duration?: number;
  isCompleted?: boolean;
  onToggle?: (id: string) => void;
  index?: number;
}

const categoryConfig = {
  workout: {
    icon: Dumbbell,
    label: "Workout",
    gradient: "var(--gradient-workout)",
    color: "text-workout",
    border: "border-workout/30",
    glow: "shadow-[0_0_20px_hsl(var(--workout)/0.2)]",
  },
  study: {
    icon: BookOpen,
    label: "Study",
    gradient: "var(--gradient-study)",
    color: "text-study",
    border: "border-study/30",
    glow: "shadow-[0_0_20px_hsl(var(--study)/0.2)]",
  },
  productive: {
    icon: Sparkles,
    label: "Productive",
    gradient: "var(--gradient-productive)",
    color: "text-productive",
    border: "border-productive/30",
    glow: "shadow-[0_0_20px_hsl(var(--productive)/0.2)]",
  },
  rest: {
    icon: Coffee,
    label: "Rest",
    gradient: "var(--gradient-rest)",
    color: "text-rest",
    border: "border-rest/30",
    glow: "shadow-[0_0_20px_hsl(var(--rest)/0.2)]",
  },
  mindset: {
    icon: Heart,
    label: "Mindset",
    gradient: "var(--gradient-mindset)",
    color: "text-mindset",
    border: "border-mindset/30",
    glow: "shadow-[0_0_20px_hsl(var(--mindset)/0.2)]",
  },
};

export function TaskCard({ 
  id, 
  title, 
  description, 
  category, 
  duration,
  isCompleted = false, 
  onToggle,
  index = 0 
}: TaskCardProps) {
  const config = categoryConfig[category];
  const Icon = config.icon;

  const handleToggle = () => {
    onToggle?.(id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -30, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 30, scale: 0.95 }}
      transition={{ 
        duration: 0.4, 
        delay: index * 0.08,
        type: "spring",
        stiffness: 300,
        damping: 25
      }}
      whileTap={{ scale: 0.97 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className={`
        relative overflow-hidden rounded-xl border p-4 cursor-pointer
        ${config.border}
        ${isCompleted ? 'opacity-60' : config.glow}
        transition-all duration-300
      `}
      style={{ background: config.gradient }}
      onClick={handleToggle}
    >
      {/* Shimmer effect on hover */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full"
        animate={!isCompleted ? { x: ["100%", "-100%"] } : {}}
        transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 2 }}
      />
      
      <div className="relative flex items-start gap-4">
        {/* Checkbox */}
        <motion.button
          className={`
            flex-shrink-0 w-7 h-7 rounded-full border-2 
            flex items-center justify-center
            ${isCompleted 
              ? `border-transparent` 
              : `border-muted-foreground/50`
            }
          `}
          style={{
            backgroundColor: isCompleted ? `hsl(var(--${category}))` : 'transparent',
            borderColor: isCompleted ? `hsl(var(--${category}))` : undefined,
          }}
          whileTap={{ scale: 0.7 }}
          whileHover={{ scale: 1.1 }}
        >
          {isCompleted && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
            >
              <Check className="w-4 h-4 text-background" />
            </motion.div>
          )}
        </motion.button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <motion.div
              animate={!isCompleted ? { rotate: [0, 10, -10, 0] } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 + 0.5 }}
            >
              <Icon className={`w-4 h-4 ${config.color}`} />
            </motion.div>
            <span className={`text-xs font-medium ${config.color}`}>
              {config.label}
            </span>
            {duration && (
              <motion.span 
                className="flex items-center gap-1 text-xs text-muted-foreground ml-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.1 + 0.3 }}
              >
                <Clock className="w-3 h-3" />
                {duration} min
              </motion.span>
            )}
          </div>
          <motion.h3 
            className={`font-semibold text-foreground ${isCompleted ? 'line-through' : ''}`}
            animate={isCompleted ? { opacity: 0.7 } : { opacity: 1 }}
          >
            {title}
          </motion.h3>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {description}
          </p>
        </div>
      </div>
      
      {/* Completion glow effect */}
      {isCompleted && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute top-1/2 left-6 w-8 h-8 rounded-full bg-primary"
        />
      )}
    </motion.div>
  );
}
