import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Development bootstrap probe: reports whether the platform still has no
 * administrator. Returns a single boolean and no PII, so it is safe to call
 * from the public sign-in screen.
 */
export const getBootstrapState = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    return { needsFirstAdmin: (count ?? 0) === 0 };
  } catch {
    return { needsFirstAdmin: false };
  }
});

/**
 * Public handle availability probe used by the onboarding form.
 * The client debounces (400 ms); this adds a coarse server-side throttle so a
 * scripted caller cannot turn the field into a username enumeration firehose.
 */
export const checkHandleAvailability = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ handle: z.string().max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { isHandleFree, normalizeHandle, throttle } = await import("./onboarding.server");

    const normalized = normalizeHandle(data.handle);
    if (!throttle(normalized)) {
      return { ok: false as const, normalized, reason: "Too many checks — slow down a moment." };
    }
    return isHandleFree(normalized);
  });

/** Turns a full legal name into a free, suggested handle. */
export const suggestHandleForName = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ fullName: z.string().max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { suggestFreeHandle } = await import("./onboarding.server");
    return { handle: await suggestFreeHandle(data.fullName) };
  });

/*
 * NOTE: the former `createTestSuperAdmin` shortcut was removed on purpose.
 * It was an unauthenticated server function that minted a confirmed account
 * with a fixed password and granted it the `admin` role, guarded only by
 * `NODE_ENV`. Admin access is granted exclusively through `user_roles`.
 */

