import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The signed-in member's current handle, if any. */
export const getMyHandle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readMyHandle } = await import("./claim.server");
    return readMyHandle(context.userId);
  });

/**
 * Verified members: name-based handle options with live availability, widened
 * server-side until enough options are free. Requires auth so this can never
 * be used to enumerate other members' names or handles.
 */
export const getVerifiedHandleOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getVerifiedHandleOptionsFor } = await import("./claim.server");
    return getVerifiedHandleOptionsFor(context.userId);
  });

/** Claims a free handle for the signed-in member. */
export const claimHandle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ handle: z.string().max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    const { claimHandleFor } = await import("./claim.server");
    return claimHandleFor(context.userId, data.handle);
  });
