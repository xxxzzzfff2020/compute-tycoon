import {
  AudioLines,
  Award,
  BadgeDollarSign,
  BookOpen,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  ChartNoAxesColumnIncreasing,
  ChartNoAxesCombined,
  CircleCheckBig,
  CloudCog,
  CodeXml,
  Cpu,
  createElement as createLucideElement,
  Crown,
  Database,
  FileText,
  Gem,
  Globe2,
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
  sponsor: BadgeDollarSign,
  menu: Menu,
  models: BrainCircuit,
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
  o4: ChartNoAxesColumnIncreasing,
  o5: BookOpen,
  power: Zap,
  computeCards: MonitorCog,
  optical: Sparkles,
  storage: Database,
  project_1: BrainCircuit,
  project_2: Globe2,
  project_3: Satellite,
  era_r1: Network,
  era_r2: Globe2,
  era_r3: Orbit,
  bp_general: ServerCog,
  bp_gpu: Cpu,
  bp_interconnect: Workflow,
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
  archive: HardDrive,
  launch: Rocket,
  default: Sparkles,
} satisfies Record<string, IconNode>;

export type GameIconName = keyof typeof ICONS;

export function createGameIcon(name: GameIconName, className = "game-icon"): SVGElement {
  return createLucideElement(ICONS[name], {
    class: className,
    width: "1em",
    height: "1em",
    "aria-hidden": "true",
    focusable: "false",
    "stroke-width": "2",
  }) as unknown as SVGElement;
}

export function setIconText(target: HTMLElement, name: GameIconName, text: string): void {
  const currentLabel = target.querySelector<HTMLElement>(":scope > .game-icon-label");
  if (target.dataset.gameIcon === name && currentLabel?.textContent === text) return;
  const label = document.createElement("span");
  label.className = "game-icon-label";
  label.textContent = text;
  target.dataset.gameIcon = name;
  target.replaceChildren(createGameIcon(name), label);
}

export function modelGameIcon(modelId: string): GameIconName {
  return modelId in ICONS ? modelId as GameIconName : "models";
}

export function orderGameIcon(orderId: string): GameIconName {
  return orderId in ICONS ? orderId as GameIconName : "business";
}

export function contentGameIcon(contentId: string, fallback: GameIconName = "default"): GameIconName {
  return contentId in ICONS ? contentId as GameIconName : fallback;
}
