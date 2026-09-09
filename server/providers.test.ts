import { describe, it, expect } from "vitest";
import {
  TEXT_PROVIDERS,
  getHealthyProviders,
  markProviderCooldown,
  clearProviderCooldown,
  isProviderConfigured,
  getConfiguredTextProviders,
} from "./providers";

describe("isProviderConfigured", () => {
  it("is true only when the env var is set", () => {
    expect(isProviderConfigured(TEXT_PROVIDERS[0], { GROQ_API_KEY: "x" } as any)).toBe(true);
    expect(isProviderConfigured(TEXT_PROVIDERS[0], {} as any)).toBe(false);
  });
});

describe("getHealthyProviders", () => {
  it("returns all providers unchanged when none are cooling down", () => {
    const cooldowns = new Map<string, number>();
    const result = getHealthyProviders(TEXT_PROVIDERS, cooldowns, 1000);
    expect(result).toEqual(TEXT_PROVIDERS);
  });

  it("moves a cooling-down provider to the back instead of dropping it", () => {
    const cooldowns = new Map([["groq", 5000]]);
    const result = getHealthyProviders(TEXT_PROVIDERS, cooldowns, 1000);
    expect(result.map((p) => p.name)).toEqual([
      ...TEXT_PROVIDERS.filter((p) => p.name !== "groq").map((p) => p.name),
      "groq",
    ]);
  });

  it("resets and returns everyone once all providers are cooling down", () => {
    const cooldowns = new Map(TEXT_PROVIDERS.map((p) => [p.name, 5000]));
    const result = getHealthyProviders(TEXT_PROVIDERS, cooldowns, 1000);
    expect(result).toEqual(TEXT_PROVIDERS);
    expect(cooldowns.size).toBe(0);
  });

  it("treats an expired cooldown as healthy again", () => {
    const cooldowns = new Map([["groq", 500]]);
    const result = getHealthyProviders(TEXT_PROVIDERS, cooldowns, 1000);
    expect(result).toEqual(TEXT_PROVIDERS);
  });
});

describe("markProviderCooldown / clearProviderCooldown", () => {
  it("sets a future expiry and clearing removes it", () => {
    const cooldowns = new Map<string, number>();
    markProviderCooldown("groq", cooldowns, 1000);
    expect(cooldowns.get("groq")).toBeGreaterThan(Date.now());
    clearProviderCooldown("groq", cooldowns);
    expect(cooldowns.has("groq")).toBe(false);
  });
});

describe("getConfiguredTextProviders", () => {
  it("only returns providers whose env key is set, in priority order", () => {
    const env = { MISTRAL_API_KEY: "x", OPENROUTER_API_KEY: "y" } as any;
    const result = getConfiguredTextProviders(env);
    expect(result.map((p) => p.name)).toEqual(["mistral", "openrouter"]);
  });

  it("returns an empty list when no provider keys are set", () => {
    expect(getConfiguredTextProviders({} as any)).toEqual([]);
  });
});
