import { motion } from "framer-motion";
import { DailyHeader } from "@/components/daily-header";
import { TaskCard, TaskCategory } from "@/components/task-card";
import { BottomNav } from "@/components/bottom-nav";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, PartyPopper } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  duration?: number;
  isCompleted: boolean;
}

const initialTasks: Task[] = [
  {
    id: "1",
    title: "Push Day - Upper Body",
    description: "Bench press 4x8, Overhead press 3x10, Dips 3x12, Tricep pushdowns",
    category: "workout",
    duration: 45,
    isCompleted: false,
  },
  {
    id: "2",
    title: "Mathematics - Calculus Review",
    description: "Practice integration by parts. Complete 10 problems from chapter 7.",
    category: "study",
    duration: 30,
    isCompleted: false,
  },
  {
    id: "3",
    title: "Organize Digital Files",
    description: "Clean up downloads folder, organize project files into proper directories.",
    category: "productive",
    duration: 15,
    isCompleted: false,
  },
  {
    id: "4",
    title: "Guilt-Free Gaming",
    description: "Enjoy some gaming time. You've earned it! Try that new indie game.",
    category: "rest",
    duration: 30,
    isCompleted: false,
  },
  {
    id: "5",
    title: "Evening Gratitude",
    description: "Write 3 things you're grateful for today in your journal.",
    category: "mindset",
    duration: 5,
    isCompleted: false,
  },
];

export default function Today() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [streak] = useState(7);

  const completedCount = tasks.filter(t => t.isCompleted).length;
  const progress = (completedCount / tasks.length) * 100;
  const allComplete = completedCount === tasks.length;

  const handleToggle = (id: string) => {
    setTasks(prev => prev.map(task => 
      task.id === id ? { ...task, isCompleted: !task.isCompleted } : task
    ));
  };

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6">
        <DailyHeader 
          streak={streak} 
          progress={progress}
          date={new Date()}
        />

        {/* Reroll Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex justify-end mb-4"
        >
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reroll (1 left)
          </Button>
        </motion.div>

        {/* Tasks */}
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <TaskCard
              key={task.id}
              id={task.id}
              title={task.title}
              description={task.description}
              category={task.category}
              duration={task.duration}
              isCompleted={task.isCompleted}
              onToggle={handleToggle}
              index={index}
            />
          ))}
        </div>

        {/* Complete Day Button */}
        {allComplete && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6"
          >
            <Button 
              className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              <PartyPopper className="w-5 h-5 mr-2" />
              Complete Day!
            </Button>
          </motion.div>
        )}
      </div>
      
      <BottomNav />
    </div>
  );
}
