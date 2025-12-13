-- Add streak_shields column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN streak_shields integer DEFAULT 0;

-- Add is_limited_time and available_until columns to shop_items for rotating items
ALTER TABLE public.shop_items 
ADD COLUMN is_limited_time boolean DEFAULT false,
ADD COLUMN available_until timestamp with time zone DEFAULT null;

-- Insert Streak Shield item into shop
INSERT INTO public.shop_items (name, description, category, price, rarity, metadata)
VALUES (
  'Streak Shield',
  'Protects your streak from one missed day. Use it wisely!',
  'utility',
  150,
  'rare',
  '{"emoji": "🛡️", "type": "consumable"}'::jsonb
);