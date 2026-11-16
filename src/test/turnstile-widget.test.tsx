import { createRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The script loader is mocked so a failing network can be simulated without
// jsdom ever firing a script "error" event. The site key is mocked so the
// "captcha disabled" build can be rendered too.
const mockLoadScript = vi.hoisted(() => vi.fn());
const mockSiteKey = vi.hoisted(() => vi.fn(() => "test-site-key"));

vi.mock("@/lib/security/turnstile", () => ({
  turnstileSiteKey: mockSiteKey,
  loadTurnstileScript: mockLoadScript,
}));

import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/auth/turnstile-widget";

interface RenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  "error-callback"?: () => void;
}

function installTurnstile() {
  const options: { current: RenderOptions | null } = { current: null };
  const api = {
    render: vi.fn((_container: HTMLElement, renderOptions: RenderOptions) => {
      options.current = renderOptions;
      return "widget-1";
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  (window as unknown as { turnstile?: typeof api }).turnstile = api;
  return { api, options };
}

function renderWidget() {
  const onToken = vi.fn();
  const ref = createRef<TurnstileWidgetHandle>();
  render(<TurnstileWidget ref={ref} onToken={onToken} />);
  return { onToken, ref };
}

describe("TurnstileWidget", () => {
  beforeEach(() => {
    mockSiteKey.mockReturnValue("test-site-key");
    mockLoadScript.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    delete (window as unknown as { turnstile?: unknown }).turnstile;
  });

  it("renders nothing when no site key is configured", () => {
    mockSiteKey.mockReturnValue("");

    renderWidget();

    expect(screen.queryByTestId("turnstile-widget")).toBeNull();
    expect(mockLoadScript).not.toHaveBeenCalled();
  });

  it("forwards the token the widget produces", async () => {
    const { api, options } = installTurnstile();
    const { onToken } = renderWidget();

    await waitFor(() => expect(api.render).toHaveBeenCalled());
    expect(api.render.mock.calls[0]?.[1].sitekey).toBe("test-site-key");

    options.current?.callback?.("token-123");

    expect(onToken).toHaveBeenCalledWith("token-123");
  });

  it("clears the token when the challenge expires", async () => {
    const { api, options } = installTurnstile();
    const { onToken } = renderWidget();

    await waitFor(() => expect(api.render).toHaveBeenCalled());
    options.current?.["expired-callback"]?.();

    expect(onToken).toHaveBeenCalledWith(null);
  });

  it("clears the token when the challenge times out", async () => {
    const { api, options } = installTurnstile();
    const { onToken } = renderWidget();

    await waitFor(() => expect(api.render).toHaveBeenCalled());
    options.current?.["timeout-callback"]?.();

    expect(onToken).toHaveBeenCalledWith(null);
  });

  it("clears the token and asks for a fresh challenge on reset", async () => {
    const { api } = installTurnstile();
    const { onToken, ref } = renderWidget();

    await waitFor(() => expect(api.render).toHaveBeenCalled());
    onToken.mockClear();

    ref.current?.reset();

    expect(onToken).toHaveBeenCalledWith(null);
    expect(api.reset).toHaveBeenCalledWith("widget-1");
  });

  it("shows a retry control when the script cannot load", async () => {
    mockLoadScript.mockRejectedValue(new Error("blocked"));
    installTurnstile();
    const { onToken } = renderWidget();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    expect(onToken).toHaveBeenCalledWith(null);
  });

  it("retries without a page reload and renders the widget once the script loads", async () => {
    mockLoadScript.mockRejectedValueOnce(new Error("blocked")).mockResolvedValue(undefined);
    const { api } = installTurnstile();
    renderWidget();

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(mockLoadScript).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(mockLoadScript).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("falls back to the retry control when the widget itself throws while rendering", async () => {
    const { api } = installTurnstile();
    api.render.mockImplementation(() => {
      throw new Error("turnstile error 300030");
    });
    const { onToken } = renderWidget();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    expect(onToken).toHaveBeenCalledWith(null);
  });
});
