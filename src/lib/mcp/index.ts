import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMyClubs from "./tools/list-my-clubs";
import listUpcomingEvents from "./tools/list-upcoming-events";
import listAnnouncements from "./tools/list-announcements";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "clubset",
  title: "Clubset",
  version: "0.1.0",
  instructions:
    "Read-only tools for Clubset, a school club app. Use list_my_clubs to find the user's clubs, then list_upcoming_events or list_announcements with a club id.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listMyClubs, listUpcomingEvents, listAnnouncements],
});
