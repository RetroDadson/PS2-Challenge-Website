import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { GameCoverService } from "../src/services/coverImageService.js";

describe("GameCoverService cover URL checks", () => {
  const coverUrl = "https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/default/SLUS-12345.jpg";

  it("checks cover existence with a HEAD request", async () => {
    const fetchCover = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(serviceWith(fetchCover).checkCoverUrl(coverUrl)).resolves.toBe("exists");

    expect(fetchCover).toHaveBeenCalledTimes(1);
    expect(fetchCover).toHaveBeenCalledWith(coverUrl, { method: "HEAD" });
  });

  it("treats not found responses as missing covers", async () => {
    const fetchCover = vi.fn(async () => new Response(null, { status: 404 }));

    await expect(serviceWith(fetchCover).checkCoverUrl(coverUrl)).resolves.toBe("missing");

    expect(fetchCover).toHaveBeenCalledTimes(1);
  });

  it("falls back to a one-byte ranged GET only when HEAD is not supported", async () => {
    const cancelBody = vi.fn(async () => undefined);
    const fetchCover = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        body: {
          cancel: cancelBody
        }
      } as Response);

    await expect(serviceWith(fetchCover).checkCoverUrl(coverUrl)).resolves.toBe("exists");

    expect(fetchCover).toHaveBeenNthCalledWith(1, coverUrl, { method: "HEAD" });
    expect(fetchCover).toHaveBeenNthCalledWith(2, coverUrl, {
      method: "GET",
      headers: { Range: "bytes=0-0" }
    });
    expect(cancelBody).toHaveBeenCalledTimes(1);
  });

  it("leaves the cover status unknown when the check cannot be completed", async () => {
    const fetchCover = vi.fn(async () => {
      throw new Error("network unavailable");
    });

    await expect(serviceWith(fetchCover).checkCoverUrl(coverUrl)).resolves.toBe("unknown");
  });

  it("does not request URLs outside the cover repository allow-list", async () => {
    const fetchCover = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(serviceWith(fetchCover).checkCoverUrl("https://example.com/covers/SLUS-12345.jpg")).resolves.toBe("unknown");

    expect(fetchCover).not.toHaveBeenCalled();
  });
});

function serviceWith(fetchCover: (input: string, init?: RequestInit) => Promise<Response>) {
  return new GameCoverService({} as pg.Pool, fetchCover);
}
