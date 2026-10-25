import { afterEach, describe, expect, it } from "vitest";
import { createSessionToken, isValidSessionToken, passwordAccepted } from "@/lib/auth";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("login modes (D4)", () => {
  it("open mode accepts any password", () => {
    process.env.AUTH_MODE = "open";
    expect(passwordAccepted("anything")).toBe(true);
    expect(passwordAccepted("")).toBe(true);
  });
  it("password mode checks DASHBOARD_PASSWORD", () => {
    process.env.AUTH_MODE = "password";
    process.env.DASHBOARD_PASSWORD = "s3cret";
    expect(passwordAccepted("s3cret")).toBe(true);
    expect(passwordAccepted("wrong")).toBe(false);
    expect(passwordAccepted("")).toBe(false);
  });
  it("password mode with no DASHBOARD_PASSWORD fails closed", () => {
    process.env.AUTH_MODE = "password";
    delete process.env.DASHBOARD_PASSWORD;
    expect(passwordAccepted("")).toBe(false);
    expect(passwordAccepted("x")).toBe(false);
  });
  it("unknown AUTH_MODE falls back to open", () => {
    process.env.AUTH_MODE = "weird";
    expect(passwordAccepted("x")).toBe(true);
  });
});

describe("session token", () => {
  it("is valid only for the secret that signed it", async () => {
    process.env.DATABASE_URL = "postgres://one";
    delete process.env.DASHBOARD_PASSWORD;
    const token = await createSessionToken();
    expect(await isValidSessionToken(token)).toBe(true);
    expect(await isValidSessionToken("forged")).toBe(false);
    expect(await isValidSessionToken(undefined)).toBe(false);
    process.env.DATABASE_URL = "postgres://two";
    expect(await isValidSessionToken(token)).toBe(false);
  });
  it("changes when AUTH_MODE changes, so switching modes logs everyone out", async () => {
    process.env.DATABASE_URL = "postgres://one";
    process.env.AUTH_MODE = "open";
    const a = await createSessionToken();
    process.env.AUTH_MODE = "password";
    expect(await isValidSessionToken(a)).toBe(false);
  });
});
