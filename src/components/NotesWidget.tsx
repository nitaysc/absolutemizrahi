import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { StickyNote, ChevronDown, ChevronUp, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNotes } from "@/hooks/useNotes";

export function NotesWidget() {
  const { note, loading, saving, saveNote } = useNotes();
  const [isExpanded, setIsExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Sync content with fetched note
  useEffect(() => {
    if (note) {
      setContent(note.content);
    }
  }, [note]);

  // Track changes
  useEffect(() => {
    setHasChanges(content !== (note?.content ?? ""));
  }, [content, note?.content]);

  const handleSave = async () => {
    await saveNote(content);
    setHasChanges(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl overflow-hidden mb-4"
    >
      {/* Header - Always visible */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <StickyNote className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Notes for Self</h3>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading..." : note?.content ? "Tap to view your notes" : "Jot down your thoughts"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-amber-500 font-medium">Unsaved</span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </motion.button>

      {/* Expanded Content */}
      <motion.div
        initial={false}
        animate={{ 
          height: isExpanded ? "auto" : 0,
          opacity: isExpanded ? 1 : 0 
        }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <div className="px-4 pb-4 space-y-3">
          <Textarea
            placeholder="Write your thoughts, reminders, or motivational notes here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[120px] bg-muted/30 border-border/50 resize-none text-sm"
          />
          
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {note?.updated_at && `Last saved: ${new Date(note.updated_at).toLocaleDateString()}`}
            </p>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
