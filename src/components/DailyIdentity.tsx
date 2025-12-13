import { motion } from "framer-motion";

const identities = [
  { emoji: "🧠", title: "The Focused One", vibe: "Laser focus. No distractions." },
  { emoji: "💪", title: "The Disciplined One", vibe: "You do what needs to be done." },
  { emoji: "⚔️", title: "The Comeback Kid", vibe: "Every day is a fresh start." },
  { emoji: "🔥", title: "The Unstoppable", vibe: "Nothing can break your momentum." },
  { emoji: "🎯", title: "The Goal Crusher", vibe: "One task at a time, all tasks done." },
  { emoji: "🌟", title: "The Rising Star", vibe: "Getting better every single day." },
  { emoji: "🦾", title: "The Machine", vibe: "Efficiency is your superpower." },
  { emoji: "🧘", title: "The Balanced One", vibe: "Work hard, rest harder." },
  { emoji: "⚡", title: "The Energized", vibe: "Today's energy is unmatched." },
  { emoji: "🏆", title: "The Champion", vibe: "Winners show up. You showed up." },
];

// Deterministic daily identity based on date
function getDailyIdentity(date: Date) {
  const dateStr = date.toISOString().split('T')[0];
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % identities.length;
  return identities[index];
}

interface DailyIdentityProps {
  date: Date;
}

export function DailyIdentity({ date }: DailyIdentityProps) {
  const identity = getDailyIdentity(date);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass rounded-2xl p-4 mb-4 text-center relative overflow-hidden"
    >
      {/* Background glow effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10"
        animate={{ 
          opacity: [0.3, 0.6, 0.3],
          x: [-20, 20, -20]
        }}
        transition={{ 
          duration: 3, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
      />
      
      <div className="relative z-10">
        <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Today you are</p>
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-2"
        >
          <motion.span 
            className="text-3xl"
            animate={{ 
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity,
              repeatDelay: 3
            }}
          >
            {identity.emoji}
          </motion.span>
          <span className="text-xl font-bold text-foreground">{identity.title}</span>
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-sm text-muted-foreground mt-1 italic"
        >
          {identity.vibe}
        </motion.p>
      </div>
    </motion.div>
  );
}
