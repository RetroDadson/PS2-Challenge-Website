import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshCoverImagesAndBroadcast, scheduleCoverImageRefresh } from "../src/server.js";
import type { CoverImageRefreshProgress } from "../src/services/coverImageService.js";

describe("cover image refresh scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("broadcasts GamesUpdated only when a cover refresh changes rows", async () => {
    const coverRefresh = { refreshCoverImages: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(2) };
    const realtimeHub = { broadcastGamesUpdated: vi.fn() };

    await expect(refreshCoverImagesAndBroadcast(coverRefresh, realtimeHub)).resolves.toBe(0);
    expect(realtimeHub.broadcastGamesUpdated).not.toHaveBeenCalled();

    await expect(refreshCoverImagesAndBroadcast(coverRefresh, realtimeHub)).resolves.toBe(2);
    expect(realtimeHub.broadcastGamesUpdated).toHaveBeenCalledTimes(1);
  });

  it("runs once after the startup delay, then repeats on the daily interval until stopped", async () => {
    vi.useFakeTimers();
    const coverRefresh = { refreshCoverImages: vi.fn().mockResolvedValue(1) };
    const realtimeHub = { broadcastGamesUpdated: vi.fn() };

    const scheduler = scheduleCoverImageRefresh({
      coverRefresh,
      realtimeHub,
      initialDelayMs: 1_000,
      intervalMs: 5_000
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(coverRefresh.refreshCoverImages).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(coverRefresh.refreshCoverImages).toHaveBeenCalledTimes(1);
    expect(realtimeHub.broadcastGamesUpdated).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(coverRefresh.refreshCoverImages).toHaveBeenCalledTimes(2);
    expect(realtimeHub.broadcastGamesUpdated).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(coverRefresh.refreshCoverImages).toHaveBeenCalledTimes(2);
  });

  it("logs scheduled cover refresh lifecycle events", async () => {
    vi.useFakeTimers();
    const coverRefresh = { refreshCoverImages: vi.fn().mockResolvedValue(2) };
    const realtimeHub = { broadcastGamesUpdated: vi.fn() };
    const logger = { info: vi.fn(), error: vi.fn() };

    const scheduler = scheduleCoverImageRefresh({
      coverRefresh,
      realtimeHub,
      logger,
      initialDelayMs: 1,
      intervalMs: 5_000
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(logger.info).toHaveBeenCalledWith("Cover Image Update Service Wrapper is starting");
    expect(logger.info).toHaveBeenCalledWith("Starting cover image update process");
    expect(logger.info).toHaveBeenCalledWith({ updated: 2 }, "Cover image update completed");
    expect(logger.info).toHaveBeenCalledWith({ updated: 2 }, "Sent GamesUpdated notification to connected clients");

    scheduler.stop();
    expect(logger.info).toHaveBeenCalledWith("Cover Image Update Service Wrapper is stopping");
  });

  it("logs detailed cover refresh counts when the refresh service provides them", async () => {
    vi.useFakeTimers();
    const coverRefresh = {
      refreshCoverImages: vi.fn(),
      refreshCoverImagesDetailed: vi.fn(async (_signal?: AbortSignal, onProgress?: (progress: CoverImageRefreshProgress) => void | Promise<void>) => {
        await onProgress?.({ status: "starting", total: 3, processed: 0, updated: 0, skipped: 0, errors: 0 });
        return { total: 3, updated: 1, skipped: 2, errors: 0 };
      })
    };
    const realtimeHub = { broadcastGamesUpdated: vi.fn() };
    const logger = { info: vi.fn(), error: vi.fn() };

    const scheduler = scheduleCoverImageRefresh({
      coverRefresh,
      realtimeHub,
      logger,
      initialDelayMs: 1,
      intervalMs: 5_000
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(coverRefresh.refreshCoverImages).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ gameCount: 3 }, "Updating cover URLs for 3 games");
    expect(logger.info).toHaveBeenCalledWith({ updated: 1, total: 3, skipped: 2, errors: 0 }, "Cover image update completed. Updated 1 out of 3 games");
    expect(realtimeHub.broadcastGamesUpdated).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });
});
