import { describe, it, expect } from "vitest";
import { serverConfig } from "../src/config.js";

describe("serverConfig", () => {
  it("binds loopback only and defaults the port", () => {
    expect(serverConfig({})).toEqual({ host: "127.0.0.1", port: 3000 });
  });

  it("honors a numeric PORT", () => {
    expect(serverConfig({ PORT: "4000" })).toEqual({ host: "127.0.0.1", port: 4000 });
  });

  it("falls back to 3000 on a bad PORT instead of NaN", () => {
    expect(serverConfig({ PORT: "abc" })).toEqual({ host: "127.0.0.1", port: 3000 });
  });
});
