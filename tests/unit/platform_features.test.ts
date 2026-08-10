import { describe, expect, it } from "vitest";
import { PLATFORM_FEATURES, PLATFORM_FEATURE_REASONS } from "../../src/platform/features";

describe("release platform feature gates", () => {
  it("keeps unverified cloud and leaderboards disabled in the ordinary production build", () => {
    expect(PLATFORM_FEATURES).toEqual({
      rewardedAds: true,
      cloudSave: false,
      leaderboard: false,
    });
    expect(PLATFORM_FEATURE_REASONS.rewardedAds).toContain("1054324");
    expect(PLATFORM_FEATURE_REASONS.cloudSave).toBe("暂未开放");
    expect(PLATFORM_FEATURE_REASONS.leaderboard).toBe("暂未开放");
  });
});
