import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_workout_date: string | null;
  current_rank: string;
  onboarding_complete: boolean | null;
}

export function useUserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    fetchProfile();
  }, [user]);

  async function fetchProfile() {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
    } else if (data) {
      setProfile({
        id: data.id,
        display_name: data.display_name,
        email: data.email,
        total_xp: data.total_xp ?? 0,
        current_streak: data.current_streak ?? 0,
        longest_streak: data.longest_streak ?? 0,
        last_workout_date: data.last_workout_date,
        current_rank: data.current_rank ?? 'wood',
        onboarding_complete: data.onboarding_complete,
      });
    }
    setLoading(false);
  }

  async function updateProfile(updates: Partial<UserProfile>) {
    if (!user) return { error: new Error('No user') };
    
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (error) {
      toast.error('Failed to update profile');
      return { error };
    }

    setProfile(prev => prev ? { ...prev, ...updates } : null);
    toast.success('Profile updated');
    return { error: null };
  }

  return { profile, loading, updateProfile, refetch: fetchProfile };
}
