import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { bgmPhaseProfile, GAME_BGM_PATHS, GameAudio } from "../../src/audio/game-audio";
import { MODELS, ORDERS } from "../../src/data/content";
import { BLUEPRINTS, ERA_PROJECTS, FLAGSHIP_PROJECTS, INFRASTRUCTURES, MACHINE_ROOMS, TECH_ARCHIVES } from "../../src/data/stage3";
import { STAGE4_FINAL_PROJECT, STAGE4_NODES } from "../../src/economy/stage4";
import { STAGE5_FINAL_PROJECT, STAGE5_NODES } from "../../src/economy/stage5";
import { TALENT_NODES } from "../../src/economy/incremental-growth";
import { contentGameIcon, createGameIcon, type GameIconName } from "../../src/ui/icons";

describe("original presentation assets", () => {
  it("uses a neutral video-ad icon instead of a currency badge for the ad page", () => {
    const icons = readFileSync(resolve(process.cwd(), "src/ui/icons.ts"), "utf8");
    expect(icons).toContain("sponsor: Clapperboard");
    expect(icons).not.toContain("sponsor: BadgeDollarSign");
  });

  it("assigns every Technology Archive entry a distinct project-native icon", () => {
    const icons = TECH_ARCHIVES.map((technology) => contentGameIcon(technology.id, "tech"));
    expect(new Set(icons).size).toBe(TECH_ARCHIVES.length);
    expect(icons).not.toContain("tech");
    expect(icons).not.toContain("default");
  });

  it("maps every gameplay stage onto its own independent BGM file", () => {
    expect(bgmPhaseProfile(1, 0)).toEqual({ key: "stage1", path: GAME_BGM_PATHS.stage1 });
    expect(bgmPhaseProfile(2, 0)).toEqual({ key: "stage2", path: GAME_BGM_PATHS.stage2 });
    expect(bgmPhaseProfile(3, 3)).toEqual({ key: "stage3", path: GAME_BGM_PATHS.stage3 });
    expect(bgmPhaseProfile(4, 3)).toEqual({ key: "stage4", path: GAME_BGM_PATHS.stage4 });
    expect(bgmPhaseProfile(5, 3)).toEqual({ key: "stage5", path: GAME_BGM_PATHS.stage5 });
    expect(new Set(Object.values(GAME_BGM_PATHS)).size).toBe(5);
  });

  it("does not alter the stage track when technology iterations change", () => {
    expect(bgmPhaseProfile(1, 0)).toEqual(bgmPhaseProfile(1, 3));
    expect(bgmPhaseProfile(3, 0)).toEqual(bgmPhaseProfile(3, 3));
  });

  it("switches the audio source on stage changes and keeps each file looping", async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalLocalStorage = globalThis.localStorage;
    const originalAudio = globalThis.Audio;

    class FakeAudio {
      static instances: FakeAudio[] = [];
      src: string;
      preload = "";
      loop = false;
      volume = 1;
      currentTime = 0;
      paused = true;
      loadCount = 0;

      constructor(src: string) {
        this.src = src;
        FakeAudio.instances.push(this);
      }

      setAttribute(): void {}
      removeAttribute(name: string): void {
        if (name === "src") this.src = "";
      }
      load(): void { this.loadCount += 1; }
      pause(): void { this.paused = true; }
      async play(): Promise<void> { this.paused = false; }
    }

    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      localStorage: dom.window.localStorage,
      Audio: FakeAudio,
    });

    try {
      const audio = new GameAudio();
      audio.install();
      dom.window.dispatchEvent(new dom.window.Event("pointerdown"));
      await Promise.resolve();

      const bgm = FakeAudio.instances[0];
      expect(bgm.src).toBe(GAME_BGM_PATHS.stage1);
      expect(bgm.loop).toBe(true);
      expect(bgm.preload).toBe("metadata");

      audio.setPhase(2, 0);
      expect(bgm.src).toBe(GAME_BGM_PATHS.stage2);
      expect(bgm.currentTime).toBe(0);
      expect(bgm.loadCount).toBe(1);

      bgm.currentTime = 42;
      audio.setPhase(2, 3);
      expect(bgm.src).toBe(GAME_BGM_PATHS.stage2);
      expect(bgm.currentTime).toBe(42);
      expect(bgm.loadCount).toBe(1);

      audio.setPhase(5, 3);
      expect(bgm.src).toBe(GAME_BGM_PATHS.stage5);
      expect(bgm.currentTime).toBe(0);
      expect(bgm.loadCount).toBe(2);
      audio.destroy();
    } finally {
      Object.assign(globalThis, {
        window: originalWindow,
        document: originalDocument,
        localStorage: originalLocalStorage,
        Audio: originalAudio,
      });
      dom.window.close();
    }
  });

  it("ships bounded local audio and final-key-art files", () => {
    const bgmFiles = Object.values(GAME_BGM_PATHS).map((path) => resolve(process.cwd(), "public", path.replace(/^\.?\//, "")));
    const art = resolve(process.cwd(), "public/assets/visuals/dyson-compute-sphere-keyart-v1.jpg");
    for (const bgm of bgmFiles) {
      expect(readFileSync(bgm).subarray(0, 3).toString("ascii")).toBe("ID3");
      expect(statSync(bgm).size).toBeLessThan(4 * 1024 * 1024);
    }
    expect(bgmFiles.reduce((total, bgm) => total + statSync(bgm).size, 0)).toBeLessThan(14 * 1024 * 1024);
    expect(existsSync(resolve(process.cwd(), "public/assets/audio/sfx"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "public/assets/audio/compute-tycoon-stellar-tide-v1.mp3"))).toBe(false);
    expect(readFileSync(art).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(statSync(art).size).toBeLessThan(400 * 1024);
  });

  it("keeps the server-scale illustration centered inside its reserved 2:1 frame", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/main.css"), "utf8");
    const svg = readFileSync(resolve(process.cwd(), "public/assets/visuals/server-rack-array-v1.svg"), "utf8");
    expect(css).toContain(".server-rack-visual-panel");
    expect(css).toContain("aspect-ratio: 2 / 1");
    expect(css).toContain("object-position: center");
    expect(css).toContain("right: 16px");
    expect(svg).toContain('viewBox="0 0 640 320"');
    expect(svg).toContain('transform="translate(36 36)"');
  });

  it("keeps the server detail icon on its grid instead of shrinking it as a flex item", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/main.css"), "utf8");
    expect(css).toMatch(/\.growth-card-title:not\(\.game-object-header\)\s*\{[^}]*display:\s*flex/s);
    expect(css).not.toMatch(/\.growth-card-title\s*\{[^}]*display:\s*flex/s);
    expect(css).toMatch(/@media \(max-width:\s*350px\)\s*\{[^}]*\.game-object-header\s*\{[^}]*grid-template-columns:\s*64px\s+minmax\(0,\s*1fr\)/s);
  });

  it("resolves generated icon masks from the game document instead of the stylesheet directory", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.test/packed-h5/index.html",
    });
    const originalDocument = globalThis.document;
    Object.assign(globalThis, { document: dom.window.document });

    try {
      const icon = createGameIcon("server") as HTMLSpanElement;
      expect(icon.style.getPropertyValue("--game-icon-mask")).toBe(
        'url("https://example.test/packed-h5/assets/visuals/icons/earth/server-rack.png")',
      );
    } finally {
      Object.assign(globalThis, { document: originalDocument });
      dom.window.close();
    }
  });

  it("keeps exactly one central expansion marker from the server illustration", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/main.css"), "utf8");
    const render = readFileSync(resolve(process.cwd(), "src/ui/render.ts"), "utf8");
    expect(render).toContain("server-rack-array-v1.svg");
    expect(render).not.toContain("server-rack-core-pulse");
    expect(css).not.toContain("server-rack-core-pulse");
    expect(render).not.toContain("server-rack-live-leds");
  });

  it("gives company identity, experience and cumulative revenue three fixed header rows", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/main.css"), "utf8");
    const render = readFileSync(resolve(process.cwd(), "src/ui/render.ts"), "utf8");
    expect(render).toContain("stat-company-line stat-company-identity");
    expect(render).toContain("stat-company-line stat-company-experience");
    expect(css).toMatch(/\.stat-company\s*\{[^}]*display:\s*grid[^}]*grid-column:\s*1\s*\/\s*-1/s);
    expect(css).toMatch(/\.stat-company-line\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
    expect(css).toMatch(/\.stat-revenue\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*white-space:\s*nowrap[^}]*text-align:\s*left/s);
  });

  it("defines a formal release build that compiles out speed controls and URL review shortcuts", () => {
    const config = readFileSync(resolve(process.cwd(), "vite.release.config.ts"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/app/main.ts"), "utf8");
    const render = readFileSync(resolve(process.cwd(), "src/ui/render.ts"), "utf8");
    expect(config).toContain('"import.meta.env.VITE_RELEASE_PACKAGE": JSON.stringify("1")');
    expect(config).toContain('outDir: "dist-release"');
    expect(config).toContain('rm(resolve("dist-release", "bgm-review.html")');
    expect(main).toContain("RELEASE_PACKAGE_MODE || reviewOverride || OWNER_NATURAL_REVIEW_MODE");
    expect(main).toContain("!RELEASE_PACKAGE_MODE && !OWNER_NATURAL_REVIEW_MODE");
    expect(render).toContain('RELEASE_PACKAGE_MODE ? "" : `<div class="game-menu-debug platform-review-debug"');
  });

  it("renders the data-report order with visible vector geometry", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
    const originalDocument = globalThis.document;
    Object.assign(globalThis, { document: dom.window.document });

    try {
      const icon = createGameIcon("o4");
      expect(icon.tagName.toLowerCase()).toBe("svg");
      expect(icon.getAttribute("data-icon-name")).toBe("o4");
      expect(icon.querySelectorAll("path, line, polyline, rect").length).toBeGreaterThan(0);
    } finally {
      Object.assign(globalThis, { document: originalDocument });
      dom.window.close();
    }
  });

  it("keeps four task cells inside each self-sizing order card", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/main.css"), "utf8");
    expect(css).toMatch(/\.order-task-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).toMatch(/\.order-board \.order-row\s*\{[^}]*min-height:\s*254px/s);
    expect(css).not.toContain("height: 154px");
    expect(css).not.toContain(".order-board .active-orders");
  });

  it("trims the detached scheduler arc before and after icon normalization", () => {
    const icons = readFileSync(resolve(process.cwd(), "src/ui/icons.ts"), "utf8");
    expect(icons).toContain('name === "scheduler"');
    expect(icons).toContain("sourceCanvas.height * 0.92");
    expect(icons).toContain('clipPath = "inset(0 0 8% 0)"');
  });

  it("provides themed P0/P1 icons for every planned content family", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
    const originalDocument = globalThis.document;
    Object.assign(globalThis, { document: dom.window.document });

    try {
      const p0AndP1Icons = [
        "codex", "vision", "voice", "science", "distill", "scheduler",
        "o1", "o2", "o3", "o4", "o5",
        "server", "power", "computeCards", "optical", "storage",
        "talent_growth", "talent_efficiency", "talent_milestone",
        "project_1", "project_2", "project_3", "machine_room_1", "machine_room_2", "machine_room_3",
        "era_r1", "era_r2", "era_r3",
        "leo_node", "moon_base", "lunar_link", "deep_relay", "solar_array",
        "moon_network", "stellar_node", "dyson_cloud", "stellar_model", "dyson_sphere",
        "singularity",
      ] as const;
      for (const name of p0AndP1Icons) {
        expect(createGameIcon(name).classList.contains("game-icon--themed")).toBe(true);
      }

      expect(contentGameIcon("blueprint_power")).toBe("talent_growth");
      expect(contentGameIcon("scale_power")).toBe("talent_growth");
      expect(contentGameIcon("room_1")).toBe("machine_room_1");
      expect(new Set([
        contentGameIcon("room_1"), contentGameIcon("room_2"), contentGameIcon("room_3"),
        contentGameIcon("project_1"), contentGameIcon("project_2"), contentGameIcon("project_3"),
      ]).size).toBe(6);
      expect(contentGameIcon("era_dyson")).toBe("dyson_sphere");
      expect(contentGameIcon("moon_network")).toBe("moon_network");
      expect(contentGameIcon("stellar_node")).toBe("stellar_node");
      expect(contentGameIcon("dyson_cloud")).toBe("dyson_cloud");
      expect(contentGameIcon("stellar_ai")).toBe("stellar_model");
    } finally {
      Object.assign(globalThis, { document: originalDocument });
      dom.window.close();
    }
  });

  it("keeps every live P0/P1 gameplay definition on a themed icon", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
    const originalDocument = globalThis.document;
    Object.assign(globalThis, { document: dom.window.document });

    try {
      const names: GameIconName[] = [
        ...MODELS.map((item) => contentGameIcon(item.id)),
        ...ORDERS.map((item) => contentGameIcon(item.id)),
        "server", // 同一套母版承载八个服务器世代，色彩由阶段主题决定。
        ...INFRASTRUCTURES.map((item) => contentGameIcon(item.id)),
        ...BLUEPRINTS.map((item) => contentGameIcon(item.id)),
        ...TALENT_NODES.map((item) => contentGameIcon(item.id)),
        ...MACHINE_ROOMS.map((item) => contentGameIcon(item.id)),
        ...FLAGSHIP_PROJECTS.map((item) => contentGameIcon(item.id)),
        ...ERA_PROJECTS.map((item) => contentGameIcon(item.id)),
        "singularity", // 三枚核心均复用同一枚主题化核心母版。
        ...STAGE4_NODES.map((item) => contentGameIcon(item.id)),
        contentGameIcon(STAGE4_FINAL_PROJECT.id),
        ...STAGE5_NODES.map((item) => contentGameIcon(item.id)),
        contentGameIcon(STAGE5_FINAL_PROJECT.id),
      ];
      for (const name of names) {
        expect(createGameIcon(name).classList.contains("game-icon--themed")).toBe(true);
      }
    } finally {
      Object.assign(globalThis, { document: originalDocument });
      dom.window.close();
    }
  });

  it("keeps compact orders, flagship projects and key milestones visually distinct", () => {
    expect(new Set(ORDERS.map((item) => contentGameIcon(item.id))).size).toBe(ORDERS.length);
    expect(new Set(FLAGSHIP_PROJECTS.map((item) => contentGameIcon(item.id))).size).toBe(FLAGSHIP_PROJECTS.length);
    expect(new Set(ERA_PROJECTS.map((item) => contentGameIcon(item.id))).size).toBe(ERA_PROJECTS.length);

    const keyMilestoneIds = [
      "first_model", "first_order", "first_server", "eight_servers", "first_room",
      "r1", "r2", "r3", "three_cores", "stage4", "four_lunar_nodes",
      "stage5", "dyson", "compute_scale", "income_scale",
    ];
    expect(new Set(keyMilestoneIds.map((id) => contentGameIcon(id))).size).toBe(keyMilestoneIds.length);
  });

  it("keeps P0/P1 motion state-driven, bounded, and pausable", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/main.css"), "utf8");
    const render = readFileSync(resolve(process.cwd(), "src/ui/render.ts"), "utf8");
    expect(render).toContain("function refreshVisualMotionBudget");
    expect(render).toContain("index < 6");
    expect(render).toContain("getBoundingClientRect");
    expect(render).toContain('window.addEventListener("scroll", requestVisualMotionBudgetRefresh');
    expect(render).toContain('window.removeEventListener("scroll", requestVisualMotionBudgetRefresh');
    expect(render).toContain('dataset.visualMotion = "running"');
    expect(render).toContain('dataset.visualMotion = "ready"');
    expect(render).toContain('dataset.visualMotion = "claim"');
    expect(render).toContain("function scheduleVisualBurst");
    expect(css).toContain('[data-visual-motion="running"].visual-motion-active');
    expect(css).toContain('[data-visual-motion="ready"].visual-motion-active');
    expect(css).toContain(".visual-paused *");
    expect(css).toContain("[data-visual-motion] .game-icon--themed");
    expect(css).toContain("animation: none !important;");
    expect(css).not.toContain("serverRackCorePulse");
    expect(css).toContain("serverRackBadgePulse");
  });
});
