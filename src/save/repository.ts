// 存档仓库：校验/修复/写盘/导入导出/重置。核心规则：
// - 高版本未知 schema 拒绝覆盖
// - 损坏存档安全新建
// - 保存失败不能完成任何状态变更（由引擎层保证原子性，这里保证写盘可靠性）
import {
  freshSaveData,
  type SaveStorage,
} from "./storage";
import {
  MAX_SUPPORTED_SCHEMA_VERSION,
  SAVE_NAMESPACE,
  type SaveData,
} from "./types";
import { validateSave } from "./validate";
import { t } from "../i18n";

export interface SaveRepositoryOptions {
  storage: SaveStorage;
  nowMs: () => number;
}

export type PrepareReplacementSave = (raw: Record<string, unknown>) => void;

export interface LoadOutcome {
  kind: "fresh" | "loaded" | "repaired" | "corrupt_recreated";
  data: SaveData;
  message: string;
}

/**
 * 尚未写入本机存储的完整重置候选。
 *
 * 与 `reset()` 的立即写盘不同，兼容事务候选只在
 * `commitPreparedReset()` 时生效；本接口不访问远端服务。
 */
export interface PreparedResetOutcome {
  ok: boolean;
  data: SaveData;
  error?: string;
}

export class SaveRepository {
  private storage: SaveStorage;
  private nowMs: () => number;
  private latest: SaveData | null = null;
  private writesBlockedByFutureSchema = false;

  constructor(options: SaveRepositoryOptions) {
    this.storage = options.storage;
    this.nowMs = options.nowMs;
  }

  /** 载入存档；损坏/高版本时安全新建 */
  load(): LoadOutcome {
    this.writesBlockedByFutureSchema = false;
    const raw = this.storage.load();
    if (raw == null) {
      const fresh = freshSaveData(this.nowMs());
      this.latest = fresh;
      return { kind: "fresh", data: fresh, message: "save.msg.created" };
    }
    const result = validateSave(raw);
    if (!result.ok) {
      if (result.reason === "unsupported_version") {
        // 高版本未知 schema：不覆盖、不删除；新建并提示
        this.writesBlockedByFutureSchema = true;
        const fresh = freshSaveData(this.nowMs());
        this.latest = fresh;
        return {
          kind: "fresh",
          data: fresh,
          message: t("save.msg.futureVersion", { version: String((raw as unknown as Record<string, unknown>).schemaVersion), max: String(MAX_SUPPORTED_SCHEMA_VERSION) }),
        };
      }
      const fresh = freshSaveData(this.nowMs());
      this.latest = fresh;
      return { kind: "corrupt_recreated", data: fresh, message: "save.msg.corruptRecreated" };
    }
    if (result.repaired) {
      this.latest = result.data;
      return { kind: "repaired", data: result.data, message: "save.msg.repaired" };
    }
    this.latest = result.data;
    return { kind: "loaded", data: result.data, message: "save.msg.loaded" };
  }

  /** 原子保存：校验通过才写盘，并递增 revision */
  save(data: SaveData): { ok: boolean; saved: SaveData; error?: string } {
    if (this.writesBlockedByFutureSchema) {
      return { ok: false, saved: data, error: "future_schema_write_blocked" };
    }
    const validated = validateSave(data);
    if (!validated.ok) {
      return { ok: false, saved: data, error: "save_rejected_invalid_data" };
    }
    const next: SaveData = {
      ...validated.data,
      revision: validated.data.revision + 1,
      updatedAtMs: this.nowMs(),
    };
    let persisted = false;
    try {
      persisted = this.storage.save(next);
    } catch {
      persisted = false;
    }
    if (!persisted) {
      return { ok: false, saved: data, error: "storage_write_failed" };
    }
    this.latest = next;
    return { ok: true, saved: next };
  }

  getLatest(): SaveData | null {
    return this.latest;
  }

  /** 导出 JSON 字符串 */
  exportJson(data: SaveData): string {
    return JSON.stringify(data, null, 2);
  }

  /** 导入 JSON；高版本未知 schema 拒绝覆盖 */
  importJson(
    text: string,
    prepareReplacement?: PrepareReplacementSave,
  ): { ok: boolean; data?: SaveData; error?: string } {
    if (this.writesBlockedByFutureSchema) {
      return { ok: false, error: "future_schema_write_blocked" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "invalid_json" };
    }
    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, error: "invalid_json" };
    }
    const raw = parsed as Record<string, unknown>;
    if (typeof raw.schemaVersion === "number" && raw.schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION) {
      return { ok: false, error: "unsupported_schema_version" };
    }
    try {
      // 只修改尚未落盘的解析副本；准备失败或随后校验失败都不会覆盖当前存档。
      prepareReplacement?.(raw);
    } catch {
      return { ok: false, error: "corrupt_save" };
    }
    const result = validateSave(raw);
    if (!result.ok) {
      return { ok: false, error: "corrupt_save" };
    }
    const imported: SaveData = { ...result.data, saveId: result.data.saveId };
    let persisted = false;
    try {
      persisted = this.storage.save(imported);
    } catch {
      persisted = false;
    }
    if (!persisted) return { ok: false, error: "storage_write_failed" };
    this.latest = imported;
    return { ok: true, data: imported };
  }

  /** 准备完整重置，但绝不写入本机存储。 */
  prepareReset(prepareReplacement?: PrepareReplacementSave): PreparedResetOutcome {
    const fresh = freshSaveData(this.nowMs());
    try {
      prepareReplacement?.(fresh as unknown as Record<string, unknown>);
    } catch {
      return { ok: false, data: fresh, error: "save_preparation_failed" };
    }
    const validated = validateSave(fresh);
    if (!validated.ok) {
      return { ok: false, data: fresh, error: "save_preparation_failed" };
    }
    return { ok: true, data: validated.data };
  }

  /** 提交已准备并校验的完整重置候选。 */
  commitPreparedReset(prepared: SaveData): PreparedResetOutcome {
    const validated = validateSave(prepared);
    if (!validated.ok) {
      return { ok: false, data: prepared, error: "save_preparation_failed" };
    }
    // 用户经过二次确认的显式重置允许替换未来版本存档。
    this.writesBlockedByFutureSchema = false;
    let persisted = false;
    try {
      persisted = this.storage.save(validated.data);
    } catch {
      persisted = false;
    }
    if (!persisted) return { ok: false, data: prepared, error: "storage_write_failed" };
    this.latest = validated.data;
    return { ok: true, data: validated.data };
  }

  /** 重置：二次确认由 UI 负责。非云档入口维持原有立即写盘语义。 */
  reset(prepareReplacement?: PrepareReplacementSave): PreparedResetOutcome {
    const prepared = this.prepareReset(prepareReplacement);
    if (!prepared.ok) return prepared;
    return this.commitPreparedReset(prepared.data);
  }

  static namespace(): string {
    return SAVE_NAMESPACE;
  }
}
