import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { useShop, ShopItem } from "@/hooks/useShop";
import { useThemePreview } from "@/contexts/ThemePreviewContext";
import { ShopItemCard } from "@/components/shop/ShopItemCard";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Palette, Flame, Trophy, Sparkles, X } from "lucide-react";

const CATEGORIES = [
  { id: "all", label: "All", icon: Sparkles },
  { id: "theme", label: "Themes", icon: Palette },
  { id: "streak_effect", label: "Flames", icon: Flame },
  { id: "avatar", label: "Avatars", icon: Trophy },
  { id: "badge", label: "Badges", icon: Trophy },
  { id: "animation", label: "Effects", icon: Sparkles },
];

export default function Shop() {
  const { user, loading: authLoading } = useAuth();
  const { shopItems, userCoins, userStreak, loading } = useShop();
  const { setPreviewColor, clearPreview, previewColor } = useThemePreview();
  const [activeCategory, setActiveCategory] = useState("all");
  const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Clear live preview when leaving shop
  useEffect(() => {
    return () => {
      clearPreview();
    };
  }, [clearPreview]);

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

  const filteredItems = shopItems?.filter((item) => {
    if (activeCategory === "all") return true;
    return item.category === activeCategory;
  });

  const handlePreview = (item: ShopItem) => {
    setPreviewItem(item);
    
    // If it's a theme, apply the color to the entire app immediately
    if (item.category === "theme") {
      const metadata = item.metadata as Record<string, unknown> | null;
      const color = metadata?.color as string | undefined;
      if (color) {
        setPreviewColor(color);
      }
    }
    
    // Scroll to preview
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleClearPreview = () => {
    setPreviewItem(null);
    clearPreview();
  };

  // Group by rarity for better display
  const groupedItems = {
    common: filteredItems?.filter((i) => i.rarity === "common") ?? [],
    rare: filteredItems?.filter((i) => i.rarity === "rare") ?? [],
    epic: filteredItems?.filter((i) => i.rarity === "epic") ?? [],
    legendary: filteredItems?.filter((i) => i.rarity === "legendary") ?? [],
  };

  return (
    <div className="min-h-screen pb-28">
      <div className="app-container pt-2">
        <ShopHeader coins={userCoins} streak={userStreak} />

        <div ref={previewRef}>
          {/* Live Preview Banner */}
          <AnimatePresence>
            {previewColor && previewItem && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="mt-4 mb-2 rounded-2xl p-4 border-2 border-primary/50 bg-primary/10 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-primary font-medium mb-1">
                      🎨 Live Preview Active
                    </p>
                    <p className="text-sm font-semibold">{previewItem.name}</p>
                    <p className="text-xs text-muted-foreground">
                      The entire app is now using this color. Look around!
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    onClick={handleClearPreview}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                {/* Animated glow */}
                <motion.div
                  animate={{
                    opacity: [0.3, 0.6, 0.3],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 pointer-events-none"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Static Preview for non-theme items */}
          {previewItem && !previewColor && (
            <ShopPreview item={previewItem} onClose={handleClearPreview} />
          )}
        </div>

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mt-4">
          <TabsList className="w-full flex overflow-x-auto no-scrollbar bg-muted/30">
            {CATEGORIES.map((cat) => (
              <TabsTrigger
                key={cat.id}
                value={cat.id}
                className="flex-1 min-w-fit text-xs data-[state=active]:bg-primary/20"
              >
                <cat.icon className="w-3 h-3 mr-1" />
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeCategory} className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Legendary Items */}
                {groupedItems.legendary.length > 0 && (
                  <ItemSection
                    title="✨ Legendary"
                    items={groupedItems.legendary}
                    onPreview={handlePreview}
                  />
                )}

                {/* Epic Items */}
                {groupedItems.epic.length > 0 && (
                  <ItemSection
                    title="💜 Epic"
                    items={groupedItems.epic}
                    onPreview={handlePreview}
                  />
                )}

                {/* Rare Items */}
                {groupedItems.rare.length > 0 && (
                  <ItemSection
                    title="💙 Rare"
                    items={groupedItems.rare}
                    onPreview={handlePreview}
                  />
                )}

                {/* Common Items */}
                {groupedItems.common.length > 0 && (
                  <ItemSection
                    title="Common"
                    items={groupedItems.common}
                    onPreview={handlePreview}
                  />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ItemSection({
  title,
  items,
  onPreview,
}: {
  title: string;
  items: ShopItem[];
  onPreview: (item: ShopItem) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item, index) => (
          <ShopItemCard
            key={item.id}
            item={item}
            index={index}
            onPreview={onPreview}
          />
        ))}
      </div>
    </motion.div>
  );
}

function ShopPreview({ item, onClose }: { item: ShopItem; onClose: () => void }) {
  const metadata = item.metadata as any;

  if (item.category === "avatar") {
    const emoji = metadata?.emoji ?? "👤";
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 mb-2 glass rounded-2xl p-4 flex items-center gap-4 relative"
      >
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center text-4xl">
          {emoji}
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1">Avatar preview</p>
          <p className="text-sm font-semibold">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            This avatar appears on your profile and stats screens.
          </p>
        </div>
        <Button size="icon" variant="ghost" className="shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </motion.div>
    );
  }

  if (item.category === "animation") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 mb-2 glass rounded-2xl p-4 relative"
      >
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
        <p className="text-xs text-muted-foreground mb-2">Task effect preview</p>
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold"
          >
            Complete Task
          </motion.button>
          <p className="text-xs text-muted-foreground">
            {item.name} will play around completed tasks.
          </p>
        </div>
      </motion.div>
    );
  }

  if (item.category === "streak_effect") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 mb-2 glass rounded-2xl p-4 flex items-center gap-4 relative"
      >
        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
          <Flame className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1">Streak flame preview</p>
          <p className="text-sm font-semibold">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            Your streak counter will use this flame style.
          </p>
        </div>
        <Button size="icon" variant="ghost" className="shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </motion.div>
    );
  }

  if (item.category === "badge") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 mb-2 glass rounded-2xl p-4 flex items-center gap-4 relative"
      >
        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1">Badge preview</p>
          <p className="text-sm font-semibold">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.description}</p>
        </div>
        <Button size="icon" variant="ghost" className="shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </motion.div>
    );
  }

  return null;
}
