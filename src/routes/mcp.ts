// Disabled for initial production launch (SECURITY_NOTES.md §2).
// The /mcp endpoint is not required for the student/leader/administrator
// product and is blocked here to remove the reachable attack surface.
// To re-enable, restore the createTanStackMcpHandler-based implementation.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: () => new Response(null, { status: 404 }),
    },
  },
});
