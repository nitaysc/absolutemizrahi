import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { useShop, ShopItem } from "@/hooks/useShop";
import { ShopItemCard } from "@/components/shop/ShopItemCard";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Palette, Flame, Trophy, Sparkles } from "lucide-react";

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
  const [activeCategory, setActiveCategory] = useState("all");
  const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

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
    // Ensure the preview is visible, especially on mobile
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
          {/* Live Preview */}
          <ShopPreview item={previewItem} />
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

function ShopPreview({ item }: { item: ShopItem | null }) {
  if (!item) return null;

  const metadata = item.metadata as any;

  if (item.category === "theme") {
    const color = metadata?.color as string | undefined;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 mb-2 glass rounded-2xl p-4 flex items-center justify-between"
      >
        <div>
          <p className="text-xs text-muted-foreground mb-1">Theme preview</p>
          <p className="text-sm font-semibold">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            Glows, buttons and highlights will use this color.
          </p>
        </div>
        <div
          className="w-20 h-12 rounded-xl shadow-lg"
          style={{
            background: color
              ? `linear-gradient(135deg, hsl(${color}) 0%, hsl(${color} / 0.7) 100%)`
              : "var(--gradient-card)",
          }}
        />
      </motion.div>
    );
  }

  if (item.category === "avatar") {
    const emoji = metadata?.emoji ?? "👤";
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 mb-2 glass rounded-2xl p-4 flex items-center gap-4"
      >
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center text-4xl">
          {emoji}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Avatar preview</p>
          <p className="text-sm font-semibold">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            This avatar appears on your profile and stats screens.
          </p>
        </div>
      </motion.div>
    );
  }

  if (item.category === "animation") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 mb-2 glass rounded-2xl p-4"
      >
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
        className="mt-4 mb-2 glass rounded-2xl p-4 flex items-center gap-4"
      >
        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
          <Flame className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Streak flame preview</p>
          <p className="text-sm font-semibold">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            Your streak counter will use this flame style.
          </p>
        </div>
      </motion.div>
    );
  }

  return null;
}
