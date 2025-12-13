import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  const { shopItems, inventory, userCoins, userStreak, loading, isOwned, canPurchase } = useShop();
  const [activeCategory, setActiveCategory] = useState("all");

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
                  <ItemSection title="✨ Legendary" items={groupedItems.legendary} />
                )}

                {/* Epic Items */}
                {groupedItems.epic.length > 0 && (
                  <ItemSection title="💜 Epic" items={groupedItems.epic} />
                )}

                {/* Rare Items */}
                {groupedItems.rare.length > 0 && (
                  <ItemSection title="💙 Rare" items={groupedItems.rare} />
                )}

                {/* Common Items */}
                {groupedItems.common.length > 0 && (
                  <ItemSection title="Common" items={groupedItems.common} />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ItemSection({ title, items }: { title: string; items: ShopItem[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item, index) => (
          <ShopItemCard key={item.id} item={item} index={index} />
        ))}
      </div>
    </motion.div>
  );
}
