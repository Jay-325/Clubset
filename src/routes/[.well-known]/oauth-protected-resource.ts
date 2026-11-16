// Disabled for initial production launch (SECURITY_NOTES.md §2).
// The OAuth protected resource endpoint is part of the /mcp discovery
// mechanism. Since /mcp is blocked, this endpoint is also blocked.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      ANY: () => new Response(null, { status: 404 }),
    },
  },
});
