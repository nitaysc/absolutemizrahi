export function formatCoins(n: number | bigint): string {
  const num = typeof n === "bigint" ? Number(n) : n;
  return new Intl.NumberFormat("en-US").format(Math.floor(num));
}