import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { afterAll, describe, expect, it } from "vitest";

const siteRoot = resolve(process.cwd(), "public/official-site");
const siteUrl = "https://xxxzzzfff2020.github.io/compute-tycoon/official-site/";
const html = readFileSync(resolve(siteRoot, "index.html"), "utf8");
const css = readFileSync(resolve(siteRoot, "styles.css"), "utf8");
const dom = new JSDOM(html, { url: siteUrl });
const document = dom.window.document;

const platforms = [
  {
    id: "mobile",
    title: "移动端",
    url: "https://tap.cn/ehhPUEEM",
    image: "assets/taptap-mobile-qr.png",
    sha256: "7f452e5d43f8884103d02d200c37be3c959366ece8fb252ed04004f1ff35b097",
  },
  {
    id: "forum",
    title: "论坛",
    url: "https://tap.cn/WmkgVhEh",
    image: "assets/taptap-forum-qr.png",
    sha256: "fc430eed0505e0d8c735c9af0c3ff486ea068dbc8f83d26884a41f2daf9be1d3",
  },
  {
    id: "pc",
    title: "PC 官网",
    url: "https://tap.cn/0cpHLaTw",
    image: "assets/taptap-pc-qr.png",
    sha256: "b96f40fb262fadeb04f64690d802922e60e55852dbc738576c159aba3f7f0e9c",
  },
];

afterAll(() => dom.window.close());

describe("official site platform entries", () => {
  it("replaces the placeholder with three distinct entries reachable from navigation", () => {
    expect(document.querySelectorAll("#play-now [data-platform]")).toHaveLength(3);
    expect(document.querySelector('.primary-nav a[href="#play-now"]')?.textContent).toBe("平台入口");
    expect(html).not.toMatch(/二维码占位|尚不能扫码|移动端入口正在准备中|qr-placeholder/);
    expect(css).not.toMatch(/qr-placeholder|qr-corner|qr-pixel|qr-center/);
  });

  it.each(platforms)("labels and safely links the $id entry", ({ id, title, url }) => {
    const card = document.querySelector(`[data-platform="${id}"]`)!;
    expect(card.querySelector("h3")?.textContent).toBe(title);
    expect(card.getAttribute("aria-labelledby")).toBe(card.querySelector("h3")?.id);
    const link = card.querySelector<HTMLAnchorElement>(".platform-link")!;
    expect(link.href).toBe(url);
    expect(link.target).toBe("_blank");
    expect(link.relList.contains("noopener")).toBe(true);
    expect(link.relList.contains("noreferrer")).toBe(true);
    expect(link.textContent?.trim()).not.toBe("");
  });

  it.each(platforms)("ships the unmodified original $id QR with accessible dimensions", ({ id, image, sha256 }) => {
    const img = document.querySelector<HTMLImageElement>(`[data-platform="${id}"] img`)!;
    expect(img.getAttribute("src")).toBe(image);
    expect(img.alt).toContain("算力大亨");
    expect(img.alt).toContain("二维码");
    expect(img.width).toBe(512);
    expect(img.height).toBe(512);
    expect(img.getAttribute("loading")).toBe("lazy");
    const png = readFileSync(resolve(siteRoot, image));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
    expect(createHash("sha256").update(png).digest("hex")).toBe(sha256);
  });

  it("preserves local single-player access independently of the platform links", () => {
    const gameUrl = "https://xxxzzzfff2020.github.io/compute-tycoon/";
    for (const selector of [".nav-play", ".hero-actions .button-primary", ".play-now-actions .button-primary", ".footer-link"]) {
      expect(document.querySelector<HTMLAnchorElement>(selector)?.href).toBe(gameUrl);
    }
    expect(document.querySelector(".play-now-actions .button-primary")?.textContent).toContain("网页单机版试玩");
  });

  it("keeps the released wordmark trailer and social preview unchanged", () => {
    expect(document.querySelector(".hero-video source")?.getAttribute("src")).toBe(
      "assets/compute-tycoon-trailer.mp4?v=20260827-wordmark-v2",
    );
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      `${siteUrl}assets/compute-tycoon-promo-16x9-1920x1080.jpg?v=20260827-wordmark-v2`,
    );
  });

  it("versions the stylesheet with this release", () => {
    const release = document.querySelector('meta[name="official-site-release"]')?.getAttribute("content");
    expect(release).toBe("20260829-taptap-links-v1");
    expect(document.querySelector('link[rel="stylesheet"]')?.getAttribute("href")).toBe(`styles.css?v=${release}`);
  });

  it("uses three desktop columns, one narrow-screen column, and uncropped QR images", () => {
    expect(css).toMatch(/\.platform-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    const narrowScreenRules = css.split("@media (max-width: 860px) {")[1].split("@media (max-width: 650px) {")[0];
    expect(narrowScreenRules).toMatch(/\.platform-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    expect(css).toMatch(/\.platform-qr\s*\{[^}]*padding:\s*12px;[^}]*background:\s*#fff;/s);
    expect(css).toMatch(/\.platform-qr img\s*\{[^}]*height:\s*auto;[^}]*object-fit:\s*contain;/s);
    expect(css).toMatch(/\.platform-card \.platform-link\s*\{[^}]*min-width:\s*0;[^}]*min-height:\s*48px;/s);
  });
});
