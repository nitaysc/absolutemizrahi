import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  ReactNode,
} from "react";
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

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  refetch: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: Error | null }>;
  /** Patch the local balance immediately (server is source of truth, refetch will reconcile). */
  setLocalCoins: (coins: number) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
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
  }, [user]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    fetchProfile();

    // Realtime: keep balance in sync across tabs / RPC calls
    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const d = payload.new as Record<string, unknown>;
          setProfile((prev) =>
            prev
              ? {
                  ...prev,
                  coins: Number(d.coins ?? prev.coins),
                  total_wagered: Number(d.total_wagered ?? prev.total_wagered),
                  total_won: Number(d.total_won ?? prev.total_won),
                  username: (d.username as string | null) ?? prev.username,
                  last_daily_bonus:
                    (d.last_daily_bonus as string | null) ?? prev.last_daily_bonus,
                }
              : prev,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchProfile]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
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
  }, [user]);

  const setLocalCoins = useCallback((coins: number) => {
    setProfile((prev) => (prev ? { ...prev, coins } : prev));
  }, []);

  return (
    <ProfileContext.Provider
      value={{ profile, loading, refetch: fetchProfile, updateProfile, setLocalCoins }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useUserProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useUserProfile must be used inside <ProfileProvider>");
  return ctx;
}
