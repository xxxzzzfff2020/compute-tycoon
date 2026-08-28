import { describe, expect, it } from "vitest";
import { PLATFORM_FEATURES, PLATFORM_FEATURE_REASONS, resolvePlatformFeatures, isUnavailablePlatformCommand } from "../../src/platform/features";

describe("single-player platform boundary", () => {
  it.each([false, true])("disables every remote capability even with verified runtime = %s", (runtime) => {
    expect(resolvePlatformFeatures(runtime)).toEqual({ rewardedAds: false, cloudSave: false, leaderboard: false, achievements: false });
    expect(resolvePlatformFeatures(runtime)).toEqual(PLATFORM_FEATURES);
    expect(PLATFORM_FEATURE_REASONS.rewardedAds).toBe("standalone.adsDisabled");
    expect(PLATFORM_FEATURE_REASONS.cloudSave).toBe("standalone.status");
  });
  it.each(["cloud_upload", "cloud_restore", "open_leaderboard:company_level", "retry_company_level_leaderboard", "prepare_sponsor_ad:offline_capacity", "prepare_sponsor_ad:income_boost", "resume_sponsor_ad", "cancel_pending_sponsor_ad"])("rejects removed command %s", (command) => {
    expect(isUnavailablePlatformCommand(command)).toBe(true);
  });
  it.each(["buy_server", "claim_offline", "export_json", "import_json", "claim_achievement:first_server"])("keeps local command %s", (command) => {
    expect(isUnavailablePlatformCommand(command)).toBe(false);
  });
});
