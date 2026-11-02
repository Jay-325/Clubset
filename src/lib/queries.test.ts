import { describe, expect, it } from "vitest";

import { normalizeEmail } from "./queries";

describe("normalizeEmail", () => {
  it("lowercases an uppercase email", () => {
    expect(normalizeEmail("USER@SCHOOL.EDU")).toBe("user@school.edu");
  });

  it("lowercases a mixed-case email", () => {
    expect(normalizeEmail("User.Name@School.Edu")).toBe("user.name@school.edu");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeEmail("  user@school.edu  ")).toBe("user@school.edu");
  });

  it("trims and lowercases combined", () => {
    expect(normalizeEmail("  USER@SCHOOL.EDU  ")).toBe("user@school.edu");
  });

  it("leaves an already-normalized email unchanged", () => {
    expect(normalizeEmail("user@school.edu")).toBe("user@school.edu");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeEmail("")).toBe("");
  });

  it("trims whitespace-only input to an empty string", () => {
    expect(normalizeEmail("   ")).toBe("");
  });
});
