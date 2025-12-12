import { motion } from "framer-motion";
import { Check, Clock, Dumbbell, BookOpen, Sparkles, Coffee, Heart } from "lucide-react";
import { useState } from "react";

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
  const [completed, setCompleted] = useState(isCompleted);
  const config = categoryConfig[category];
  const Icon = config.icon;

  const handleToggle = () => {
    setCompleted(!completed);
    onToggle?.(id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      whileTap={{ scale: 0.98 }}
      className={`
        relative overflow-hidden rounded-xl border p-4
        ${config.border}
        ${completed ? 'opacity-60' : config.glow}
        transition-all duration-300
      `}
      style={{ background: config.gradient }}
      onClick={handleToggle}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        <motion.button
          className={`
            flex-shrink-0 w-6 h-6 rounded-full border-2 
            flex items-center justify-center
            ${completed 
              ? `bg-${category} border-${category}` 
              : `border-muted-foreground/50`
            }
          `}
          style={{
            backgroundColor: completed ? `hsl(var(--${category}))` : 'transparent',
            borderColor: completed ? `hsl(var(--${category}))` : undefined,
          }}
          whileTap={{ scale: 0.8 }}
        >
          {completed && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              <Check className="w-4 h-4 text-background" />
            </motion.div>
          )}
        </motion.button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-4 h-4 ${config.color}`} />
            <span className={`text-xs font-medium ${config.color}`}>
              {config.label}
            </span>
            {duration && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                <Clock className="w-3 h-3" />
                {duration} min
              </span>
            )}
          </div>
          <h3 className={`font-semibold text-foreground ${completed ? 'line-through' : ''}`}>
            {title}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {description}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
