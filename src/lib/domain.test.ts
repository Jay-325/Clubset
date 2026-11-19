import { describe, expect, it } from "vitest";

import { verificationAction } from "./domain";

describe("verificationAction", () => {
  const base = {
    viewerId: "student-a",
    founderId: "student-b",
    verifiedUserIds: ["student-b"],
    status: "awaiting_student_verification" as const,
  };

  it("offers the confirm control to an unconfirmed student", () => {
    expect(verificationAction(base)).toBe("verify");
  });

  it("never offers a second confirmation to someone already counted", () => {
    expect(verificationAction({ ...base, verifiedUserIds: ["student-b", "student-a"] })).toBe(
      "verified",
    );
  });

  it("shows the founder their share path instead of a confirm control", () => {
    expect(verificationAction({ ...base, viewerId: "student-b" })).toBe("founder");
  });

  it("does not treat a null viewer as the founder of a club with no founder", () => {
    expect(verificationAction({ ...base, viewerId: null, founderId: null })).toBe("closed");
    expect(verificationAction({ ...base, founderId: null })).toBe("verify");
  });

  it("closes once the club has moved past student verification", () => {
    expect(verificationAction({ ...base, status: "awaiting_administrator_verification" })).toBe(
      "closed",
    );
    expect(verificationAction({ ...base, status: "approved" })).toBe("closed");
  });
});
