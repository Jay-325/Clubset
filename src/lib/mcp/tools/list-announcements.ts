import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, errorResult } from "../supabase";

export default defineTool({
  name: "list_announcements",
  title: "List club announcements",
  description: "List recent announcements for a club the signed-in user can see.",
  inputSchema: {
    club_id: z.string().uuid().describe("Club to read announcements from."),
    limit: z.number().int().min(1).max(50).optional().describe("Max items (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ club_id, limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("announcements")
      .select("id, title, body, pinned, created_at")
      .eq("club_id", club_id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (error) return errorResult(error.message);
    const announcements = (data ?? []).map((a: any) => ({
      id: String(a.id),
      title: String(a.title),
      body: String(a.body ?? ""),
      pinned: Boolean(a.pinned),
      created_at: String(a.created_at),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(announcements) }],
      structuredContent: { announcements },
    };
  },
});
