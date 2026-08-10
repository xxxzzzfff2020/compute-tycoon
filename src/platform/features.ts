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
  rewardedAds: "TapTap H5应用广告已启用；正式竖屏激励广告位 1054324",
  cloudSave: PLATFORM_REVIEW_MODE
    ? "云备份已开启（真机测试存档）"
    : "暂未开放",
  leaderboard: PLATFORM_REVIEW_MODE
    ? "名人堂已开启（真机测试榜）"
    : "暂未开放",
});
