import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Deterministic daily rotation based on date
function getDailyItemIndices(date: string, totalItems: number, count: number): number[] {
  // Simple hash from date string
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    hash = ((hash << 5) - hash) + date.charCodeAt(i);
    hash = hash & hash;
  }
  
  const indices: number[] = [];
  let seed = Math.abs(hash);
  
  while (indices.length < count && indices.length < totalItems) {
    const index = seed % totalItems;
    if (!indices.includes(index)) {
      indices.push(index);
    }
    seed = Math.floor(seed / 7) + (seed % 13) * 11 + 1;
  }
  
  return indices;
}

export function useLimitedTimeItems() {
  const today = new Date().toISOString().split('T')[0];

  const { data: limitedItems = [], isLoading } = useQuery({
    queryKey: ["limited-time-items", today],
    queryFn: async () => {
      // Fetch all shop items
      const { data: allItems } = await supabase
        .from("shop_items")
        .select("*")
        .order("price", { ascending: true });

      if (!allItems || allItems.length === 0) return [];

      // Select 2-3 items for today's rotation
      const itemCount = Math.min(3, allItems.length);
      const todayIndices = getDailyItemIndices(today, allItems.length, itemCount);
      
      return todayIndices.map((index) => ({
        ...allItems[index],
        isLimitedTime: true,
        // Calculate discount (10-30% off)
        discountPercent: 10 + (Math.abs(index * 7) % 21),
      }));
    },
  });

  // Calculate time remaining until midnight
  const getTimeRemaining = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight.getTime() - now.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { hours, minutes };
  };

  return {
    limitedItems,
    isLoading,
    getTimeRemaining,
  };
}
