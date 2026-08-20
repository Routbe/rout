import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ProfileBlock, ProfileRecord } from "@/lib/profile";

/** Loads a public profile by handle. Returns null when the handle is unclaimed. */
export function useProfileRecord(username: string) {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // The profiles table is not publicly readable; this security-definer
      // function returns only the columns meant for a public profile page.
      const { data } = await supabase.rpc("get_public_profile" as never, {
        _username: username.toLowerCase(),
      } as never);
      if (cancelled) return;
      const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { blocks?: unknown }>;
      const row = rows[0] ?? null;
      setSuspended(Boolean(row?.["is_suspended"]));
      setProfile(
        row
          ? ({
              ...row,
              blocks: Array.isArray(row.blocks) ? (row.blocks as unknown as ProfileBlock[]) : [],
            } as unknown as ProfileRecord)
          : null,
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  return { profile, suspended, loading };
}
