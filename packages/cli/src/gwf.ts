import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import gwf from "../gwf-version.json" with { type: "json" };

export const GWF_VERSION: string = gwf.version;

const RELEASES = "https://github.com/thegreenwebfoundation/grid-intensity-go/releases/download";

const OS_NAMES: Record<string, string> = { linux: "Linux", darwin: "Darwin", win32: "Windows" };
const ARCH_NAMES: Record<string, string> = { x64: "x86_64", arm64: "arm64" };

/** The upstream release asset for a platform, or undefined if GWF doesn't build one. */
export function assetName(platform: string, arch: string): string | undefined {
  const os = OS_NAMES[platform];
  const cpu = ARCH_NAMES[arch];
  if (!os || !cpu) return undefined;
  return `grid-intensity_${os}_${cpu}.${platform === "win32" ? "zip" : "tar.gz"}`;
}

/** Where downloaded binaries are kept, one folder per GWF version. */
export function cacheDir(
  env: Record<string, string | undefined> = process.env,
  platform = process.platform,
): string {
  const base =
    env.XDG_CACHE_HOME ||
    (platform === "win32" ? env.LOCALAPPDATA : undefined) ||
    join(homedir(), platform === "darwin" ? "Library/Caches" : ".cache");
  return join(base, "grid-aware-cli", `grid-intensity-${GWF_VERSION}`);
}

export function binaryName(platform = process.platform): string {
  return platform === "win32" ? "grid-intensity.exe" : "grid-intensity";
}

export function cachedBinary(env = process.env, platform = process.platform): string {
  return join(cacheDir(env, platform), binaryName(platform));
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded with ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Checks a download against the `sha256  filename` lines of upstream's checksums.txt. */
export function verifyChecksum(data: Buffer, asset: string, checksums: string): void {
  const line = checksums.split("\n").find((l) => l.trim().endsWith(` ${asset}`) || l.trim().endsWith(`\t${asset}`));
  const expected = line?.trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(data).digest("hex");
  if (!expected) throw new Error(`No checksum listed for ${asset}`);
  if (actual !== expected) throw new Error(`Checksum mismatch for ${asset}`);
}

/** Unpacks into `dir` using relative names, because GNU tar reads a Windows drive letter as a remote host. */
function extract(asset: string, dir: string): void {
  if (!asset.endsWith(".zip")) execFileSync("tar", ["-xf", asset], { cwd: dir });
  else if (process.platform === "win32") {
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${asset}' -DestinationPath .`], { cwd: dir });
  } else execFileSync("unzip", ["-q", asset], { cwd: dir });
}

/** Downloads the pinned grid-intensity for this machine into the cache, if it isn't there already. Returns its path. */
export async function ensureBinary(
  log: (message: string) => void = () => {},
  platform = process.platform,
  arch = process.arch,
  env = process.env,
): Promise<string> {
  const target = cachedBinary(env, platform);
  if (existsSync(target)) return target;
  const asset = assetName(platform, arch);
  if (!asset) throw new Error(`No grid-intensity build for ${platform}-${arch}`);

  log(`Downloading grid-intensity v${GWF_VERSION} (first run only)...`);
  const base = `${RELEASES}/v${GWF_VERSION}`;
  const [data, checksums] = await Promise.all([download(`${base}/${asset}`), download(`${base}/checksums.txt`)]);
  verifyChecksum(data, asset, checksums.toString("utf8"));

  const work = mkdtempSync(join(tmpdir(), "grid-aware-"));
  try {
    writeFileSync(join(work, asset), data);
    extract(asset, work);
    const dir = cacheDir(env, platform);
    mkdirSync(dir, { recursive: true });
    // Copy then rename, so a half-written file is never mistaken for a finished one.
    const partial = `${target}.${process.pid}`;
    copyFileSync(join(work, binaryName(platform)), partial);
    if (platform !== "win32") chmodSync(partial, 0o755);
    renameSync(partial, target);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return target;
}
