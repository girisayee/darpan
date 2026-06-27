import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAllowedEmail } from "@/lib/auth/allowlist";

describe("isAllowedEmail", () => {
  const original = process.env.ALLOWED_EMAILS;
  beforeEach(() => { process.env.ALLOWED_EMAILS = "Alice@Example.com, bob@x.io"; });
  afterEach(() => { process.env.ALLOWED_EMAILS = original; });

  it("allows a listed email case-insensitively", () => {
    expect(isAllowedEmail("alice@example.com")).toBe(true);
    expect(isAllowedEmail("BOB@X.IO")).toBe(true);
  });
  it("rejects unlisted, empty, and null", () => {
    expect(isAllowedEmail("eve@evil.com")).toBe(false);
    expect(isAllowedEmail("")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
  });
  it("rejects everyone when ALLOWED_EMAILS is unset", () => {
    delete process.env.ALLOWED_EMAILS;
    expect(isAllowedEmail("alice@example.com")).toBe(false);
  });
});
