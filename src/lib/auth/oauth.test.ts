import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CANONICAL_APP_ORIGIN,
  emailRedirectUrl,
  oauthErrorMessage,
  oauthRedirectUrl,
  parseOAuthError,
  readOAuthError,
  removeOAuthErrorParams,
} from "./oauth";

describe("oauthRedirectUrl", () => {
  it("returns the /login URL for an origin", () => {
    expect(oauthRedirectUrl("https://clubset.lovable.app")).toBe(
      "https://clubset.lovable.app/login",
    );
  });

  it("does not double the slash when the origin has a trailing one", () => {
    expect(oauthRedirectUrl("https://clubset.lovable.app/")).toBe(
      "https://clubset.lovable.app/login",
    );
  });

  it("works for a development origin (Supabase accepts it too)", () => {
    expect(oauthRedirectUrl("http://localhost:8080")).toBe("http://localhost:8080/login");
  });

  it("falls back to window.location.origin when no origin is given", () => {
    // jsdom serves the tests from this origin.
    expect(oauthRedirectUrl()).toBe(`${window.location.origin}/login`);
  });
});

describe("emailRedirectUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the canonical production origin", () => {
    expect(CANONICAL_APP_ORIGIN).toBe("https://clubset.vercel.app");
    expect(emailRedirectUrl("https://clubset.vercel.app")).toBe("https://clubset.vercel.app/login");
  });

  it("normalises a trailing slash", () => {
    expect(emailRedirectUrl("https://clubset.vercel.app/")).toBe(
      "https://clubset.vercel.app/login",
    );
  });

  it("rejects an origin that is not on the allow-list", () => {
    expect(emailRedirectUrl("https://evil.example.com")).toBe("https://clubset.vercel.app/login");
    expect(emailRedirectUrl("http://localhost:3000")).toBe("https://clubset.vercel.app/login");
  });

  it("accepts an origin explicitly listed for local or preview testing", () => {
    vi.stubEnv("VITE_AUTH_REDIRECT_ORIGINS", "http://127.0.0.1:8080, https://preview.example");

    expect(emailRedirectUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080/login");
    expect(emailRedirectUrl("https://preview.example")).toBe("https://preview.example/login");
    // Listing one origin does not open the door to any other.
    expect(emailRedirectUrl("https://other.example")).toBe("https://clubset.vercel.app/login");
  });

  it("falls back to the canonical origin when the page origin is unlisted", () => {
    // jsdom serves the tests from an origin the hosted allow-list does not have.
    expect(emailRedirectUrl()).toBe("https://clubset.vercel.app/login");
  });
});

describe("parseOAuthError", () => {
  it("reads an error from the query string (PKCE-style return)", () => {
    expect(parseOAuthError("?error=access_denied&error_description=User+denied+access")).toEqual({
      code: "access_denied",
      description: "User denied access",
      errorCode: null,
    });
  });

  it("reads an error from the fragment (implicit-style return)", () => {
    expect(parseOAuthError("#error=access_denied")).toEqual({
      code: "access_denied",
      description: null,
      errorCode: null,
    });
  });

  it("keeps GoTrue's machine-readable error code", () => {
    expect(parseOAuthError("#error=access_denied&error_code=otp_expired")).toEqual({
      code: "access_denied",
      description: null,
      errorCode: "otp_expired",
    });
  });

  it("accepts a bare query string without the leading marker", () => {
    expect(parseOAuthError("error=server_error")?.code).toBe("server_error");
  });

  it("ignores a successful implicit-flow payload", () => {
    expect(parseOAuthError("#access_token=abc&refresh_token=def&type=magiclink")).toBeNull();
  });

  it("ignores an ordinary query string", () => {
    expect(parseOAuthError("?next=/clubs&tab=student")).toBeNull();
  });

  it("ignores empty input", () => {
    expect(parseOAuthError("")).toBeNull();
  });
});

describe("oauthErrorMessage", () => {
  it("treats a cancelled chooser as a cancellation, not a failure", () => {
    expect(oauthErrorMessage({ code: "access_denied", description: "x" })).toContain("cancelled");
  });

  it("explains a temporary outage", () => {
    expect(oauthErrorMessage({ code: "temporarily_unavailable", description: null })).toContain(
      "temporarily unavailable",
    );
  });

  it("falls back to a generic message for unknown codes", () => {
    const message = oauthErrorMessage({ code: "invalid_request", description: "leaky detail" });
    expect(message).toContain("didn't complete");
  });

  it("never echoes the provider description", () => {
    const message = oauthErrorMessage({
      code: "access_denied",
      description: "OAuthAccountNotLinked: account belongs to another provider",
    });
    expect(message).not.toContain("OAuthAccountNotLinked");
    expect(message).not.toContain("provider");
  });
});

describe("removeOAuthErrorParams", () => {
  it("strips error parameters but keeps the rest of the query string", () => {
    expect(
      removeOAuthErrorParams("https://clubset.lovable.app/login?next=/clubs&error=access_denied"),
    ).toBe("https://clubset.lovable.app/login?next=%2Fclubs");
  });

  it("removes the fragment entirely when it only carried an error", () => {
    expect(
      removeOAuthErrorParams("https://clubset.lovable.app/login#error=access_denied&error_code=403"),
    ).toBe("https://clubset.lovable.app/login");
  });

  it("leaves a successful implicit-flow fragment untouched", () => {
    const href =
      "https://clubset.lovable.app/login#access_token=abc.def.ghi&expires_in=3600&token_type=bearer";
    expect(removeOAuthErrorParams(href)).toBe(href);
  });

  it("leaves a clean URL untouched", () => {
    const href = "https://clubset.lovable.app/login";
    expect(removeOAuthErrorParams(href)).toBe(href);
  });
});

describe("readOAuthError", () => {
  it("prefers the query string", () => {
    expect(
      readOAuthError({ search: "?error=access_denied", hash: "#error=server_error" })?.code,
    ).toBe("access_denied");
  });

  it("falls through to the fragment", () => {
    expect(readOAuthError({ search: "", hash: "#error=server_error" })?.code).toBe("server_error");
  });

  it("returns null on a normal visit", () => {
    expect(readOAuthError({ search: "", hash: "" })).toBeNull();
  });
});
