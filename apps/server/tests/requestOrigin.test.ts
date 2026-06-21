import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { requestOrigin } from "../src/utils/requestOrigin.js";

describe("request origin", () => {
  it("uses forwarded values and appends non-default ports", () => {
    expect(requestOrigin(request({
      "x-forwarded-proto": "https, http",
      "x-forwarded-host": ["public.example"],
      "x-forwarded-port": "8443"
    }, "http"), "http://fallback")).toBe("https://public.example:8443");
  });

  it("preserves explicit and default ports", () => {
    expect(requestOrigin(request({ "x-forwarded-proto": "https", host: "public.example:9443", "x-forwarded-port": "8443" }, "http"), "http://fallback")).toBe("https://public.example:9443");
    expect(requestOrigin(request({ "x-forwarded-proto": "http", host: "public.example", "x-forwarded-port": "80" }, "https"), "http://fallback")).toBe("http://public.example");
    expect(requestOrigin(request({ "x-forwarded-proto": "https", host: "[::1]:443", "x-forwarded-port": "8443" }, "http"), "http://fallback")).toBe("https://[::1]:443");
    expect(requestOrigin(request({ "x-forwarded-proto": "https", host: "[::1]", "x-forwarded-port": "8443" }, "http"), "http://fallback")).toBe("https://[::1]:8443");
  });

  it("uses request protocol and a trimmed fallback when headers are absent", () => {
    expect(requestOrigin(request({ host: "local.example" }, "http"), "http://fallback")).toBe("http://local.example");
    expect(requestOrigin(request({}, undefined), "https://fallback///")).toBe("https://fallback");
  });
});

function request(headers: Record<string, string | string[]>, protocol: string | undefined): FastifyRequest {
  return { headers, protocol } as unknown as FastifyRequest;
}
