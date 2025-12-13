import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotes } from "@/hooks/useNotes";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { StickyNote, Save, Sparkles, PenLine, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const inspirationalQuotes = [
  "Write your thoughts, shape your future.",
  "Notes today, achievements tomorrow.",
  "Clarity comes from writing it down.",
  "Your ideas deserve to be captured.",
  "Small notes lead to big breakthroughs.",
];

export default function NotesPage() {
  const { user, loading: authLoading } = useAuth();
  const { note, loading, saving, saveNote } = useNotes();
  const [content, setContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [quote] = useState(() => inspirationalQuotes[Math.floor(Math.random() * inspirationalQuotes.length)]);
  const [charCount, setCharCount] = useState(0);

  // Sync content with fetched note
  useEffect(() => {
    if (note) {
      setContent(note.content);
      setCharCount(note.content.length);
    }
  }, [note]);

  // Track changes
  useEffect(() => {
    setHasChanges(content !== (note?.content ?? ""));
    setCharCount(content.length);
  }, [content, note?.content]);

  const handleSave = async () => {
    await saveNote(content);
    setHasChanges(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen pb-28 overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <motion.div
          className="absolute top-32 right-10 w-64 h-64 rounded-full blur-[100px]"
          style={{ background: 'hsl(45 90% 55% / 0.12)' }}
          animate={{
            y: [0, 20, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-60 left-10 w-80 h-80 rounded-full blur-[120px]"
          style={{ background: 'hsl(25 80% 50% / 0.08)' }}
          animate={{
            y: [0, -15, 0],
            scale: [1.1, 1, 1.1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="app-container pt-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <motion.div 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4"
            animate={{ 
              boxShadow: ['0 0 20px hsl(45 90% 55% / 0.1)', '0 0 40px hsl(45 90% 55% / 0.2)', '0 0 20px hsl(45 90% 55% / 0.1)']
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <StickyNote className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-500">Personal Notes</span>
          </motion.div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Notes for Self</h1>
          <motion.p 
            className="text-sm text-muted-foreground italic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            "{quote}"
          </motion.p>
        </motion.div>

        {/* Main Notes Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-3xl overflow-hidden"
        >
          {/* Card Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/30">
            <div className="flex items-center gap-3">
              <motion.div 
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <PenLine className="w-5 h-5 text-amber-500" />
              </motion.div>
              <div>
                <p className="text-sm font-semibold text-foreground">Quick Thoughts</p>
                <p className="text-xs text-muted-foreground">{charCount} characters</p>
              </div>
            </div>
            <AnimatePresence>
              {hasChanges && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-medium"
                >
                  Unsaved
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Textarea */}
          <div className="p-4">
            {loading ? (
              <div className="h-[300px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Textarea
                placeholder="What's on your mind today? Write down your goals, reminders, ideas, or anything you want to remember..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[300px] bg-transparent border-none resize-none text-base leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-border/30 bg-muted/20">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span className="text-xs">
                {note?.updated_at 
                  ? `Last saved ${new Date(note.updated_at).toLocaleDateString()} at ${new Date(note.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Never saved'
                }
              </span>
            </div>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/20"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Tips Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 space-y-3"
        >
          <div className="flex items-center gap-2 text-muted-foreground mb-3">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Quick Ideas</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {[
              { emoji: "🎯", text: "Today's goals" },
              { emoji: "💡", text: "New ideas" },
              { emoji: "📝", text: "Reminders" },
              { emoji: "🙏", text: "Gratitude" },
            ].map((item, index) => (
              <motion.button
                key={item.text}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + index * 0.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setContent(prev => prev + (prev ? '\n\n' : '') + `${item.emoji} ${item.text}:\n- `)}
                className="glass rounded-xl p-3 text-left hover:bg-muted/30 transition-colors"
              >
                <span className="text-lg mb-1 block">{item.emoji}</span>
                <span className="text-xs text-muted-foreground">{item.text}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Motivational Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-xs text-muted-foreground mt-8"
        >
          Your notes are private and saved securely
        </motion.p>
      </div>
    </div>
  );
}
