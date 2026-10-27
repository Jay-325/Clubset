import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPasswordNotBreached: vi.fn(),
}));

vi.mock("./pwned-passwords.functions", () => ({
  checkPasswordNotBreached: mocks.checkPasswordNotBreached,
}));

import {
  assertPasswordNotBreached,
  BREACHED_PASSWORD_MESSAGE,
  PASSWORD_CHECK_UNAVAILABLE_MESSAGE,
} from "./passwords";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("assertPasswordNotBreached", () => {
  it("rejects a password that the server reports as breached", async () => {
    mocks.checkPasswordNotBreached.mockResolvedValue({ status: "checked", breached: true });

    await expect(assertPasswordNotBreached("password")).rejects.toThrow(BREACHED_PASSWORD_MESSAGE);
  });

  it("allows a password that is not in the breached dataset", async () => {
    mocks.checkPasswordNotBreached.mockResolvedValue({ status: "checked", breached: false });

    await expect(assertPasswordNotBreached("a-long-unique-passphrase")).resolves.toBeUndefined();
    expect(mocks.checkPasswordNotBreached).toHaveBeenCalledWith({
      data: { password: "a-long-unique-passphrase" },
    });
  });

  it("fails closed when the check is unavailable", async () => {
    mocks.checkPasswordNotBreached.mockResolvedValue({ status: "unavailable" });

    await expect(assertPasswordNotBreached("password")).rejects.toThrow(
      PASSWORD_CHECK_UNAVAILABLE_MESSAGE,
    );
  });

  it("fails closed and hides transport errors when the server call throws", async () => {
    const consoleSpies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
    ];
    mocks.checkPasswordNotBreached.mockRejectedValue(new Error("sensitive internals"));

    await expect(assertPasswordNotBreached("password")).rejects.toThrow(
      PASSWORD_CHECK_UNAVAILABLE_MESSAGE,
    );

    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
