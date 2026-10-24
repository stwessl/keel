import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.7.1";
const URL = `https://github.com/RawAccelOfficial/rawaccel/releases/download/v${VERSION}/RawAccel_v${VERSION}.zip`;
const SHA256 = "770fe3ae0919ca3c4d412f58c985eb27f5434decad809f7e8206de4e8852eec4";
const FILES = ["writer.exe", "wrapper.dll", "Newtonsoft.Json.dll", "installer.exe", "uninstaller.exe", "LICENSE", "driver/rawaccel.sys"];

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "vendor", "rawaccel");
const stamp = path.join(target, "VERSION");

if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === VERSION && FILES.every((file) => fs.existsSync(path.join(target, file)))) {
  console.log(`RawAccel ${VERSION} already in ${target}`);
  process.exit(0);
}

const response = await fetch(URL);
if (!response.ok) throw new Error(`Download failed: ${response.status} ${URL}`);
const zip = Buffer.from(await response.arrayBuffer());
const digest = crypto.createHash("sha256").update(zip).digest("hex");
if (digest !== SHA256) throw new Error(`RawAccel download does not match the published checksum (${digest}).`);

const work = fs.mkdtempSync(path.join(os.tmpdir(), "keel-rawaccel-"));
try {
  const archive = path.join(work, "rawaccel.zip");
  fs.writeFileSync(archive, zip);
  execFileSync("tar", ["-xf", archive, "-C", work]);
  fs.rmSync(target, { recursive: true, force: true });
  for (const file of FILES) {
    const destination = path.join(target, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(work, "RawAccel", file), destination);
  }
  fs.writeFileSync(stamp, `${VERSION}\n`);
  console.log(`RawAccel ${VERSION} verified and unpacked to ${target}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
