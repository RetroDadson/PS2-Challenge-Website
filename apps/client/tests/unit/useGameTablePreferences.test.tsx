import type { GameTablePreferencesDto, GameTablePreferencesResponseDto } from "@ps2-challenge/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/api.js";
import { defaultGameTablePreferences } from "../../src/gameTablePreferences.js";
import { useGameTablePreferences } from "../../src/useGameTablePreferences.js";

beforeEach(() => localStorage.clear());

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useGameTablePreferences", () => {
  it("does not overwrite database preferences after a failed load and can retry", async () => {
    const saved = defaultGameTablePreferences();
    const load = vi.spyOn(api, "gameTablePreferences")
      .mockRejectedValueOnce(new Error("Service unavailable"))
      .mockResolvedValueOnce({ preferences: saved });
    const update = vi.spyOn(api, "updateGameTablePreferences").mockResolvedValue({ preferences: saved });
    const { result } = renderHook(() => useGameTablePreferences(true));

    await waitFor(() => expect(result.current.error?.kind).toBe("load"));
    act(() => result.current.setPreferences(withHiddenColumn("publisher")));
    expect(update).not.toHaveBeenCalled();

    act(() => result.current.retry());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.preferences).toEqual(saved);
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps failed saves dirty and retries the latest preferences", async () => {
    const saved = defaultGameTablePreferences();
    const changed = withHiddenColumn("developer");
    vi.spyOn(api, "gameTablePreferences").mockResolvedValue({ preferences: saved });
    const update = vi.spyOn(api, "updateGameTablePreferences")
      .mockRejectedValueOnce(new Error("Write failed"))
      .mockResolvedValueOnce({ preferences: changed });
    const { result } = renderHook(() => useGameTablePreferences(true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setPreferences(changed));
    await waitFor(() => expect(result.current.error?.kind).toBe("save"));
    expect(result.current.saving).toBe(false);

    act(() => result.current.retry());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(update).toHaveBeenLastCalledWith(changed);
  });

  it("serializes saves so an older request cannot overwrite a newer layout", async () => {
    const saved = defaultGameTablePreferences();
    const firstChange = withHiddenColumn("developer");
    const latestChange = withHiddenColumn("publisher");
    const firstRequest = deferred<GameTablePreferencesResponseDto>();
    vi.spyOn(api, "gameTablePreferences").mockResolvedValue({ preferences: saved });
    const update = vi.spyOn(api, "updateGameTablePreferences")
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce({ preferences: latestChange });
    const { result } = renderHook(() => useGameTablePreferences(true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setPreferences(firstChange));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    act(() => result.current.setPreferences(latestChange));
    expect(update).toHaveBeenCalledTimes(1);

    firstRequest.resolve({ preferences: firstChange });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(update.mock.calls.map(([preferences]) => preferences)).toEqual([firstChange, latestChange]);
  });
});

function withHiddenColumn(id: GameTablePreferencesDto["hidden"][number]): GameTablePreferencesDto {
  return { ...defaultGameTablePreferences(), hidden: [id] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
