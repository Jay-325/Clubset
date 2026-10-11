import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, errorResult } from "../supabase";

export default defineTool({
  name: "list_upcoming_events",
  title: "List upcoming events",
  description: "List upcoming club events the signed-in user can see, optionally for one club.",
  inputSchema: {
    club_id: z.string().uuid().optional().describe("Only events for this club."),
    limit: z.number().int().min(1).max(100).optional().describe("Max events (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ club_id, limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("events")
      .select("id, club_id, title, description, location, starts_at, ends_at")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at")
      .limit(limit ?? 20);
    if (club_id) q = q.eq("club_id", club_id);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    const events = (data ?? []).map((e: any) => ({
      id: String(e.id),
      club_id: String(e.club_id),
      title: String(e.title),
      description: String(e.description ?? ""),
      location: String(e.location ?? ""),
      starts_at: String(e.starts_at),
      ends_at: String(e.ends_at),
    }));
    return { content: [{ type: "text", text: JSON.stringify(events) }], structuredContent: { events } };
  },
});
