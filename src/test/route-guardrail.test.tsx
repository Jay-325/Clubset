import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { managementSections, quickActions, type ClubContext } from "@/lib/auth/permissions";
import { ALL_PERMISSIONS } from "@/lib/domain";

/**
 * Guardrail: every destination produced by `managementSections` and
 * `quickActions` must correspond to a real route file.
 *
 * Route files are discovered from the filesystem (TanStack Router's
 * file-based routing is the source of truth), so this test updates
 * automatically when routes are added or removed instead of relying on a
 * hand-maintained list that can go stale.
 */
const ROUTES_DIR = path.resolve(process.cwd(), "src/routes");
const CLUB_ID = "00000000-0000-0000-0000-000000000000";
const PARAM = "__param__";

function discoverRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...discoverRouteFiles(full));
    } else if (entry.name.endsWith(".tsx") && entry.name !== "__root.tsx") {
      files.push(full);
    }
  }
  return files;
}

/** Derive a TanStack Router path from a route filename. */
function fileToRoutePath(file: string): string | null {
  const relative = path.relative(ROUTES_DIR, file);
  const parts = relative.split(path.sep);
  const last = parts[parts.length - 1];
  if (!last) {
    return null;
  }
  const isIndex = last === "index.tsx";
  const segments = parts.slice(0, -1);
  if (!isIndex) {
    segments.push(last.replace(/\.tsx$/, ""));
  }
  if (segments.length === 0) {
    return "/";
  }
  return "/" + segments.join("/");
}

function normalize(routePath: string): string {
  let p = routePath.split("?")[0] ?? ""; // drop query string (?new=1, ?new=expense)
  p = p.replace(/\$[^/]+/g, PARAM); // normalise $clubId and other dynamic segments
  p = p.replace(new RegExp(CLUB_ID, "g"), PARAM); // normalise the dummy club id used in tests
  return p;
}

const REGISTERED = new Set<string>();
for (const file of discoverRouteFiles(ROUTES_DIR)) {
  const routePath = fileToRoutePath(file);
  if (routePath !== null) {
    REGISTERED.add(normalize(routePath));
  }
}

/** Context with every permission so no section/action is filtered out. */
const context = {
  club: { id: CLUB_ID },
  membership: null,
  permissions: [...ALL_PERMISSIONS],
  isAdministrator: false,
  isLinkedAdministrator: false,
} as ClubContext;

describe("route-path guardrail", () => {
  it("every management-section destination is a real route", () => {
    for (const section of managementSections(context)) {
      expect(REGISTERED.has(normalize(section.path))).toBe(true);
    }
  });

  it("every quick-action destination is a real route", () => {
    for (const action of quickActions(context)) {
      expect(REGISTERED.has(normalize(action.path))).toBe(true);
    }
  });

  it("rejects a non-existent destination", () => {
    // Proves the set membership check is meaningful: a made-up path is not a route.
    expect(REGISTERED.has(`/clubs/${PARAM}/does-not-exist`)).toBe(false);
  });
});
