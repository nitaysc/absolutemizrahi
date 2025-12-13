import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface Note {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export function useNotes() {
  const { user } = useAuth();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchNote = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching note:', error);
    }

    setNote(data);
    setLoading(false);
  }, [user]);

  const saveNote = async (content: string) => {
    if (!user) return;

    setSaving(true);

    if (note) {
      // Update existing note
      const { error } = await supabase
        .from('notes')
        .update({ content })
        .eq('id', note.id);

      if (error) {
        toast({ title: "Error", description: "Failed to save note", variant: "destructive" });
        setSaving(false);
        return;
      }

      setNote(prev => prev ? { ...prev, content, updated_at: new Date().toISOString() } : null);
    } else {
      // Create new note
      const { data, error } = await supabase
        .from('notes')
        .insert({ user_id: user.id, content })
        .select()
        .single();

      if (error) {
        toast({ title: "Error", description: "Failed to create note", variant: "destructive" });
        setSaving(false);
        return;
      }

      setNote(data);
    }

    setSaving(false);
    toast({ title: "Saved", description: "Your note has been saved" });
  };

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  return {
    note,
    loading,
    saving,
    saveNote,
    refetch: fetchNote,
  };
}
