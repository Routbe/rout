import { z } from "zod";

/**
 * Fail fast with a readable message when the browser bundle is built without
 * its backend configuration, instead of crashing deep inside the client.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL must be a valid URL"),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "VITE_SUPABASE_PUBLISHABLE_KEY is required"),
});

const parsed = schema.safeParse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `• ${i.message}`).join("\n");
  console.error(`[env] Invalid environment configuration:\n${issues}`);
}

export const env = parsed.success ? parsed.data : null;
export const envErrors = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
