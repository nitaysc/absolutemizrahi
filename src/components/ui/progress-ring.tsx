import { motion } from "framer-motion";

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  animate?: boolean;
}

export function ProgressRing({ 
  progress, 
  size = 120, 
  strokeWidth = 8,
  className = "",
  animate = false
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  const isComplete = progress >= 100;

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {/* Glow effect when complete */}
      {isComplete && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)',
          }}
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.8, 0.5]
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
        />
      )}
      
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ 
            strokeDashoffset: offset,
            stroke: isComplete ? 'hsl(var(--primary))' : 'hsl(var(--primary))'
          }}
          transition={{ duration: animate ? 0.5 : 1, ease: "easeOut" }}
          style={{
            strokeDasharray: circumference,
            filter: isComplete ? 'drop-shadow(0 0 8px hsl(var(--primary) / 0.5))' : 'none'
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span 
          className="text-2xl font-bold text-foreground"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ 
            scale: animate && isComplete ? [1, 1.2, 1] : 1, 
            opacity: 1 
          }}
          transition={{ 
            delay: animate ? 0 : 0.5, 
            duration: animate ? 0.3 : 0.3,
            ...(animate && isComplete ? { repeat: 1 } : {})
          }}
        >
          {Math.round(progress)}%
        </motion.span>
        <span className="text-xs text-muted-foreground">
          {isComplete ? '🎉 done!' : 'complete'}
        </span>
      </div>
    </div>
  );
}
