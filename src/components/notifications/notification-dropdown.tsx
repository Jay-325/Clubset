"use client";

import { Bell, Clock, ArrowRightCircle } from "lucide-react";
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useMarkNotificationRead, useNotifications } from "@/lib/queries";
import type { NotificationRow } from "@/lib/types/database";

interface NotificationDropdownProps {
  /** Unread count for the bell badge. */
  unreadCount: number;
}

/**
 * Notification dropdown that opens on click of the bell icon.
 * Shows recent notifications with sender names, timestamps, and a "Mark All As Read" button.
 * Matches the dark mode aesthetic from the reference design.
 */
export function NotificationDropdown({ unreadCount }: NotificationDropdownProps) {
  const { data: notifications = [], isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Show up to 5 most recent notifications in the dropdown.
  const recent = notifications.slice(0, 5);

  const handleItemClick = (notification: NotificationRow) => {
    if (!notification.read_at) {
      void markRead.mutateAsync(notification.id);
    }
    if (notification.link_path) {
      void router.navigate({ to: notification.link_path });
    }
    setOpen(false);
  };

  const handleMarkAllRead = () => {
    recent.forEach((n) => {
      if (!n.read_at) {
        void markRead.mutateAsync(n.id);
      }
    });
    setOpen(false);
  };

  if (isLoading) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="relative h-12 w-12 flex items-center justify-center rounded-full bg-slate-800/50 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
            <Bell className="size-5" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 border border-slate-900 border-2 shadow-sm" />
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <div className="px-4 py-3 text-center text-xs text-slate-400">Loading…</div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu onOpenChange={setOpen} defaultOpen={open}>
      <DropdownMenuTrigger asChild>
        <button className="relative h-12 w-12 flex items-center justify-center rounded-full bg-slate-800/50 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
          <Bell className="size-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 border border-slate-900 border-2 shadow-sm" />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 p-2 bg-slate-900/90 backdrop-blur-md border border-slate-700 shadow-2xl">
        <DropdownMenuLabel className="px-3 py-2 text-xs font-bold text-slate-200 tracking-wider uppercase">
          Notifications
        </DropdownMenuLabel>
        {recent.length === 0 ? (
          <DropdownMenuItem className="px-3 py-3 text-center text-xs text-slate-500">
            No new notifications
          </DropdownMenuItem>
        ) : (
          <>
            {recent.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  "px-3 py-3 text-sm group cursor-pointer transition-all duration-150 border border-transparent rounded-xl",
                  !notification.read_at ? "bg-slate-800/30 border-slate-700/50" : "",
                  !notification.read_at ? "text-slate-200" : "text-slate-500",
                )}
                onClick={() => handleItemClick(notification)}
              >
                <div className="flex items-start gap-2">
                  <div className="notif-avatar mt-0.5 shrink-0">{notification.title.charAt(0)}</div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-xs font-bold leading-tight",
                        !notification.read_at ? "text-blue-400" : "text-slate-500",
                      )}
                    >
                      {notification.title}
                    </p>
                    {notification.body && (
                      <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">
                        {notification.body}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {new Date(notification.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="my-1 border-slate-700/50" />
            <DropdownMenuItem
              className="w-full px-3 py-2 text-sm text-blue-400 font-medium hover:bg-slate-800 transition-colors"
              onClick={handleMarkAllRead}
            >
              <Clock className="mr-2 size-4 shrink-0" />
              Mark All As Read
            </DropdownMenuItem>
            <DropdownMenuItem
              className="w-full px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
              onClick={() => {
                setOpen(false);
                void router.navigate({ to: "/notifications" });
              }}
            >
              <ArrowRightCircle className="mr-2 size-4 shrink-0" />
              View all notifications
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
