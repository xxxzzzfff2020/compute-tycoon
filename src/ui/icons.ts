import {
  AudioLines,
  AudioWaveform,
  Award,
  BadgeDollarSign,
  BookOpen,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleCheckBig,
  Clapperboard,
  CloudCog,
  CodeXml,
  Cpu,
  createElement as createLucideElement,
  Crown,
  Database,
  FileText,
  Gem,
  Globe2,
  GraduationCap,
  HardDrive,
  LockKeyhole,
  LockKeyholeOpen,
  Medal,
  Menu,
  Microscope,
  MonitorCog,
  Moon,
  Network,
  Orbit,
  Palette,
  PartyPopper,
  Puzzle,
  RadioTower,
  Rocket,
  Satellite,
  SatelliteDish,
  ScanLine,
  ServerCog,
  Snowflake,
  Sparkles,
  Star,
  SunMedium,
  Trophy,
  Workflow,
  Zap,
  type IconNode,
} from "lucide";

const ICONS = {
  business: BriefcaseBusiness,
  honor: Trophy,
  sponsor: Clapperboard,
  menu: Menu,
  models: BrainCircuit,
  training: GraduationCap,
  blueprints: Network,
  tech: Cpu,
  eras: Orbit,
  singularity: Gem,
  growth: ChartNoAxesCombined,
  legendary: Crown,
  locked: LockKeyhole,
  unlocked: LockKeyholeOpen,
  achieved: Medal,
  pending: Star,
  terminal: RadioTower,
  moon: Moon,
  satellite: Satellite,
  orbit: Orbit,
  sparkles: Sparkles,
  complete: CircleCheckBig,
  celebration: PartyPopper,
  reward: Award,
  codex: CodeXml,
  vision: Palette,
  voice: AudioLines,
  science: Microscope,
  distill: BrainCircuit,
  scheduler: SatelliteDish,
  o1: FileText,
  o2: Puzzle,
  o3: ScanLine,
  o4: ChartNoAxesCombined,
  o5: BookOpen,
  power: Zap,
  computeCards: MonitorCog,
  compute_center: RadioTower,
  optical: Sparkles,
  storage: Database,
  cooling: Snowflake,
  project_1: BrainCircuit,
  project_2: Globe2,
  project_3: Satellite,
  machine_room_1: ServerCog,
  machine_room_2: Database,
  machine_room_3: Network,
  era_r1: Network,
  era_r2: Globe2,
  era_r3: Orbit,
  bp_general: ServerCog,
  bp_gpu: Cpu,
  bp_interconnect: Workflow,
  talent_growth: ChartNoAxesCombined,
  talent_efficiency: Zap,
  talent_milestone: Star,
  leo_node: Satellite,
  moon_base: Moon,
  lunar_link: Network,
  deep_relay: RadioTower,
  moon_network: Orbit,
  solar_array: SunMedium,
  stellar_node: Sparkles,
  dyson_cloud: CloudCog,
  stellar_model: BrainCircuit,
  dyson_sphere: Orbit,
  cloud: CloudCog,
  wealth: BadgeDollarSign,
  server: ServerCog,
  server_1: ServerCog,
  server_2: HardDrive,
  server_3: Database,
  server_4: MonitorCog,
  server_5: Network,
  server_6: RadioTower,
  server_7: CloudCog,
  server_8: Orbit,
  blueprint_codex: CodeXml,
  blueprint_vision: ScanLine,
  // 蓝图使用波形算力符号，与“语音模型”的麦克风母版保持明确区分；
  // AudioLines 在小尺寸渐变描边下几乎不可见，不能作为可交互升级入口。
  blueprint_voice: AudioWaveform,
  blueprint_science: Cpu,
  blueprint_distill: CloudCog,
  blueprint_scheduler: Workflow,
  archive: HardDrive,
  launch: Rocket,
  default: Sparkles,
} satisfies Record<string, IconNode>;

export type GameIconName = keyof typeof ICONS;

/**
 * 高辨识的经营对象使用透明灰度母版，颜色由运行时主题统一提供。
 * 其余工具型图标继续使用 Lucide，避免为菜单/状态等小图标加载重型位图。
 */
const ICON_ASSETS: Partial<Record<GameIconName, string>> = {
  codex: "earth/model-codex.png",
  vision: "earth/model-vision.png",
  voice: "earth/model-voice.png",
  science: "earth/model-science.png",
  distill: "earth/model-distill.png",
  scheduler: "earth/model-scheduler.png",
  // 订单卡保持五个独立的线性符号。旧位图中 o1/o2 共用同一母版，
  // 缩小时会糊成同一个图案，因此订单统一回到上方 Lucide 图标。
  server: "earth/server-rack.png",
  // 电力设施沿用闪电天赋的灰阶母版；视觉上仍与其他基础设施采用同一主题遮罩体系。
  power: "cosmic/talent-efficiency.png",
  computeCards: "earth/infra-compute-cards.png",
  optical: "earth/infra-optical.png",
  storage: "earth/infra-storage.png",
  singularity: "earth/singularity-core.png",
  bp_general: "cosmic/bp-general.png",
  bp_gpu: "cosmic/bp-gpu.png",
  bp_interconnect: "cosmic/bp-interconnect.png",
  talent_growth: "cosmic/talent-growth.png",
  talent_efficiency: "cosmic/talent-efficiency.png",
  talent_milestone: "cosmic/talent-milestone.png",
  // 三座机房与三项旗舰工程必须是六个不同身份。旗舰工程使用上方独立
  // Lucide 符号；若继续绑定旧位图，缩小后会重新糊成相似的球形轮廓。
  // 时代工程使用独立线性符号，不再复用机房/旗舰工程位图。
  leo_node: "cosmic/leo-node.png",
  moon_base: "cosmic/moon-base.png",
  lunar_link: "cosmic/lunar-link.png",
  deep_relay: "cosmic/deep-relay.png",
  solar_array: "cosmic/solar-array.png",
  // Stage 4/5 的同族对象使用各自的线性符号。这里故意不再把它们映射到
  // 其他项目的位图母版，否则终局页面会出现肉眼可见的重复图标。
  dyson_sphere: "cosmic/dyson-sphere.png",
};

const MUTED_ICON_NAMES = new Set<GameIconName>(["locked", "pending"]);
const CONTENT_ICON_ALIASES: Record<string, GameIconName> = {
  // Stage 3：四种基础设施、三座机房与三组时代工程。
  power: "power",
  compute_cards: "computeCards",
  computeCards: "computeCards",
  compute_center: "compute_center",
  optical: "optical",
  storage: "storage",
  room_1: "machine_room_1",
  room_2: "machine_room_2",
  room_3: "machine_room_3",
  // 科技档案逐项绑定对应的游戏对象图标，禁止全部退化为通用 CPU 图标。
  tech_gpu_array: "computeCards",
  tech_power_modular: "power",
  tech_liquid_cooling: "cooling",
  tech_optical_bus: "optical",
  tech_distributed_storage: "storage",
  tech_auto_scheduler: "blueprint_scheduler",
  tech_regional_network: "project_2",
  tech_llm_training: "blueprint_science",
  // 天赋的真实运行时 id（旧的 growth 别名保留给早期候选数据）。
  blueprint_power: "talent_growth",
  blueprint_growth: "talent_growth",
  blueprint_efficiency: "talent_efficiency",
  blueprint_milestone: "talent_milestone",
  scale_power: "talent_growth",
  scale_growth: "talent_growth",
  scale_efficiency: "talent_efficiency",
  scale_milestone: "talent_milestone",
  project_r1: "era_r1",
  project_r2: "era_r2",
  project_r3: "era_r3",
  // Stage 4/5 数据 id 有时沿用内容名；统一回到已经提供的主题化母版。
  lunar_ai: "moon_base",
  stellar_ai: "stellar_model",
  stellar_node: "stellar_node",
  dyson_cloud: "dyson_cloud",
  moon_network: "moon_network",
  // 档案中的时代条目也必须使用游戏对象图标，不能在已解锁时退化为通用奖章。
  stage1: "codex",
  stage2: "server_1",
  stage3: "computeCards",
  r1: "era_r1",
  r2: "era_r2",
  r3: "era_r3",
  stage4: "moon_base",
  stage5: "stellar_node",
  dyson: "dyson_sphere",
  era_studio: "codex",
  era_own_server: "server_1",
  era_cluster: "server_3",
  era_full_cluster: "server_8",
  era_room1: "machine_room_1",
  era_room2: "machine_room_2",
  era_room3: "machine_room_3",
  era_national: "project_2",
  era_global: "era_r2",
  era_planetary: "era_r3",
  era_orbit: "leo_node",
  era_moon: "moon_base",
  era_solar: "solar_array",
  era_dyson: "dyson_sphere",
  era_galaxy: "dyson_sphere",
  era_universe: "terminal",

  // 成长里程碑必须让玩家一眼区分，不再统一显示同一枚奖章。
  first_model: "codex",
  first_order: "o1",
  first_server: "server_1",
  eight_servers: "server_8",
  first_room: "computeCards",
  three_cores: "singularity",
  four_lunar_nodes: "lunar_link",
  compute_scale: "growth",
  income_scale: "wealth",
};
let gradientSerial = 0;

interface NormalizedIconAsset {
  url: string;
  bounds: string;
}

const normalizedIconCache = new Map<string, Promise<NormalizedIconAsset>>();

function assetUrl(relativePath: string): string {
  // CSS custom-property URLs resolve against the stylesheet rather than the
  // document. A relative `./assets/...` value therefore became
  // `/assets/assets/...` in the built review package. Resolve against the game
  // entry once so image masks work equally from a root page and a packed H5
  // subdirectory.
  return new URL(`assets/visuals/icons/${relativePath}`, document.baseURI).href;
}

/**
 * 内容母版来自不同生成批次，透明边距和视觉中心并不一致。运行时只做一次
 * alpha-bounds 归一化并缓存 data URL，源文件保持不变；这样不会再出现
 * “进阶服务器切歪了”或同为 57px、实际墨迹却大小悬殊的问题。
 */
function normalizeIconAsset(source: string, name: GameIconName): Promise<NormalizedIconAsset> {
  const cacheKey = `${name}:${source}`;
  const cached = normalizedIconCache.get(cacheKey);
  if (cached) return cached;

  const task = new Promise<NormalizedIconAsset>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = Math.max(1, image.naturalWidth || image.width);
        sourceCanvas.height = Math.max(1, image.naturalHeight || image.height);
        const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
        if (!sourceContext) throw new Error("icon_canvas_unavailable");
        sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
        sourceContext.drawImage(image, 0, 0);

        const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
        let minX = sourceCanvas.width;
        let minY = sourceCanvas.height;
        let maxX = -1;
        let maxY = -1;
        // 工程调度母版底部带有一个与主体完全分离的残缺圆弧（反馈 #19406）。
        // 仅在 alpha-bounds 归一化时忽略最底 8%，保留日历与时钟主体。
        const scanHeight = name === "scheduler"
          ? Math.max(1, Math.floor(sourceCanvas.height * 0.92))
          : sourceCanvas.height;
        for (let y = 0; y < scanHeight; y += 1) {
          for (let x = 0; x < sourceCanvas.width; x += 1) {
            if (pixels[(y * sourceCanvas.width + x) * 4 + 3] <= 8) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        if (maxX < minX || maxY < minY) throw new Error("icon_has_no_visible_pixels");

        const sourceWidth = maxX - minX + 1;
        const sourceHeight = maxY - minY + 1;
        const targetCanvas = document.createElement("canvas");
        targetCanvas.width = 256;
        targetCanvas.height = 256;
        const targetContext = targetCanvas.getContext("2d");
        if (!targetContext) throw new Error("icon_target_canvas_unavailable");
        targetContext.imageSmoothingEnabled = true;
        targetContext.imageSmoothingQuality = "high";
        const scale = 224 / Math.max(sourceWidth, sourceHeight);
        const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
        const targetX = Math.round((256 - targetWidth) / 2);
        const targetY = Math.round((256 - targetHeight) / 2);
        targetContext.clearRect(0, 0, 256, 256);
        targetContext.drawImage(
          image,
          minX,
          minY,
          sourceWidth,
          sourceHeight,
          targetX,
          targetY,
          targetWidth,
          targetHeight,
        );
        resolve({
          url: targetCanvas.toDataURL("image/png"),
          bounds: `${minX},${minY},${sourceWidth},${sourceHeight}`,
        });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`icon_load_failed:${source}`));
    image.src = source;
  });
  normalizedIconCache.set(cacheKey, task);
  return task;
}

function createGlyphIcon(name: GameIconName, className: string, relativePath: string): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = `${className} game-icon--glyph game-icon--themed`;
  icon.dataset.iconName = name;
  icon.dataset.normalized = "pending";
  icon.setAttribute("aria-hidden", "true");
  const source = assetUrl(relativePath);
  // 保留旧属性作为测试/回退合同；正式渲染使用归一化后的 --game-icon-image。
  icon.style.setProperty("--game-icon-mask", `url("${source}")`);
  icon.style.setProperty("--game-icon-image", `url("${source}")`);

  const art = document.createElement("img");
  art.className = "game-icon-art";
  art.alt = "";
  art.decoding = "async";
  art.src = source;
  const tint = document.createElement("span");
  tint.className = "game-icon-tint";
  const sheen = document.createElement("span");
  sheen.className = "game-icon-sheen";
  if (name === "scheduler") {
    // 归一化异步完成前先裁掉原图底部残片，避免首帧闪现。
    art.style.clipPath = "inset(0 0 8% 0)";
    tint.style.clipPath = "inset(0 0 8% 0)";
  }
  icon.append(art, tint, sheen);

  void normalizeIconAsset(source, name)
    .then((asset) => {
      art.src = asset.url;
      icon.style.setProperty("--game-icon-image", `url("${asset.url}")`);
      art.style.removeProperty("clip-path");
      tint.style.removeProperty("clip-path");
      icon.dataset.normalized = "ready";
      icon.dataset.sourceBounds = asset.bounds;
    })
    .catch(() => {
      icon.dataset.normalized = "fallback";
    });
  return icon;
}

function createThemedLucideIcon(name: GameIconName, className: string): SVGElement {
  const icon = createLucideElement(ICONS[name], {
    class: className,
    width: "1em",
    height: "1em",
    "aria-hidden": "true",
    focusable: "false",
    "stroke-width": "2",
  }) as unknown as SVGElement;
  icon.dataset.iconName = name;
  if (MUTED_ICON_NAMES.has(name)) {
    icon.classList.add("game-icon--muted");
    return icon;
  }

  const gradientId = `game-icon-gradient-${name}-${gradientSerial += 1}`;
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");
  const gradient = document.createElementNS(ns, "linearGradient");
  gradient.setAttribute("id", gradientId);
  gradient.setAttribute("x1", "0%");
  gradient.setAttribute("y1", "100%");
  gradient.setAttribute("x2", "100%");
  gradient.setAttribute("y2", "0%");
  const start = document.createElementNS(ns, "stop");
  start.setAttribute("offset", "0%");
  start.style.stopColor = "var(--stage-accent, var(--accent, #44c5ff))";
  const end = document.createElementNS(ns, "stop");
  end.setAttribute("offset", "100%");
  end.style.stopColor = "var(--stage-accent-2, #7686ff)";
  gradient.append(start, end);
  defs.appendChild(gradient);
  icon.prepend(defs);
  icon.classList.add("game-icon--themed", "game-icon--line");
  icon.setAttribute("stroke", `url(#${gradientId})`);
  return icon;
}

export function createGameIcon(name: GameIconName, className = "game-icon"): SVGElement | HTMLSpanElement {
  const asset = ICON_ASSETS[name];
  return asset
    ? createGlyphIcon(name, className, asset)
    : createThemedLucideIcon(name, className);
}

/** 主导航、经营子导航和横滑选择器永远使用旧版简洁线性图标。 */
export function createSimpleGameIcon(name: GameIconName, className = "game-icon"): SVGElement {
  const icon = createLucideElement(ICONS[name], {
    class: className,
    width: "1em",
    height: "1em",
    "aria-hidden": "true",
    focusable: "false",
    "stroke-width": "2",
  }) as unknown as SVGElement;
  icon.dataset.iconName = name;
  icon.classList.add("game-icon--line");
  if (MUTED_ICON_NAMES.has(name)) icon.classList.add("game-icon--muted");
  return icon;
}

export function setNavigationIconText(target: HTMLElement, name: GameIconName, text: string): void {
  const currentIcon = target.querySelector<HTMLElement | SVGElement>(":scope > .game-icon");
  const currentLabel = target.querySelector<HTMLElement>(":scope > .game-icon-label");
  if (target.dataset.gameIcon === name && currentLabel?.textContent === text
      && target.dataset.simpleIcon === "true" && currentIcon) return;
  const label = document.createElement("span");
  label.className = "game-icon-label";
  label.textContent = text;
  target.dataset.gameIcon = name;
  target.dataset.simpleIcon = "true";
  target.replaceChildren(createSimpleGameIcon(name), label);
}

export interface GameObjectHeaderOptions {
  subtitle?: string;
  value?: string;
  badge?: string;
  valueClassName?: string;
}

/**
 * 统一的经营对象卡头：左侧大图标，右侧标题、说明与即时数值。
 * 调用方仍持有外层卡片，按钮/进度条/命令语义完全不变。
 */
export function createGameObjectHeader(
  name: GameIconName,
  title: string,
  options: GameObjectHeaderOptions = {},
): HTMLElement {
  const header = document.createElement("div");
  header.className = "game-object-header";
  const iconPlate = document.createElement("div");
  iconPlate.className = "game-object-icon";
  iconPlate.appendChild(createGameIcon(name, "game-icon game-object-glyph"));

  const copy = document.createElement("div");
  copy.className = "game-object-copy";
  const titleEl = document.createElement("div");
  titleEl.className = "game-object-title";
  titleEl.textContent = title;
  copy.appendChild(titleEl);
  if (options.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.className = "game-object-subtitle";
    subtitle.textContent = options.subtitle;
    copy.appendChild(subtitle);
  }
  if (options.value) {
    const value = document.createElement("div");
    value.className = `game-object-value${options.valueClassName ? ` ${options.valueClassName}` : ""}`;
    value.textContent = options.value;
    copy.appendChild(value);
  }
  header.append(iconPlate, copy);
  if (options.badge) {
    const badge = document.createElement("span");
    badge.className = "game-object-badge";
    badge.textContent = options.badge;
    header.appendChild(badge);
  }
  return header;
}

export function setIconText(target: HTMLElement, name: GameIconName, text: string): void {
  const currentIcon = target.querySelector<HTMLElement | SVGElement>(":scope > .game-icon");
  const currentLabel = target.querySelector<HTMLElement>(":scope > .game-icon-label");
  if (target.dataset.gameIcon === name && currentLabel?.textContent === text && currentIcon) return;
  const label = document.createElement("span");
  label.className = "game-icon-label";
  label.textContent = text;
  target.dataset.gameIcon = name;
  target.replaceChildren(createGameIcon(name), label);
}

export function modelGameIcon(modelId: string): GameIconName {
  return modelId in ICONS ? modelId as GameIconName : "models";
}

/** 蓝图是全局算力资产，不复用对应模型本体的大图，避免视觉上像同一张卡重复出现。 */
export function blueprintGameIcon(modelId: string): GameIconName {
  const name = `blueprint_${modelId}`;
  return name in ICONS ? name as GameIconName : "blueprints";
}

/** 八代服务器各自拥有稳定的线性身份；阵列大图仍只表达“规模扩张”。 */
export function serverGameIcon(serverIdOrIndex: string | number): GameIconName {
  const numeric = typeof serverIdOrIndex === "number"
    ? serverIdOrIndex
    : Number(String(serverIdOrIndex).match(/(\d+)/)?.[1] ?? 0);
  const index = Math.min(8, Math.max(1, Number.isFinite(numeric) ? Math.floor(numeric) : 1));
  return `server_${index}` as GameIconName;
}

export function orderGameIcon(orderId: string): GameIconName {
  return orderId in ICONS ? orderId as GameIconName : "business";
}

export function contentGameIcon(contentId: string, fallback: GameIconName = "default"): GameIconName {
  return CONTENT_ICON_ALIASES[contentId] ?? (contentId in ICONS ? contentId as GameIconName : fallback);
}
