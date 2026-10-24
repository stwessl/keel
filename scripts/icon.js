// Run with Electron: `npx electron scripts/icon.js`. Draws the Keel icon at each
// size natively (so small sizes stay crisp) and writes build/icon.ico and build/icon.png.
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "build");
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

function draw(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  const s = size / 256;
  const radius = 56 * s;
  g.beginPath();
  g.roundRect(8 * s, 8 * s, 240 * s, 240 * s, radius);
  const back = g.createLinearGradient(0, 0, 0, size);
  back.addColorStop(0, "#2a221b");
  back.addColorStop(1, "#0b0908");
  g.fillStyle = back;
  g.fill();
  g.lineWidth = Math.max(1, 4 * s);
  g.strokeStyle = "#5a4636";
  g.stroke();

  const c = 128 * s;
  if (size >= 24) {
    g.strokeStyle = "#e8d8c4";
    g.lineCap = "round";
    g.lineWidth = Math.max(1.5, 12 * s);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.beginPath();
      g.moveTo(c + dx * 76 * s, c + dy * 76 * s);
      g.lineTo(c + dx * 98 * s, c + dy * 98 * s);
      g.stroke();
    }
  }

  const orb = (size >= 24 ? 58 : 80) * s;
  const shade = g.createRadialGradient(c - orb * 0.35, c - orb * 0.4, orb * 0.1, c, c, orb);
  shade.addColorStop(0, "#ffd2a6");
  shade.addColorStop(0.45, "#e08a45");
  shade.addColorStop(1, "#7a3a14");
  g.beginPath();
  g.arc(c, c, orb, 0, Math.PI * 2);
  g.fillStyle = shade;
  g.fill();
  return canvas.toDataURL("image/png");
}

function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadURL("about:blank");
  const decode = (url) => Buffer.from(url.split(",")[1], "base64");
  const images = [];
  for (const size of [...SIZES, 512]) {
    const url = await window.webContents.executeJavaScript(`(${draw.toString()})(${size})`);
    images.push({ size, png: decode(url) });
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "icon.png"), images.at(-1).png);
  fs.writeFileSync(path.join(out, "icon.ico"), ico(images.slice(0, -1)));
  console.log(`wrote ${path.join(out, "icon.ico")} and icon.png`);
  app.quit();
});
