import { supabase } from "@/integrations/supabase/client";

export type BadgeRarity = "artifact" | "common" | "uncommon" | "rare" | "epic";

export interface BadgeDef {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sort_order: number;
  rarity?: BadgeRarity | null;
  max_supply?: number | null;
}

export interface UnlockedBadge extends BadgeDef {
  awarded_at: string | null;
  serial_number?: number | null;
}

/** The badge tables are optional infrastructure — a missing table must never break a profile. */
type LooseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }>;
      eq: (col: string, value: string) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

const loose = () => supabase as unknown as LooseClient;

const BASE_BADGE_COLS = "id, slug, name, description, icon, color, sort_order";
const RICH_BADGE_COLS = `${BASE_BADGE_COLS}, rarity, max_supply`;

export async function fetchBadgeCatalogue(): Promise<BadgeDef[]> {
  for (const cols of [RICH_BADGE_COLS, BASE_BADGE_COLS]) {
    try {
      const { data, error } = await loose()
        .from("badges")
        .select(cols)
        .order("sort_order", { ascending: true });
      if (error) continue;
      if (Array.isArray(data)) return data as BadgeDef[];
    } catch {
      /* try the narrower projection */
    }
  }
  return [];
}

/** Badges a specific user has unlocked, in catalogue order. */
export async function fetchUserBadges(userId: string): Promise<UnlockedBadge[]> {
  const projections = [
    `awarded_at, serial_number, badges(${RICH_BADGE_COLS})`,
    `awarded_at, badges(${BASE_BADGE_COLS})`,
  ];
  for (const cols of projections) {
    try {
      const { data, error } = await loose().from("user_badges").select(cols).eq("user_id", userId);
      if (error || !Array.isArray(data)) continue;
      return (
        data as {
          awarded_at: string | null;
          serial_number?: number | null;
          badges: BadgeDef | null;
        }[]
      )
        .filter((r) => r.badges)
        .map((r) => ({
          ...(r.badges as BadgeDef),
          awarded_at: r.awarded_at,
          serial_number: r.serial_number ?? null,
        }))
        .sort((a, b) => a.sort_order - b.sort_order);
    } catch {
      /* try the narrower projection */
    }
  }
  return [];
}

/** "#00012" reads like a certificate; plain numbers read like a database id. */
export function formatSerial(serial?: number | null): string | null {
  if (!serial || serial < 1) return null;
  return `#${String(serial).padStart(5, "0")}`;
}
