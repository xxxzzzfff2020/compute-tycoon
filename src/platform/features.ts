/**
 * 平台能力发布门。
 * Production 只保留已获准的广告接线；云档/榜单必须在独立 Platform Review
 * 构建完成真容器与双设备证据后，才能另行裁决是否进入正式包。
 */
export const PLATFORM_REVIEW_MODE = import.meta.env.VITE_PLATFORM_REVIEW === "1";
export const PLATFORM_REVIEW_SAVE_NAMESPACE = "compute_tycoon_h5_platform_review_v1";
export const PLATFORM_REVIEW_CLOUD_SLOT_NAME = "compute_tycoon_platform_review_v1";

export const PLATFORM_FEATURES = Object.freeze({
  rewardedAds: true,
  cloudSave: PLATFORM_REVIEW_MODE,
  leaderboard: PLATFORM_REVIEW_MODE,
});

export const PLATFORM_FEATURE_REASONS = Object.freeze({
  rewardedAds: "platform.reason.ads",
  cloudSave: PLATFORM_REVIEW_MODE
    ? "platform.reason.cloudReview"
    : "platform.reason.unavailable",
  leaderboard: PLATFORM_REVIEW_MODE
    ? "platform.reason.leaderboardReview"
    : "platform.reason.unavailable",
});
