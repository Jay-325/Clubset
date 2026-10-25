import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, errorResult } from "../supabase";

export default defineTool({
  name: "list_my_clubs",
  title: "List my clubs",
  description:
    "List the clubs the signed-in student belongs to or has applied to, with membership status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("memberships")
      .select("status, joined_at, clubs(id, name, description, room, meeting_day, meeting_time)")
      .eq("user_id", ctx.getUserId()!);
    if (error) return errorResult(error.message);
    const clubs = (data ?? []).map((m: any) => ({
      id: String(m.clubs?.id ?? ""),
      name: String(m.clubs?.name ?? ""),
      description: String(m.clubs?.description ?? ""),
      room: String(m.clubs?.room ?? ""),
      meeting_day: m.clubs?.meeting_day ? String(m.clubs.meeting_day) : null,
      meeting_time: m.clubs?.meeting_time ? String(m.clubs.meeting_time) : null,
      status: String(m.status),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(clubs) }],
      structuredContent: { clubs },
    };
  },
});
