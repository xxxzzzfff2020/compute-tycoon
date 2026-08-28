/** 单机发布门：构建变量和宿主注入均不能开启联网平台能力。 */
export const PLATFORM_REVIEW_MODE = import.meta.env.VITE_PLATFORM_REVIEW === "1";
export const PLATFORM_REVIEW_SAVE_NAMESPACE = "compute_tycoon_h5_platform_review_v1";
export const PLATFORM_REVIEW_CLOUD_SLOT_NAME = "compute_tycoon_platform_review_v1";

export const PLATFORM_FEATURES = Object.freeze({
  rewardedAds: false,
  cloudSave: false,
  leaderboard: false,
  achievements: false,
});

export interface ResolvedPlatformFeatures {
  rewardedAds: boolean;
  cloudSave: boolean;
  leaderboard: boolean;
  achievements: boolean;
}

/** 保留调用契约，但任何宿主环境都只能获得单机能力。 */
export function resolvePlatformFeatures(_hasVerifiedTapRuntime: boolean): Readonly<ResolvedPlatformFeatures> {
  return PLATFORM_FEATURES;
}

export const PLATFORM_FEATURE_REASONS = Object.freeze({
  rewardedAds: "standalone.adsDisabled",
  cloudSave: "standalone.status",
  leaderboard: "standalone.status",
  achievements: "standalone.status",
});

/** 旧入口即使被脚本重新插入，也不能触发平台操作或奖励。 */
export function isUnavailablePlatformCommand(command: string): boolean {
  return command.startsWith("cloud_")
    || command.includes("leaderboard")
    || command.startsWith("prepare_sponsor_ad:")
    || command === "resume_sponsor_ad"
    || command === "cancel_pending_sponsor_ad";
}
