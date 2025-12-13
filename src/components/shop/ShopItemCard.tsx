import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, Coins, Flame, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShop, ShopItem } from "@/hooks/useShop";
import { cn } from "@/lib/utils";

interface ShopItemCardProps {
  item: ShopItem;
  index: number;
  onPreview?: (item: ShopItem) => void;
}

const RARITY_COLORS = {
  common: "from-slate-500/20 to-slate-600/20 border-slate-500/30",
  rare: "from-blue-500/20 to-blue-600/20 border-blue-500/30",
  epic: "from-purple-500/20 to-purple-600/20 border-purple-500/30",
  legendary: "from-amber-500/20 to-orange-500/20 border-amber-500/30",
};

const RARITY_GLOW = {
  common: "",
  rare: "shadow-blue-500/20",
  epic: "shadow-purple-500/30",
  legendary: "shadow-amber-500/40 shadow-lg",
};

const CATEGORY_ICONS: Record<string, string> = {
  theme: "🎨",
  streak_effect: "🔥",
  avatar: "👤",
  badge: "🏆",
  animation: "✨",
};

export function ShopItemCard({ item, index, onPreview }: ShopItemCardProps) {
  const { isOwned, canPurchase, purchaseItem, equipItem, unequipItem, inventory, userCoins, userStreak, isPurchasing } = useShop();
  const [showPurchaseEffect, setShowPurchaseEffect] = useState(false);

  const owned = isOwned(item.id);
  const purchasable = canPurchase(item);
  const inventoryItem = inventory?.find((inv) => inv.item_id === item.id);
  const isEquipped = inventoryItem?.is_equipped ?? false;
  const hasEnoughCoins = userCoins >= item.price;
  const meetsStreakReq = item.streak_requirement === 0 || userStreak >= item.streak_requirement;
  const isLocked = !meetsStreakReq;

  const handlePurchase = () => {
    if (!purchasable) return;
    setShowPurchaseEffect(true);
    purchaseItem(item);
    setTimeout(() => setShowPurchaseEffect(false), 1000);
  };

  const handleEquip = () => {
    if (isEquipped) {
      unequipItem(item.id);
    } else {
      equipItem({ itemId: item.id, category: item.category });
    }
  };

  const handlePreview = () => {
    onPreview?.(item);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "relative rounded-xl border bg-gradient-to-br p-3 overflow-hidden",
        RARITY_COLORS[item.rarity as keyof typeof RARITY_COLORS],
        RARITY_GLOW[item.rarity as keyof typeof RARITY_GLOW],
        isLocked && "opacity-60"
      )}
    >
      {/* Purchase Effect */}
      <AnimatePresence>
        {showPurchaseEffect && (
          <motion.div
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 3, opacity: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-primary/30 rounded-xl z-20"
          />
        )}
      </AnimatePresence>

      {/* Lock Overlay */}
      {isLocked && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-1 rounded-xl">
          <Lock className="w-5 h-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground text-center px-2">
            {item.streak_requirement}-day streak
          </span>
        </div>
      )}

      {/* Owned Badge */}
      {owned && (
        <div className="absolute top-2 right-2 z-10">
          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        </div>
      )}

      {/* Equipped Badge */}
      {isEquipped && (
        <div className="absolute top-2 left-2 z-10">
          <div className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
            ACTIVE
          </div>
        </div>
      )}

      {/* Icon */}
      <div className="text-3xl mb-2">
        {item.category === "avatar" && (item.metadata as any)?.emoji
          ? (item.metadata as any).emoji
          : CATEGORY_ICONS[item.category] || "🎁"}
      </div>

      {/* Info */}
      <h4 className="font-semibold text-sm truncate">{item.name}</h4>
      <p className="text-xs text-muted-foreground line-clamp-2 h-8 mt-1">
        {item.description}
      </p>

      {/* Price or Actions */}
      <div className="mt-3 space-y-1.5">
        {owned ? (
          <Button
            size="sm"
            variant={isEquipped ? "secondary" : "outline"}
            className="w-full h-8 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              handleEquip();
            }}
          >
            {isEquipped ? "Unequip" : "Equip"}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="default"
            className={cn(
              "w-full h-8 text-xs gap-1",
              !hasEnoughCoins && "opacity-50"
            )}
            onClick={(e) => {
              e.stopPropagation();
              handlePurchase();
            }}
            disabled={!purchasable || isPurchasing}
          >
            <Coins className="w-3 h-3" />
            {item.price}
            {item.streak_requirement > 0 && (
              <>
                <span className="text-muted-foreground">+</span>
                <Flame className="w-3 h-3" />
                {item.streak_requirement}d
              </>
            )}
          </Button>
        )}

        {/* Explicit preview button */}
        <Button
          size="sm"
          variant="ghost"
          className="w-full h-7 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            handlePreview();
          }}
        >
          👁 Preview
        </Button>
      </div>

      {/* Rarity Indicator */}
      {item.rarity === "legendary" && (
        <motion.div
          animate={{
            opacity: [0.5, 1, 0.5],
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute -top-1 -right-1"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
        </motion.div>
      )}
    </motion.div>
  );
}
