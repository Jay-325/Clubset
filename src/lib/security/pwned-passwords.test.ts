import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkPasswordAgainstHibp,
  rangeContainsSuffix,
  sha1Hex,
  splitSha1,
} from "./pwned-passwords.server";

const PASSWORD = "correct horse battery staple";
const HASH = "ABF7AAD6438836DBE526AA231ABDE2D0EEF74D42";
const PREFIX = "ABF7A";
const SUFFIX = "AD6438836DBE526AA231ABDE2D0EEF74D42";

function fakeResponse(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 503,
    text: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sha1Hex / splitSha1", () => {
  it("hashes locally and splits at the five-character HIBP prefix", () => {
    const hash = sha1Hex(PASSWORD);
    expect(hash).toBe(HASH);
    expect(splitSha1(hash)).toEqual({ prefix: PREFIX, suffix: SUFFIX });
  });
});

describe("checkPasswordAgainstHibp", () => {
  it("rejects a known breached password", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(`${SUFFIX}:42`));

    await expect(
      checkPasswordAgainstHibp(PASSWORD, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe("breached");
  });

  it("allows a password whose suffix is not in the range response", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:7"));

    await expect(
      checkPasswordAgainstHibp(PASSWORD, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe("not_found");
  });

  it("sends only the first five SHA-1 characters to HIBP", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeResponse(`${SUFFIX}:42`),
    );

    await checkPasswordAgainstHibp(PASSWORD, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;

    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(url).not.toContain(PASSWORD);
    expect(url).not.toContain(SUFFIX);
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
  });

  it("never logs or otherwise sends the plaintext password or full hash", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeResponse(`${SUFFIX}:42`),
    );
    const spies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
    ];

    await checkPasswordAgainstHibp(PASSWORD, { fetchImpl: fetchImpl as unknown as typeof fetch });

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }

    const serialized = JSON.stringify(fetchImpl.mock.calls);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain(HASH);
    expect(serialized).not.toContain(SUFFIX);
    // The prefix is the only password-derived data that leaves the process.
    expect(serialized).toContain(PREFIX);
  });

  it("fails closed when HIBP cannot be reached", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network unavailable");
    });

    await expect(
      checkPasswordAgainstHibp(PASSWORD, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe("unavailable");
  });

  it("fails closed on a non-2xx HIBP response", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse("upstream error", false));

    await expect(
      checkPasswordAgainstHibp(PASSWORD, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe("unavailable");
  });

  it("fails closed when the HIBP response body cannot be read", async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        text: async () => {
          throw new Error("stream failed");
        },
      } as unknown as Response;
    });

    await expect(
      checkPasswordAgainstHibp(PASSWORD, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe("unavailable");
  });

  it("fails closed when a 200 response is not a valid HIBP range body", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse("<!doctype html><html>blocked</html>"));

    await expect(
      checkPasswordAgainstHibp(PASSWORD, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe("unavailable");
  });

  it("fails closed on an empty 200 response", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(""));

    await expect(
      checkPasswordAgainstHibp(PASSWORD, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe("unavailable");
  });

  it("fails closed on timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    await expect(
      checkPasswordAgainstHibp(PASSWORD, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 5,
      }),
    ).resolves.toBe("unavailable");
  });
});

describe("rangeContainsSuffix", () => {
  it("ignores padded HIBP entries with a count of zero", () => {
    expect(rangeContainsSuffix(`${SUFFIX}:0`, SUFFIX)).toBe(false);
  });

  it("matches suffixes case-insensitively", () => {
    expect(rangeContainsSuffix(`${SUFFIX.toLowerCase()}:3`, SUFFIX)).toBe(true);
  });

  it("returns false for malformed input", () => {
    expect(rangeContainsSuffix("not a range response", SUFFIX)).toBeNull();
    expect(rangeContainsSuffix(`${SUFFIX}:1`, "not-a-suffix")).toBeNull();
  });
});
