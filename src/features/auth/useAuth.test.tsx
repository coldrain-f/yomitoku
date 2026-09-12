import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "./useAuth";

describe("useAuth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates the user state after Google login and clears it on logout", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new ApiError("UNAUTHORIZED", 401));
    vi.spyOn(api, "signInWithGoogle").mockResolvedValue({
      id: "user-1",
      role: "admin",
    });
    const logout = vi.spyOn(api, "logout").mockResolvedValue();
    const clearAccessToken = vi.spyOn(api, "clearAccessToken");
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    await act(async () => {
      await result.current.signInWithGoogle("google-credential");
    });

    expect(result.current).toMatchObject({
      authenticated: true,
      role: "admin",
      userId: "user-1",
    });

    act(() => {
      result.current.signOut();
    });

    expect(logout).toHaveBeenCalledOnce();
    expect(clearAccessToken).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({
      authenticated: false,
      role: "learner",
      userId: null,
    });
  });
});
