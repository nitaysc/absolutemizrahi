export interface Rank {
  name: string;
  minXP: number;
  color: string;
  bgColor: string;
  icon: string;
  glowColor: string;
}

export const RANKS: Rank[] = [
  { name: 'Wood', minXP: 0, color: 'text-amber-700', bgColor: 'bg-amber-900/30', icon: '🪵', glowColor: 'shadow-amber-700/30' },
  { name: 'Bronze', minXP: 100, color: 'text-orange-400', bgColor: 'bg-orange-900/30', icon: '🥉', glowColor: 'shadow-orange-400/30' },
  { name: 'Silver', minXP: 250, color: 'text-slate-300', bgColor: 'bg-slate-700/30', icon: '🥈', glowColor: 'shadow-slate-300/30' },
  { name: 'Gold', minXP: 500, color: 'text-yellow-400', bgColor: 'bg-yellow-900/30', icon: '🥇', glowColor: 'shadow-yellow-400/30' },
  { name: 'Platinum', minXP: 1000, color: 'text-cyan-300', bgColor: 'bg-cyan-900/30', icon: '💎', glowColor: 'shadow-cyan-300/30' },
  { name: 'Diamond', minXP: 1500, color: 'text-blue-400', bgColor: 'bg-blue-900/30', icon: '💠', glowColor: 'shadow-blue-400/30' },
  { name: 'Champion', minXP: 2500, color: 'text-purple-400', bgColor: 'bg-purple-900/30', icon: '🏆', glowColor: 'shadow-purple-400/30' },
  { name: 'Titan', minXP: 5000, color: 'text-rose-400', bgColor: 'bg-rose-900/30', icon: '⚡', glowColor: 'shadow-rose-400/30' },
  { name: 'Olympian', minXP: 10000, color: 'text-amber-300', bgColor: 'bg-gradient-to-r from-amber-900/30 to-orange-900/30', icon: '👑', glowColor: 'shadow-amber-300/50' },
];

export function getRankFromXP(xp: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXP) {
      return RANKS[i];
    }
  }
  return RANKS[0];
}

export function getNextRank(currentRank: Rank): Rank | null {
  const currentIndex = RANKS.findIndex(r => r.name === currentRank.name);
  if (currentIndex < RANKS.length - 1) {
    return RANKS[currentIndex + 1];
  }
  return null;
}

export function getProgressToNextRank(xp: number): { current: Rank; next: Rank | null; progress: number; xpNeeded: number } {
  const current = getRankFromXP(xp);
  const next = getNextRank(current);
  
  if (!next) {
    return { current, next: null, progress: 100, xpNeeded: 0 };
  }
  
  const xpInCurrentRank = xp - current.minXP;
  const xpToNextRank = next.minXP - current.minXP;
  const progress = Math.min(100, (xpInCurrentRank / xpToNextRank) * 100);
  const xpNeeded = next.minXP - xp;
  
  return { current, next, progress, xpNeeded };
}
