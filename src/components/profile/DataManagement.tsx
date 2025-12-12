import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2, FileJson, Check, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DataManagementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DataManagementSheet({ open, onOpenChange }: DataManagementSheetProps) {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!user) return;
    
    setExporting(true);
    try {
      // Fetch all user data
      const [profileRes, streaksRes, plansRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('streaks').select('*').eq('user_id', user.id).single(),
        supabase.from('daily_plans').select('*').eq('user_id', user.id),
      ]);

      let planItems: any[] = [];
      if (plansRes.data && plansRes.data.length > 0) {
        const planIds = plansRes.data.map(p => p.id);
        const { data: items } = await supabase
          .from('daily_plan_items')
          .select('*')
          .in('daily_plan_id', planIds);
        planItems = items || [];
      }

      const exportData = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        profile: profileRes.data,
        streaks: streaksRes.data,
        plans: plansRes.data,
        planItems: planItems,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `streak-planner-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Data exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    }
    setExporting(false);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.profile) {
        throw new Error('Invalid backup file format');
      }

      // Update profile
      if (data.profile) {
        await supabase
          .from('profiles')
          .update({
            display_name: data.profile.display_name,
            workout_style: data.profile.workout_style,
            daily_time: data.profile.daily_time,
            training_split: data.profile.training_split,
            study_focus: data.profile.study_focus,
            equipment: data.profile.equipment,
          })
          .eq('id', user.id);
      }

      // Update streaks
      if (data.streaks) {
        await supabase
          .from('streaks')
          .update({
            current_streak: data.streaks.current_streak,
            longest_streak: data.streaks.longest_streak,
            last_completed_date: data.streaks.last_completed_date,
          })
          .eq('user_id', user.id);
      }

      toast.success('Data imported successfully');
      onOpenChange(false);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import data. Check file format.');
    }
    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto rounded-t-3xl bg-card border-border">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl font-bold">Data Management</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-4 pb-6">
          <motion.div 
            whileTap={{ scale: 0.98 }}
            className="p-4 rounded-2xl bg-muted/30 border border-border"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Download className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">Export Data</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Download all your data as a JSON file for backup.
                </p>
                <Button 
                  onClick={handleExport} 
                  disabled={exporting}
                  variant="secondary"
                  className="w-full"
                >
                  {exporting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <FileJson className="w-4 h-4 mr-2" />
                  )}
                  Export to JSON
                </Button>
              </div>
            </div>
          </motion.div>

          <motion.div 
            whileTap={{ scale: 0.98 }}
            className="p-4 rounded-2xl bg-muted/30 border border-border"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-study/20 flex items-center justify-center">
                <Upload className="w-6 h-6 text-study" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">Import Data</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Restore your data from a previously exported backup file.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  disabled={importing}
                  variant="secondary"
                  className="w-full"
                >
                  {importing ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  Import from JSON
                </Button>
              </div>
            </div>
          </motion.div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Importing data will overwrite your current profile and streak settings. 
              Daily plans will not be affected.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
