/**
 * Smoke test for the generated route tree: every public and authenticated route
 * the app links to must exist, and each must resolve to a component.
 */
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";

const EXPECTED = [
  "/",
  "/studio",
  "/batch",
  "/claim",
  "/contact",
  "/manifesto",
  "/privacy",
  "/terms",
  "/hub",
  "/go",
  "/card",
  "/auth",
  "/en",
  "/nl",
  "/self-hosting",
  "/sovereignty",
  "/s/$slug",
  "/r/$username",
  "/u/$username",
  "/stats/$token",
  "/$username",
  "/_authenticated/dashboard",
  "/_authenticated/settings",
  "/_authenticated/admin",
];

function collect(route: any, acc: string[] = []): string[] {
  if (route.id) acc.push(route.id);
  // The generated tree stores children as an array on some routes and as a
  // record keyed by route name on others.
  const children = route.children ?? [];
  for (const child of Array.isArray(children) ? children : Object.values(children)) {
    collect(child, acc);
  }
  return acc;
}

describe("route tree", () => {
  const ids = collect(routeTree as any);

  it("registers every expected route", () => {
    for (const id of EXPECTED) {
      expect(ids, `missing route ${id}`).toContain(id);
    }
  });

  it("has no duplicate route ids", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });
});
