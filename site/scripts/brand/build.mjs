// One-off: renders the share image and the raster icons from the SVG mark.
//   node scripts/brand/build.mjs
// Writes src/app/opengraph-image.png, twitter-image.png, apple-icon.png and
// src/app/favicon.ico (16+32+48). Fonts come from Google Fonts at render time.
import { chromium } from "playwright";
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "../../src/app");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto("file://" + path.join(here, "og.html"));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const og = await page.screenshot({ type: "png" });
await browser.close();
writeFileSync(path.join(app, "opengraph-image.png"), og);
writeFileSync(path.join(app, "twitter-image.png"), og);

const svg = readFileSync(path.join(app, "icon.svg"));
const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
writeFileSync(path.join(app, "apple-icon.png"), await png(180));

// favicon.ico: a container of 16/32/48 PNG-encoded images (ICO allows PNG entries).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
const dir = Buffer.alloc(16 * sizes.length);
let offset = 6 + dir.length;
images.forEach((img, i) => {
  const o = i * 16;
  dir.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], o); dir.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], o + 1);
  dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
  dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(img.length, o + 8); dir.writeUInt32LE(offset, o + 12);
  offset += img.length;
});
writeFileSync(path.join(app, "favicon.ico"), Buffer.concat([header, dir, ...images]));
console.log("brand: opengraph-image.png, twitter-image.png, apple-icon.png, favicon.ico");
