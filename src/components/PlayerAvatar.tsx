import { cn } from "@/lib/utils";

/**
 * Renders a player avatar. Supports two storage formats stored in
 * `profiles.avatar` (and snapshotted into `bj_seats.avatar` /
 * `poker_seats.avatar`):
 *
 *   - A single emoji glyph (legacy / fallback), e.g. "🎰"
 *   - A public URL to an uploaded image in the `avatars` bucket, e.g.
 *     "https://…/storage/v1/object/public/avatars/<uid>/<file>.jpg"
 */
export function PlayerAvatar({
  avatar,
  size = 24,
  className,
  ring = false,
}: {
  avatar?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const a = (avatar ?? "🎰") || "🎰";
  const isImage = /^https?:\/\//i.test(a);
  const dim = { width: size, height: size };
  const base =
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-background select-none";
  const ringCls = ring ? "ring-2 ring-primary/40" : "";

  if (isImage) {
    return (
      <img
        src={a}
        alt=""
        style={dim}
        loading="lazy"
        className={cn(base, "object-cover", ringCls, className)}
      />
    );
  }
  return (
    <span
      style={{ ...dim, fontSize: Math.round(size * 0.7), lineHeight: 1 }}
      className={cn(base, ringCls, className)}
      aria-hidden
    >
      {a}
    </span>
  );
}