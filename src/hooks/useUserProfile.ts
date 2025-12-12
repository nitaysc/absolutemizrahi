import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  workout_style: string | null;
  daily_time: string | null;
  training_split: string | null;
  study_focus: string[] | null;
  equipment: string[] | null;
  onboarding_complete: boolean | null;
  has_dog: boolean | null;
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
        ...data,
        study_focus: Array.isArray(data.study_focus) ? data.study_focus as string[] : [],
        equipment: Array.isArray(data.equipment) ? data.equipment as string[] : [],
        has_dog: data.has_dog ?? false,
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
