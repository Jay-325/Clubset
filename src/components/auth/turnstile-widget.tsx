import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { loadTurnstileScript, turnstileSiteKey, type TurnstileApi } from "@/lib/security/turnstile";

export interface TurnstileWidgetHandle {
  /**
   * Discard the current token and request a fresh one.
   *
   * Turnstile tokens are single-use, so every submit attempt must start from a
   * new challenge -- especially a retry after a wrong password or a rejected
   * magic link, where reusing the previous token would be refused as a replay.
   */
  reset: () => void;
}

interface TurnstileWidgetProps {
  /** Called with the token, or `null` when it expires, errors or is reset. */
  onToken: (token: string | null) => void;
  theme?: "auto" | "light" | "dark";
  className?: string;
}

/**
 * Renders one Cloudflare Turnstile widget and hands its token to the form.
 *
 * Renders nothing when no site key is configured, so a project with captcha
 * turned off still works. It never decides whether a token is valid -- Supabase
 * does that server-side.
 */
export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken, theme = "auto", className }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const apiRef = useRef<TurnstileApi | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [failed, setFailed] = useState(false);

    const siteKey = turnstileSiteKey();

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          onToken(null);
          const api = apiRef.current;
          const widgetId = widgetIdRef.current;
          if (!api || !widgetId) return;
          try {
            api.reset(widgetId);
          } catch {
            // A widget removed by a remount: the effect below re-renders it.
          }
        },
      }),
      [onToken],
    );

    useEffect(() => {
      if (!siteKey) return;

      let cancelled = false;
      setFailed(false);

      void loadTurnstileScript()
        .then(() => {
          if (cancelled) return;
          const api = window.turnstile;
          const container = containerRef.current;
          if (!api || !container) {
            setFailed(true);
            onToken(null);
            return;
          }

          apiRef.current = api;
          widgetIdRef.current = api.render(container, {
            sitekey: siteKey,
            theme,
            callback: (token) => onToken(token),
            "expired-callback": () => onToken(null),
            "timeout-callback": () => onToken(null),
            "error-callback": () => {
              onToken(null);
              setFailed(true);
            },
          });
        })
        .catch(() => {
          if (cancelled) return;
          setFailed(true);
          onToken(null);
        });

      return () => {
        cancelled = true;
        const api = apiRef.current;
        const widgetId = widgetIdRef.current;
        if (api && widgetId) {
          try {
            api.remove(widgetId);
          } catch {
            // Already gone (SPA navigation racing the script): nothing to do.
          }
        }
        apiRef.current = null;
        widgetIdRef.current = null;
      };
    }, [siteKey, theme, onToken]);

    if (!siteKey) return null;

    return (
      <div className={cn("space-y-1", className)}>
        <div ref={containerRef} data-testid="turnstile-widget" className="flex justify-center" />
        {failed ? (
          <p role="alert" className="text-xs text-destructive">
            The human check could not load. Check your connection and reload the page.
          </p>
        ) : null}
      </div>
    );
  },
);
