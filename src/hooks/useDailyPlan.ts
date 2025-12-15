import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

export interface PlanItem {
  id: string;
  category: string;
  title: string;
  description: string | null;
  duration_min: number | null;
  is_done: boolean;
  order_index: number;
}

export interface DailyPlan {
  id: string;
  plan_date: string;
  rerolls_used: number;
  items: PlanItem[];
}

export function useDailyPlan() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [userHasDog, setUserHasDog] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  // Fetch user preferences
  const fetchUserPreferences = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('has_dog')
      .eq('id', user.id)
      .single();
    
    if (data) {
      setUserHasDog(data.has_dog ?? false);
    }
  }, [user]);

  const fetchStreak = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('streaks')
      .select('current_streak')
      .eq('user_id', user.id)
      .single();
    
    if (data) {
      setStreak(data.current_streak);
    }
  }, [user]);

  const generatePlan = useCallback(async () => {
    if (!user) return null;

    // Fetch user's preferences
    const { data: profileData } = await supabase
      .from('profiles')
      .select('has_dog, workout_style, study_focus')
      .eq('id', user.id)
      .single();
    
    const hasDog = profileData?.has_dog ?? false;
    const workoutStyle = profileData?.workout_style ?? 'mixed';
    const studyFocus = (profileData?.study_focus as string[] | null) ?? [];
    
    // Map study focus options to task tags
    const studyFocusTagMap: Record<string, string[]> = {
      'Math': ['math', 'calculus'],
      'Science': ['physics', 'mechanics', 'chemistry', 'biology'],
      'Languages': ['language', 'learning'],
      'Programming': ['coding', 'review'],
      'Architecture': ['architecture', 'cad'],
      'Music': ['music'],
      'Art': ['art', 'drawing'],
      'History': ['history'],
    };
    
    // Get all relevant tags from user's study focus
    const relevantStudyTags = studyFocus.flatMap(focus => studyFocusTagMap[focus] || []);

    // Fetch random tasks from each category
    const categories = ['workout', 'study', 'productive', 'rest', 'mindset'];
    const planItems: { category: string; title: string; description: string | null; duration_min: number | null; order_index: number }[] = [];

    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      const { data: tasks } = await supabase
        .from('task_library')
        .select('*')
        .eq('category', category);

      if (tasks && tasks.length > 0) {
        // Filter tasks based on user preferences
        const filteredTasks = tasks.filter(task => {
          const metadata = task.metadata as Record<string, Json> | null;
          const tags = task.tags as string[] | null;
          
          // Filter out dog tasks if user doesn't have a dog
          if (metadata && metadata.requires_dog === true) {
            if (!hasDog) return false;
          }
          
          // Filter workout tasks based on workout_style preference
          if (category === 'workout' && tags) {
            const hasGymTag = tags.includes('gym');
            const hasCalisthenicsTag = tags.includes('calisthenics');
            
            // If task has no gym/calisthenics tag, it's neutral - always include
            if (!hasGymTag && !hasCalisthenicsTag) return true;
            
            if (workoutStyle === 'gym') {
              return hasGymTag;
            } else if (workoutStyle === 'calisthenics') {
              return hasCalisthenicsTag;
            }
            // 'mixed' includes all workout tasks
          }
          
          // Filter study tasks based on study_focus preference
          if (category === 'study' && tags && relevantStudyTags.length > 0) {
            // Check if any of the task's tags match the user's study focus tags
            const hasRelevantTag = tags.some(tag => relevantStudyTags.includes(tag.toLowerCase()));
            // Also include generic study tasks (flashcards, quiz, reading, writing, research, notes)
            const genericTags = ['flashcards', 'review', 'quiz', 'testing', 'reading', 'writing', 'research', 'notes', 'planning'];
            const isGenericTask = tags.some(tag => genericTags.includes(tag.toLowerCase()));
            return hasRelevantTag || isGenericTask;
          }
          
          return true;
        });

        if (filteredTasks.length > 0) {
          const randomTask = filteredTasks[Math.floor(Math.random() * filteredTasks.length)];
          planItems.push({
            category,
            title: randomTask.title,
            description: randomTask.description,
            duration_min: randomTask.duration_min,
            order_index: i,
          });
        }
      }
    }

    // Create daily plan
    const { data: newPlan, error: planError } = await supabase
      .from('daily_plans')
      .insert({ user_id: user.id, plan_date: today })
      .select()
      .single();

    if (planError || !newPlan) {
      console.error('Error creating plan:', planError);
      return null;
    }

    // Insert plan items
    const itemsToInsert = planItems.map(item => ({
      daily_plan_id: newPlan.id,
      ...item,
    }));

    const { error: itemsError } = await supabase
      .from('daily_plan_items')
      .insert(itemsToInsert);

    if (itemsError) {
      console.error('Error creating plan items:', itemsError);
      return null;
    }

    return newPlan.id;
  }, [user, today]);

  const fetchPlan = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Check for existing plan
    let { data: existingPlan } = await supabase
      .from('daily_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('plan_date', today)
      .single();

    let planId = existingPlan?.id;

    // Generate new plan if none exists
    if (!existingPlan) {
      planId = await generatePlan();
      if (planId) {
        const { data } = await supabase
          .from('daily_plans')
          .select('*')
          .eq('id', planId)
          .single();
        existingPlan = data;
      }
    }

    if (!existingPlan || !planId) {
      setLoading(false);
      return;
    }

    // Fetch plan items
    const { data: items } = await supabase
      .from('daily_plan_items')
      .select('*')
      .eq('daily_plan_id', planId)
      .order('order_index');

    setPlan({
      id: existingPlan.id,
      plan_date: existingPlan.plan_date,
      rerolls_used: existingPlan.rerolls_used ?? 0,
      items: items || [],
    });

    setLoading(false);
  }, [user, today, generatePlan]);

  const toggleTask = async (itemId: string): Promise<boolean> => {
    if (!plan) return false;

    const item = plan.items.find(i => i.id === itemId);
    if (!item) return false;

    const newIsDone = !item.is_done;

    const { error } = await supabase
      .from('daily_plan_items')
      .update({ 
        is_done: newIsDone,
        completed_at: newIsDone ? new Date().toISOString() : null 
      })
      .eq('id', itemId);

    if (error) {
      toast({ title: "Error", description: "Failed to update task", variant: "destructive" });
      return false;
    }

    setPlan(prev => prev ? {
      ...prev,
      items: prev.items.map(i => 
        i.id === itemId ? { ...i, is_done: newIsDone } : i
      )
    } : null);

    // Return whether task was completed (for coin rewards)
    return newIsDone;
  };

  const rerollPlan = async () => {
    if (!plan || !user) return;

    if (plan.rerolls_used >= 5) {
      toast({ title: "No rerolls left", description: "You used all 5 rerolls for today", variant: "destructive" });
      return;
    }

    // Delete current plan items
    await supabase
      .from('daily_plan_items')
      .delete()
      .eq('daily_plan_id', plan.id);

    // Fetch user's preferences for reroll
    const { data: profileData } = await supabase
      .from('profiles')
      .select('has_dog, workout_style, study_focus')
      .eq('id', user.id)
      .single();
    
    const hasDog = profileData?.has_dog ?? false;
    const workoutStyle = profileData?.workout_style ?? 'mixed';
    const studyFocus = (profileData?.study_focus as string[] | null) ?? [];
    
    // Map study focus options to task tags
    const studyFocusTagMap: Record<string, string[]> = {
      'Math': ['math', 'calculus'],
      'Science': ['physics', 'mechanics', 'chemistry', 'biology'],
      'Languages': ['language', 'learning'],
      'Programming': ['coding', 'review'],
      'Architecture': ['architecture', 'cad'],
      'Music': ['music'],
      'Art': ['art', 'drawing'],
      'History': ['history'],
    };
    
    // Get all relevant tags from user's study focus
    const relevantStudyTags = studyFocus.flatMap(focus => studyFocusTagMap[focus] || []);

    // Generate new items
    const categories = ['workout', 'study', 'productive', 'rest', 'mindset'];
    const planItems: { daily_plan_id: string; category: string; title: string; description: string | null; duration_min: number | null; order_index: number }[] = [];

    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      const { data: tasks } = await supabase
        .from('task_library')
        .select('*')
        .eq('category', category);

      if (tasks && tasks.length > 0) {
        // Filter tasks based on user preferences
        const filteredTasks = tasks.filter(task => {
          const metadata = task.metadata as Record<string, Json> | null;
          const tags = task.tags as string[] | null;
          
          // Filter out dog tasks if user doesn't have a dog
          if (metadata && metadata.requires_dog === true) {
            if (!hasDog) return false;
          }
          
          // Filter workout tasks based on workout_style preference
          if (category === 'workout' && tags) {
            const hasGymTag = tags.includes('gym');
            const hasCalisthenicsTag = tags.includes('calisthenics');
            
            // If task has no gym/calisthenics tag, it's neutral - always include
            if (!hasGymTag && !hasCalisthenicsTag) return true;
            
            if (workoutStyle === 'gym') {
              return hasGymTag;
            } else if (workoutStyle === 'calisthenics') {
              return hasCalisthenicsTag;
            }
            // 'mixed' includes all workout tasks
          }
          
          // Filter study tasks based on study_focus preference
          if (category === 'study' && tags && relevantStudyTags.length > 0) {
            const hasRelevantTag = tags.some(tag => relevantStudyTags.includes(tag.toLowerCase()));
            const genericTags = ['flashcards', 'review', 'quiz', 'testing', 'reading', 'writing', 'research', 'notes', 'planning'];
            const isGenericTask = tags.some(tag => genericTags.includes(tag.toLowerCase()));
            return hasRelevantTag || isGenericTask;
          }
          
          return true;
        });

        if (filteredTasks.length > 0) {
          const randomTask = filteredTasks[Math.floor(Math.random() * filteredTasks.length)];
          planItems.push({
            daily_plan_id: plan.id,
            category,
            title: randomTask.title,
            description: randomTask.description,
            duration_min: randomTask.duration_min,
            order_index: i,
          });
        }
      }
    }

    await supabase
      .from('daily_plan_items')
      .insert(planItems);

    // Update rerolls count
    await supabase
      .from('daily_plans')
      .update({ rerolls_used: plan.rerolls_used + 1 })
      .eq('id', plan.id);

    toast({ title: "Plan rerolled!", description: "New tasks have been generated" });
    
    await fetchPlan();
  };

  const completeDay = async (): Promise<number | null> => {
    if (!plan || !user) return null;

    const completedCount = plan.items.filter(i => i.is_done).length;
    const requiredCount = Math.ceil(plan.items.length * 0.6); // 60% required

    if (completedCount < requiredCount) {
      toast({ 
        title: "Not enough tasks completed", 
        description: `Complete at least ${requiredCount} tasks to finish the day`,
        variant: "destructive" 
      });
      return null;
    }

    // Update streak
    const { data: currentStreak } = await supabase
      .from('streaks')
      .select('*')
      .eq('user_id', user.id)
      .single();

    let newStreak = 1;

    if (currentStreak) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (currentStreak.last_completed_date === yesterdayStr) {
        newStreak = currentStreak.current_streak + 1;
      } else if (currentStreak.last_completed_date === today) {
        newStreak = currentStreak.current_streak;
      }

      const newLongest = Math.max(newStreak, currentStreak.longest_streak);

      await supabase
        .from('streaks')
        .update({
          current_streak: newStreak,
          longest_streak: newLongest,
          last_completed_date: today,
        })
        .eq('user_id', user.id);

      setStreak(newStreak);
    }

    toast({ title: "🎉 Day completed!", description: "Great job! Keep the streak going!" });
    
    // Return new streak for coin bonus calculation
    return newStreak;
  };

  useEffect(() => {
    fetchPlan();
    fetchStreak();
    fetchUserPreferences();
  }, [fetchPlan, fetchStreak, fetchUserPreferences]);

  return {
    plan,
    loading,
    streak,
    toggleTask,
    rerollPlan,
    completeDay,
    refetch: fetchPlan,
  };
}
