import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserProfile {
  id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  coins: number;
  total_wagered: number;
  total_won: number;
  last_daily_bonus: string | null;
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
        username: data.username,
        email: data.email,
        coins: Number(data.coins ?? 0),
        total_wagered: Number(data.total_wagered ?? 0),
        total_won: Number(data.total_won ?? 0),
        last_daily_bonus: data.last_daily_bonus,
      });
    }
    setLoading(false);
  }

  async function updateProfile(updates: Partial<UserProfile>) {
    if (!user) return { error: new Error('No user') };
    
    const { error } = await supabase
      .from('profiles')
      .update(updates as any)
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
