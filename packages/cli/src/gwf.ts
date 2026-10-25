import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import gwf from "../gwf-version.json" with { type: "json" };

/** The `grid-intensity` release this CLI downloads. */
export const GWF_VERSION: string = gwf.version;

const RELEASES = "https://github.com/thegreenwebfoundation/grid-intensity-go/releases/download";
const OS_NAMES: Record<string, string> = { linux: "Linux", darwin: "Darwin", win32: "Windows" };
const ARCH_NAMES: Record<string, string> = { x64: "x86_64", arm64: "arm64" };
const EXE = process.platform === "win32" ? "grid-intensity.exe" : "grid-intensity";

/** What came back from `grid-intensity`. stdout and stderr are only filled in when captured. */
export interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** The release asset for a platform, or undefined if GWF doesn't build one. */
export function assetName(platform: string, arch: string): string | undefined {
  const os = OS_NAMES[platform];
  const cpu = ARCH_NAMES[arch];
  return os && cpu ? `grid-intensity_${os}_${cpu}.${platform === "win32" ? "zip" : "tar.gz"}` : undefined;
}

/** The folder is per version, so changing the pin downloads the new release. */
export function cachedBinary(): string {
  const base =
    process.env.XDG_CACHE_HOME ||
    (process.platform === "win32" ? process.env.LOCALAPPDATA : undefined) ||
    join(homedir(), process.platform === "darwin" ? "Library/Caches" : ".cache");
  return join(base, "grid-aware-cli", `grid-intensity-${GWF_VERSION}`, EXE);
}

/** Throws unless `data` matches its line in the release's checksums.txt. */
export function verifyChecksum(data: Buffer, asset: string, checksums: string): void {
  const expected = checksums
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find(([, file]) => file === asset)?.[0];
  if (!expected) throw new Error(`No checksum listed for ${asset}`);
  if (createHash("sha256").update(data).digest("hex") !== expected) throw new Error(`Checksum mismatch for ${asset}`);
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded with ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Uses relative names, because GNU tar reads a Windows drive letter as a remote host. */
function extract(asset: string, dir: string): void {
  if (!asset.endsWith(".zip")) execFileSync("tar", ["-xf", asset], { cwd: dir });
  else if (process.platform === "win32") {
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${asset}' -DestinationPath .`], { cwd: dir });
  } else execFileSync("unzip", ["-q", asset], { cwd: dir });
}

/** Downloads the binary on first use, so NESO-only users never need it. */
export async function ensureBinary(): Promise<void> {
  const target = cachedBinary();
  if (existsSync(target)) return;
  const asset = assetName(process.platform, process.arch);
  if (!asset) throw new Error(`No grid-intensity build for ${process.platform}-${process.arch}`);

  console.error(`Downloading grid-intensity v${GWF_VERSION} (first run only)...`);
  const base = `${RELEASES}/v${GWF_VERSION}`;
  const [data, checksums] = await Promise.all([download(`${base}/${asset}`), download(`${base}/checksums.txt`)]);
  verifyChecksum(data, asset, checksums.toString("utf8"));

  const work = mkdtempSync(join(tmpdir(), "grid-aware-"));
  try {
    writeFileSync(join(work, asset), data);
    extract(asset, work);
    mkdirSync(dirname(target), { recursive: true });
    // Renamed into place so an interrupted download is never mistaken for a finished one.
    const partial = `${target}.${process.pid}`;
    copyFileSync(join(work, EXE), partial);
    if (process.platform !== "win32") chmodSync(partial, 0o755);
    renameSync(partial, target);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** PATH is last so a failed download can still fall back to an installed copy. */
export function resolveBinary(
  env: Record<string, string | undefined> = process.env,
  cached: string = cachedBinary(),
  exists: (path: string) => boolean = existsSync,
): string {
  return env.GRID_INTENSITY_BIN || (exists(cached) ? cached : "grid-intensity");
}

/**
 * Runs `grid-intensity`. Without `capture` it shares our terminal, so the exporter and prompts work.
 * Status 127 (the shell's "command not found") means it couldn't be started.
 */
export async function runGridIntensity(args: readonly string[], capture: boolean): Promise<ExecResult> {
  if (!process.env.GRID_INTENSITY_BIN) await ensureBinary().catch(() => undefined);
  const result = spawnSync(resolveBinary(), args, {
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  if (result.error) {
    const stderr = "Couldn't run grid-intensity. Check your connection, or point GRID_INTENSITY_BIN at a binary from https://github.com/thegreenwebfoundation/grid-intensity-go/releases.\n";
    return { status: 127, stdout: "", stderr };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
