import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { UserProfile } from "@/hooks/useUserProfile";
import { Loader2, Dog } from "lucide-react";

interface EditPreferencesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: UserProfile | null;
  onSave: (updates: Partial<UserProfile>) => Promise<{ error: Error | null }>;
}

const workoutStyles = [
  { value: "gym", label: "Gym Only" },
  { value: "calisthenics", label: "Calisthenics" },
  { value: "mixed", label: "Mixed" },
];

const dailyTimes = [
  { value: "short", label: "30 min - 1 hour" },
  { value: "medium", label: "1 - 2 hours" },
  { value: "long", label: "2+ hours" },
];

const trainingSplits = [
  { value: "ppl", label: "Push/Pull/Legs" },
  { value: "upper_lower", label: "Upper/Lower" },
  { value: "full_body", label: "Full Body" },
];

const studyOptions = [
  "Math", "Science", "Languages", "Programming", 
  "Architecture", "Music", "Art", "History"
];

export function EditPreferencesSheet({ 
  open, 
  onOpenChange, 
  profile, 
  onSave 
}: EditPreferencesSheetProps) {
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [workoutStyle, setWorkoutStyle] = useState("mixed");
  const [dailyTime, setDailyTime] = useState("medium");
  const [trainingSplit, setTrainingSplit] = useState("ppl");
  const [studyFocus, setStudyFocus] = useState<string[]>([]);
  const [hasDog, setHasDog] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setWorkoutStyle(profile.workout_style || "mixed");
      setDailyTime(profile.daily_time || "medium");
      setTrainingSplit(profile.training_split || "ppl");
      setStudyFocus(profile.study_focus || []);
      setHasDog(profile.has_dog || false);
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      display_name: displayName || null,
      workout_style: workoutStyle,
      daily_time: dailyTime,
      training_split: trainingSplit,
      study_focus: studyFocus,
      has_dog: hasDog,
    });
    setSaving(false);
    onOpenChange(false);
  };

  const toggleStudyFocus = (subject: string) => {
    setStudyFocus(prev => 
      prev.includes(subject) 
        ? prev.filter(s => s !== subject)
        : [...prev, subject]
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl bg-card border-border">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl font-bold">Edit Preferences</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-6 overflow-y-auto max-h-[calc(85vh-140px)] pb-4">
          {/* Display Name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Display Name</Label>
            <Input
              placeholder="Enter your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-muted/50 border-border"
            />
          </div>

          {/* Has Dog Toggle */}
          <motion.div 
            whileTap={{ scale: 0.98 }}
            className="flex items-center justify-between p-4 rounded-xl bg-muted/30"
          >
            <div className="flex items-center gap-3">
              <Dog className="w-5 h-5 text-primary" />
              <div>
                <Label className="text-sm font-medium">I have a dog</Label>
                <p className="text-xs text-muted-foreground">Get dog walking and playtime tasks</p>
              </div>
            </div>
            <Switch checked={hasDog} onCheckedChange={setHasDog} />
          </motion.div>

          {/* Workout Style */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Workout Style</Label>
            <RadioGroup value={workoutStyle} onValueChange={setWorkoutStyle} className="space-y-2">
              {workoutStyles.map((style) => (
                <motion.div 
                  key={style.value}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center space-x-3 p-3 rounded-xl bg-muted/30 cursor-pointer"
                  onClick={() => setWorkoutStyle(style.value)}
                >
                  <RadioGroupItem value={style.value} id={style.value} />
                  <Label htmlFor={style.value} className="cursor-pointer flex-1">{style.label}</Label>
                </motion.div>
              ))}
            </RadioGroup>
          </div>

          {/* Daily Time */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Daily Time Available</Label>
            <RadioGroup value={dailyTime} onValueChange={setDailyTime} className="space-y-2">
              {dailyTimes.map((time) => (
                <motion.div 
                  key={time.value}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center space-x-3 p-3 rounded-xl bg-muted/30 cursor-pointer"
                  onClick={() => setDailyTime(time.value)}
                >
                  <RadioGroupItem value={time.value} id={time.value} />
                  <Label htmlFor={time.value} className="cursor-pointer flex-1">{time.label}</Label>
                </motion.div>
              ))}
            </RadioGroup>
          </div>

          {/* Training Split */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Training Split</Label>
            <RadioGroup value={trainingSplit} onValueChange={setTrainingSplit} className="space-y-2">
              {trainingSplits.map((split) => (
                <motion.div 
                  key={split.value}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center space-x-3 p-3 rounded-xl bg-muted/30 cursor-pointer"
                  onClick={() => setTrainingSplit(split.value)}
                >
                  <RadioGroupItem value={split.value} id={split.value} />
                  <Label htmlFor={split.value} className="cursor-pointer flex-1">{split.label}</Label>
                </motion.div>
              ))}
            </RadioGroup>
          </div>

          {/* Study Focus */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Study Focus</Label>
            <div className="grid grid-cols-2 gap-2">
              {studyOptions.map((subject) => (
                <motion.div 
                  key={subject}
                  whileTap={{ scale: 0.95 }}
                  className={`flex items-center space-x-2 p-3 rounded-xl cursor-pointer transition-colors ${
                    studyFocus.includes(subject) 
                      ? 'bg-primary/20 border border-primary/30' 
                      : 'bg-muted/30'
                  }`}
                  onClick={() => toggleStudyFocus(subject)}
                >
                  <Checkbox 
                    checked={studyFocus.includes(subject)} 
                    onCheckedChange={() => toggleStudyFocus(subject)}
                  />
                  <span className="text-sm">{subject}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="w-full h-12 text-base font-semibold"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
