// Curated set of player avatars. Stored as plain emoji strings in the
// profiles table so they trivially serialize through any RPC / realtime
// payload and render identically across devices without extra assets.
export const AVATAR_OPTIONS = [
  "🎰","🃏","♠️","♥️","♦️","♣️","🎲","💎",
  "👑","🦁","🐉","🦊","🐯","🐺","🦅","🦈",
  "🤠","🥷","🧙","🧛","🤖","👾","👽","💀",
  "🔥","⚡","🌟","🍀","💰","🎯","🏆","🚀",
] as const;

export type Avatar = (typeof AVATAR_OPTIONS)[number] | string;
export const DEFAULT_AVATAR = "🎰";
