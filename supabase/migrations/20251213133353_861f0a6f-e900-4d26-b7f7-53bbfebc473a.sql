-- Add coins column to profiles for user balance
ALTER TABLE public.profiles ADD COLUMN coins integer DEFAULT 0;

-- Create shop items catalog
CREATE TABLE public.shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL, -- 'theme', 'streak_effect', 'avatar', 'badge', 'animation', 'prestige'
  name text NOT NULL,
  description text,
  price integer NOT NULL DEFAULT 0,
  streak_requirement integer DEFAULT 0, -- For prestige items
  metadata jsonb DEFAULT '{}'::jsonb, -- Store item-specific data (colors, animation type, etc.)
  rarity text DEFAULT 'common', -- 'common', 'rare', 'epic', 'legendary'
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on shop_items
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

-- Anyone can view shop items
CREATE POLICY "Anyone can view shop items"
ON public.shop_items
FOR SELECT
USING (true);

-- Create user inventory (purchases)
CREATE TABLE public.user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  purchased_at timestamp with time zone DEFAULT now(),
  is_equipped boolean DEFAULT false,
  UNIQUE(user_id, item_id)
);

-- Enable RLS on user_inventory
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

-- Users can view own inventory
CREATE POLICY "Users can view own inventory"
ON public.user_inventory
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert to own inventory (purchase)
CREATE POLICY "Users can purchase items"
ON public.user_inventory
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update own inventory (equip/unequip)
CREATE POLICY "Users can update own inventory"
ON public.user_inventory
FOR UPDATE
USING (auth.uid() = user_id);

-- Create coin transactions log for tracking earnings
CREATE TABLE public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL, -- 'task_complete', 'daily_bonus', 'streak_bonus', 'milestone', 'purchase'
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on coin_transactions
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view own transactions
CREATE POLICY "Users can view own transactions"
ON public.coin_transactions
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert own transactions
CREATE POLICY "Users can insert own transactions"
ON public.coin_transactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Seed shop items
INSERT INTO public.shop_items (category, name, description, price, streak_requirement, metadata, rarity) VALUES
-- Themes 🎨
('theme', 'Crimson Fire', 'Deep red accent with warm glows', 150, 0, '{"color": "0 84% 60%", "name": "crimson"}', 'common'),
('theme', 'Royal Purple', 'Elegant purple with cosmic vibes', 200, 0, '{"color": "270 70% 60%", "name": "purple"}', 'common'),
('theme', 'Neon Surge', 'Electric green cyberpunk style', 300, 0, '{"color": "142 76% 50%", "name": "neon"}', 'rare'),
('theme', 'Ice Crystal', 'Cool blue with frosty accents', 250, 0, '{"color": "200 80% 60%", "name": "ice"}', 'rare'),
('theme', 'Golden Hour', 'Warm gold luxury aesthetic', 500, 7, '{"color": "45 90% 55%", "name": "gold"}', 'epic'),
('theme', 'Void Black', 'Pure darkness with subtle glows', 800, 14, '{"color": "0 0% 10%", "name": "void"}', 'legendary'),

-- Streak Effects 🔥
('streak_effect', 'Electric Flame', 'Crackling lightning fire effect', 200, 0, '{"type": "electric"}', 'common'),
('streak_effect', 'Galaxy Blaze', 'Cosmic stars within the flame', 400, 7, '{"type": "galaxy"}', 'rare'),
('streak_effect', 'Inferno Storm', 'Intense raging fire animation', 600, 14, '{"type": "inferno"}', 'epic'),
('streak_effect', 'Phoenix Rise', 'Legendary rebirth flame', 1000, 30, '{"type": "phoenix"}', 'legendary'),

-- Avatars & Badges 🏆
('avatar', 'Consistency Rookie', 'Just getting started', 0, 0, '{"emoji": "🌱"}', 'common'),
('avatar', 'Focus Beast', 'Dominating daily tasks', 300, 7, '{"emoji": "🦁"}', 'rare'),
('avatar', 'Discipline Demon', 'Unstoppable force', 600, 21, '{"emoji": "😈"}', 'epic'),
('avatar', 'Streak Legend', 'Master of consistency', 1000, 30, '{"emoji": "👑"}', 'legendary'),
('badge', 'Early Bird', 'Complete tasks before noon', 150, 0, '{"icon": "sunrise"}', 'common'),
('badge', 'Night Owl', 'Late night productivity', 150, 0, '{"icon": "moon"}', 'common'),
('badge', 'Iron Will', 'Never skip a day', 500, 14, '{"icon": "shield"}', 'epic'),
('badge', 'Time Lord', 'Master of schedules', 800, 21, '{"icon": "clock"}', 'legendary'),

-- Task Animations ✨
('animation', 'Confetti Burst', 'Colorful celebration particles', 100, 0, '{"type": "confetti"}', 'common'),
('animation', 'Pulse Glow', 'Satisfying pulse effect', 150, 0, '{"type": "pulse"}', 'common'),
('animation', 'Shockwave Ring', 'Expanding ring animation', 250, 0, '{"type": "shockwave"}', 'rare'),
('animation', 'Starburst', 'Explosive star particles', 400, 7, '{"type": "starburst"}', 'epic'),
('animation', 'Aurora Wave', 'Northern lights sweep', 700, 14, '{"type": "aurora"}', 'legendary');