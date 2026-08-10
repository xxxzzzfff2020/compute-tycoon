// TapTap H5 云存档适配：本地存档永远是第一保存层；云端仅备份/显式恢复。

export const PRODUCTION_CLOUD_SLOT_NAME = "compute_tycoon_auto";
const MIN_UPLOAD_INTERVAL_MS = 65_000;
const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const LAST_UPLOAD_KEY = "compute_tycoon_h5_cloud_last_upload_ms";
const KNOWN_REMOTE_KEY = "compute_tycoon_h5_cloud_known_remote";
const LAST_SUCCESS_KEY = "compute_tycoon_h5_cloud_last_success_ms";

export interface CloudSaveIdentity {
  schemaVersion: number;
  saveId: string;
  revision: number;
  updatedAtMs: number;
}

interface CloudEnvelopeV2 {
  format: "compute-tycoon-h5-cloud-v2";
  savedAtMs: number;
  fingerprint: string;
  meta: CloudSaveIdentity;
  payload: unknown;
}

interface DecodedCloudEnvelope {
  payload: unknown;
  meta: CloudSaveIdentity;
  fingerprint: string;
}

export type CloudSyncState = "unsupported" | "idle" | "scheduled" | "syncing" | "synced" | "conflict" | "error";
export interface CloudSyncSnapshot {
  state: CloudSyncState;
  message: string;
  lastSuccessAtMs: number;
}

export interface CloudOperationResult {
  ok: boolean;
  saveJson?: string;
  error?: string;
  conflict?: boolean;
  localMeta?: CloudSaveIdentity;
  remoteMeta?: CloudSaveIdentity;
}

export interface TapFileSystemManager {
  writeFile(options: { filePath: string; data: string; encoding: "utf8"; success: () => void; fail: (error: unknown) => void }): void;
  readFile(options: { filePath: string; encoding: "utf8"; success: (result: { data: string }) => void; fail: (error: unknown) => void }): void;
}

export interface TapCloudArchive {
  name?: string;
  uuid?: string;
  archiveUUID?: string;
  fileId?: string;
  archiveFileId?: string;
}

export interface TapCloudSaveManager {
  getArchiveList(options: { success: (result: { saves?: TapCloudArchive[] }) => void; fail: (error: unknown) => void }): void;
  createArchive(options: CloudWriteOptions): void;
  updateArchive(options: CloudWriteOptions & { archiveUUID: string }): void;
  getArchiveData(options: {
    archiveUUID: string;
    archiveFileId: string;
    targetFilePath: string;
    success: (result: { filePath: string }) => void;
    fail: (error: unknown) => void;
  }): void;
}

export interface CloudWriteOptions {
  archiveMetaData: { name: string; summary: string; playtime: number };
  archiveFilePath: string;
  success: () => void;
  fail: (error: unknown) => void;
}

export interface TapCloudApi {
  env: { USER_DATA_PATH: string };
  getFileSystemManager(): TapFileSystemManager;
  getCloudSaveManager(): TapCloudSaveManager;
}

function tapCloudApi(): TapCloudApi | null {
  const tap = (globalThis as typeof globalThis & { tap?: Partial<TapCloudApi> }).tap;
  if (!tap?.env?.USER_DATA_PATH || typeof tap.getFileSystemManager !== "function" || typeof tap.getCloudSaveManager !== "function") return null;
  return tap as TapCloudApi;
}

function errorText(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const value = error as { errMsg?: string; message?: string; code?: number };
    return value.errMsg ?? value.message ?? (value.code == null ? "云存档操作失败" : `云存档错误 ${value.code}`);
  }
  return String(error || "云存档操作失败");
}

function saveIdentity(payload: unknown): CloudSaveIdentity | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.saveId !== "string" || value.saveId.length === 0) return null;
  if (typeof value.schemaVersion !== "number" || !Number.isFinite(value.schemaVersion)) return null;
  const revision = Number(value.revision ?? 0);
  const updatedAtMs = Number(value.updatedAtMs ?? 0);
  if (!Number.isFinite(revision) || revision < 0 || !Number.isFinite(updatedAtMs) || updatedAtMs < 0) return null;
  return {
    schemaVersion: Math.floor(value.schemaVersion),
    saveId: value.saveId,
    revision: Math.floor(revision),
    updatedAtMs: Math.floor(updatedAtMs),
  };
}

function cloudFingerprint(meta: CloudSaveIdentity): string {
  return `${meta.saveId}:${meta.schemaVersion}:${meta.revision}:${meta.updatedAtMs}`;
}

function decodeCloudEnvelope(raw: string): DecodedCloudEnvelope | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof decoded !== "object" || decoded === null) return null;
  const value = decoded as Record<string, unknown>;
  if (value.format !== "compute-tycoon-h5-cloud-v1" && value.format !== "compute-tycoon-h5-cloud-v2") return null;
  const meta = saveIdentity(value.meta ?? value.payload);
  if (!meta || value.payload == null) return null;
  const fingerprint = cloudFingerprint(meta);
  if (value.format === "compute-tycoon-h5-cloud-v2" && value.fingerprint !== fingerprint) return null;
  return { payload: value.payload, meta, fingerprint };
}

export class TapCloudSaveController {
  private readonly api: TapCloudApi | null;
  private readonly slotName: string;
  private readonly fileName: string;
  private readonly browserStorage: Pick<Storage, "getItem" | "setItem">;
  private inFlight = false;
  private timer: number | null = null;
  private pendingProvider: (() => string) | null = null;
  private snapshot: CloudSyncSnapshot;
  private readonly listeners = new Set<(snapshot: CloudSyncSnapshot) => void>();

  constructor(options: {
    tapApi?: TapCloudApi;
    slotName?: string;
    browserStorage?: Pick<Storage, "getItem" | "setItem">;
  } = {}) {
    this.api = options.tapApi ?? tapCloudApi();
    this.slotName = options.slotName ?? PRODUCTION_CLOUD_SLOT_NAME;
    this.fileName = `${this.slotName}.json`;
    this.browserStorage = options.browserStorage ?? window.localStorage;
    this.snapshot = {
      state: this.api ? "idle" : "unsupported",
      message: this.api ? "云存档待同步" : "请在 TapTap 小游戏中使用云存档",
      lastSuccessAtMs: this.storedNumber(LAST_SUCCESS_KEY),
    };
  }

  supported(): boolean {
    return this.api !== null;
  }

  getSnapshot(): CloudSyncSnapshot {
    return { ...this.snapshot };
  }

  subscribe(listener: (snapshot: CloudSyncSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  scheduleUpload(provider: () => string): void {
    if (!this.api) return;
    this.pendingProvider = provider;
    if (this.timer !== null || this.inFlight) return;
    const elapsed = Date.now() - this.lastUploadAtMs();
    const delay = Math.max(1_500, MIN_UPLOAD_INTERVAL_MS - elapsed);
    this.setSnapshot("scheduled", "本地已保存，云备份排队中");
    this.timer = window.setTimeout(() => {
      this.timer = null;
      const next = this.pendingProvider;
      this.pendingProvider = null;
      if (next) void this.upload(next());
    }, delay);
  }

  async upload(saveJson: string, force = false, overwriteConflict = false): Promise<CloudOperationResult> {
    if (!this.api) return this.fail("请在 TapTap 小游戏中使用云存档", "unsupported");
    if (this.inFlight) return { ok: false, error: "云存档正在同步" };
    const elapsed = Date.now() - this.lastUploadAtMs();
    if (!force && elapsed < MIN_UPLOAD_INTERVAL_MS) {
      return { ok: false, error: `云存档限频，请 ${Math.ceil((MIN_UPLOAD_INTERVAL_MS - elapsed) / 1000)} 秒后再试` };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(saveJson);
    } catch {
      return this.fail("本地存档无效，未上传");
    }
    const localMeta = saveIdentity(payload);
    if (!localMeta) return this.fail("本地存档缺少有效身份，未上传");
    const localFingerprint = cloudFingerprint(localMeta);
    const wrapped = JSON.stringify({
      format: "compute-tycoon-h5-cloud-v2",
      savedAtMs: Date.now(),
      fingerprint: localFingerprint,
      meta: localMeta,
      payload,
    } satisfies CloudEnvelopeV2);
    if (new TextEncoder().encode(wrapped).byteLength > MAX_ARCHIVE_BYTES) return this.fail("存档超过10MB，未上传");

    this.inFlight = true;
    this.setSnapshot("syncing", "正在核对云端版本");
    try {
      const fs = this.api.getFileSystemManager();
      const cloud = this.api.getCloudSaveManager();
      const saves = await this.archiveList(cloud);
      const existing = saves.find((item) => item.name === this.slotName);
      if (existing) {
        let remote: DecodedCloudEnvelope | null = null;
        try {
          remote = await this.readArchive(cloud, fs, existing);
        } catch (error) {
          if (!overwriteConflict) {
            const message = `云端存档无法安全核对：${errorText(error)}。已停止覆盖`;
            this.setSnapshot("conflict", message);
            return { ok: false, conflict: true, error: message, localMeta };
          }
        }
        if (remote) {
          if (remote.fingerprint === localFingerprint) {
            const now = Date.now();
            this.browserStorage.setItem(this.key(LAST_UPLOAD_KEY), String(now));
            this.rememberRemote(localFingerprint);
            this.setSnapshot("synced", "云端与本地已一致", now);
            return { ok: true, localMeta, remoteMeta: remote.meta };
          }
          const knownRemote = this.browserStorage.getItem(this.key(KNOWN_REMOTE_KEY));
          const isKnownLineage = knownRemote === remote.fingerprint;
          const sameSave = remote.meta.saveId === localMeta.saveId;
          const localNotOlder = localMeta.revision >= remote.meta.revision && localMeta.updatedAtMs >= remote.meta.updatedAtMs;
          if (!overwriteConflict && !(isKnownLineage && sameSave && localNotOlder)) {
            const message = sameSave
              ? "云端已有另一设备更新的进度，已停止自动覆盖。请先恢复云端或确认强制备份"
              : "云端属于另一份存档，已停止自动覆盖。请先恢复云端或确认强制备份";
            this.setSnapshot("conflict", message);
            return { ok: false, conflict: true, error: message, localMeta, remoteMeta: remote.meta };
          }
        }
      }

      const filePath = `${this.api.env.USER_DATA_PATH}/${this.fileName}`;
      await new Promise<void>((resolve, reject) => fs.writeFile({ filePath, data: wrapped, encoding: "utf8", success: resolve, fail: reject }));
      const common: CloudWriteOptions = {
        archiveMetaData: { name: this.slotName, summary: `算力大亨自动存档 · ${new Date().toLocaleString("zh-CN")}`, playtime: 0 },
        archiveFilePath: filePath,
        success: () => undefined,
        fail: () => undefined,
      };
      await new Promise<void>((resolve, reject) => {
        const options = { ...common, success: resolve, fail: reject };
        const uuid = existing?.uuid ?? existing?.archiveUUID;
        if (uuid) cloud.updateArchive({ archiveUUID: uuid, ...options });
        else cloud.createArchive(options);
      });
      const now = Date.now();
      this.browserStorage.setItem(this.key(LAST_UPLOAD_KEY), String(now));
      this.rememberRemote(localFingerprint);
      this.setSnapshot("synced", "云备份已完成", now);
      return { ok: true, localMeta };
    } catch (error) {
      return this.fail(errorText(error));
    } finally {
      this.inFlight = false;
      this.resumePendingUpload();
    }
  }

  async download(): Promise<CloudOperationResult> {
    if (!this.api) return this.fail("请在 TapTap 小游戏中使用云存档", "unsupported");
    if (this.inFlight) return { ok: false, error: "云存档正在同步" };
    this.inFlight = true;
    this.setSnapshot("syncing", "正在读取并校验云端存档");
    try {
      const fs = this.api.getFileSystemManager();
      const cloud = this.api.getCloudSaveManager();
      const saves = await this.archiveList(cloud);
      const archive = saves.find((item) => item.name === this.slotName);
      if (!archive) return this.fail("云端还没有可恢复的存档");
      const decoded = await this.readArchive(cloud, fs, archive);
      const now = Date.now();
      this.rememberRemote(decoded.fingerprint);
      this.setSnapshot("synced", "云端存档已校验，可安全恢复", now);
      return { ok: true, saveJson: JSON.stringify(decoded.payload), remoteMeta: decoded.meta };
    } catch (error) {
      return this.fail(`云端存档格式无效，本地档未改变：${errorText(error)}`);
    } finally {
      this.inFlight = false;
      this.resumePendingUpload();
    }
  }

  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.pendingProvider = null;
    this.listeners.clear();
  }

  private lastUploadAtMs(): number {
    return this.storedNumber(LAST_UPLOAD_KEY);
  }

  private storedNumber(base: string): number {
    const value = Number(this.browserStorage.getItem(this.key(base)) ?? "0");
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  private key(base: string): string {
    return `${base}:${this.slotName}`;
  }

  private rememberRemote(fingerprint: string): void {
    this.browserStorage.setItem(this.key(KNOWN_REMOTE_KEY), fingerprint);
  }

  private resumePendingUpload(): void {
    const pending = this.pendingProvider;
    if (!pending || this.timer !== null || this.inFlight) return;
    this.pendingProvider = null;
    this.scheduleUpload(pending);
  }

  private setSnapshot(state: CloudSyncState, message: string, successAtMs?: number): void {
    const lastSuccessAtMs = successAtMs ?? this.snapshot.lastSuccessAtMs;
    if (successAtMs != null) this.browserStorage.setItem(this.key(LAST_SUCCESS_KEY), String(successAtMs));
    this.snapshot = { state, message, lastSuccessAtMs };
    for (const listener of this.listeners) listener(this.getSnapshot());
  }

  private fail(error: string, state: CloudSyncState = "error"): CloudOperationResult {
    this.setSnapshot(state, error);
    return { ok: false, error };
  }

  private async readArchive(
    cloud: TapCloudSaveManager,
    fs: TapFileSystemManager,
    archive: TapCloudArchive,
  ): Promise<DecodedCloudEnvelope> {
    const uuid = archive.uuid ?? archive.archiveUUID;
    const fileId = archive.fileId ?? archive.archiveFileId;
    if (!uuid || !fileId) throw new Error("云端档案缺少文件身份");
    const safeSlot = this.slotName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const targetFilePath = `${this.api!.env.USER_DATA_PATH}/${safeSlot}-preflight.json`;
    const downloaded = await new Promise<{ filePath: string }>((resolve, reject) => cloud.getArchiveData({
      archiveUUID: uuid,
      archiveFileId: fileId,
      targetFilePath,
      success: resolve,
      fail: reject,
    }));
    const raw = await new Promise<string>((resolve, reject) => fs.readFile({
      filePath: downloaded.filePath,
      encoding: "utf8",
      success: (result) => resolve(result.data),
      fail: reject,
    }));
    const decoded = decodeCloudEnvelope(raw);
    if (!decoded) throw new Error("云端存档校验失败");
    return decoded;
  }

  private archiveList(cloud: TapCloudSaveManager): Promise<TapCloudArchive[]> {
    return new Promise((resolve, reject) => cloud.getArchiveList({ success: (result) => resolve(result.saves ?? []), fail: reject }));
  }
}
