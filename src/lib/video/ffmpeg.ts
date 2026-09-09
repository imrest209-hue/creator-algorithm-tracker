import { spawn } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

/**
 * FFMPEG WRAPPER
 * ---------------------------------------------------------------------------
 * This app runs locally, so clip rendering shells out to a real FFmpeg binary
 * rather than using ffmpeg.wasm - near-native speed, full filter support, and
 * no multi-hundred-MB WASM payload in the browser.
 *
 * Resolution order for the binary: an explicit FFMPEG_PATH env var, then
 * whatever is on PATH, then the known winget install location (winget adds
 * FFmpeg to PATH but an already-running dev server won't have picked that up
 * until it's restarted, which is exactly the case right after installing it).
 */

const WINGET_PACKAGES = path.join(
  process.env.LOCALAPPDATA ?? '',
  'Microsoft',
  'WinGet',
  'Packages',
);

let cachedFfmpeg: string | null = null;
let cachedFfprobe: string | null = null;

async function isExecutable(candidate: string): Promise<boolean> {
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Scans the winget package dir for a Gyan.FFmpeg install's bin/<name>.exe. */
async function findInWinget(name: string): Promise<string | null> {
  if (!process.env.LOCALAPPDATA) return null;
  try {
    const entries = await readdir(WINGET_PACKAGES, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.toLowerCase().includes('ffmpeg')) continue;
      const packageDir = path.join(WINGET_PACKAGES, entry.name);
      const builds = await readdir(packageDir, { withFileTypes: true });
      for (const build of builds) {
        if (!build.isDirectory()) continue;
        const candidate = path.join(packageDir, build.name, 'bin', name + '.exe');
        if (await isExecutable(candidate)) return candidate;
      }
    }
  } catch {
    // Winget dir missing entirely - fine, we just fall through to null.
  }
  return null;
}

async function resolveBinary(name: 'ffmpeg' | 'ffprobe'): Promise<string | null> {
  const override = process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'];
  if (override && (await isExecutable(override))) return override;

  // Bare name works when PATH already has it; spawn will fail fast if not.
  if (await canSpawn(name)) return name;

  return findInWinget(name);
}

function canSpawn(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['-version'], { windowsHide: true });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

export async function ffmpegPath(): Promise<string | null> {
  if (cachedFfmpeg) return cachedFfmpeg;
  cachedFfmpeg = await resolveBinary('ffmpeg');
  return cachedFfmpeg;
}

export async function ffprobePath(): Promise<string | null> {
  if (cachedFfprobe) return cachedFfprobe;
  cachedFfprobe = await resolveBinary('ffprobe');
  return cachedFfprobe;
}

export interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** Reads real duration/dimensions from a file - never guessed or defaulted. */
export async function probeVideo(filePath: string): Promise<ProbeResult | null> {
  const probe = await ffprobePath();
  if (!probe) return null;

  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-show_entries', 'stream=width,height,codec_type',
    '-of', 'json',
    filePath,
  ];

  return new Promise((resolve) => {
    const child = spawn(probe, args, { windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.on('error', () => resolve(null));
    child.on('close', () => {
      try {
        const parsed = JSON.parse(stdout) as {
          format?: { duration?: string };
          streams?: Array<{ width?: number; height?: number; codec_type?: string }>;
        };
        const video = parsed.streams?.find((s) => s.codec_type === 'video');
        const duration = Number(parsed.format?.duration ?? 0);
        if (!video?.width || !video?.height || !Number.isFinite(duration)) {
          resolve(null);
          return;
        }
        resolve({
          durationSeconds: duration,
          width: video.width,
          height: video.height,
          hasAudio: Boolean(parsed.streams?.some((s) => s.codec_type === 'audio')),
        });
      } catch {
        resolve(null);
      }
    });
  });
}

export type CropPreset = 'none' | 'vertical' | 'square';

export interface TextOverlay {
  text: string;
  /** 0-1, fraction of output width/height. */
  x: number;
  y: number;
  /** Fraction of output height, e.g. 0.08 = 8% tall text. */
  sizeRatio: number;
  color: string;
}

export interface EditSpec {
  /** Seconds from the start of the source. */
  trimStart: number;
  trimEnd: number;
  crop: CropPreset;
  /** 0-1 horizontal pan when cropping to a narrower aspect (0 = left edge). */
  cropOffset: number;
  overlays: TextOverlay[];
  /** 0 = mute, 1 = unchanged, 2 = double. */
  volume: number;
  /** Playback rate: 0.25 = quarter-speed replay, 1 = normal, 4 = fast-forward. */
  speed: number;
  /** Seconds of fade from black at the start of the clip (0 = none). */
  fadeIn: number;
  /** Seconds of fade to black at the end of the clip (0 = none). */
  fadeOut: number;
}

/** Output length after the speed change - what the viewer actually watches. */
export function outputDuration(spec: EditSpec): number {
  const trimmed = Math.max(0.1, spec.trimEnd - spec.trimStart);
  return trimmed / Math.min(4, Math.max(0.25, spec.speed || 1));
}

/**
 * atempo only accepts 0.5-2.0 per instance, so anything beyond that range is
 * reached by chaining several - the standard idiom for extreme speed changes.
 */
export function buildAtempoChain(speed: number): string[] {
  const filters: string[] = [];
  let remaining = Math.min(4, Math.max(0.25, speed));
  while (remaining > 2.0001) {
    filters.push('atempo=2.0000');
    remaining /= 2;
  }
  while (remaining < 0.4999) {
    filters.push('atempo=0.5000');
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) > 0.001) filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters;
}

/**
 * FONT RESOLUTION
 * ---------------------------------------------------------------------------
 * drawtext needs a font. This FFmpeg build has fontconfig compiled in but
 * Windows ships no fontconfig config file, so omitting `fontfile` doesn't just
 * fall back to a default - it crashes the process outright (access violation,
 * exit 0xC0000005) after printing "Fontconfig error: Cannot load default config
 * file". So the font is always passed explicitly.
 *
 * Bold is preferred: captions burned into a clip need to survive both the
 * platform's re-encode and being read on a phone.
 */
const FONT_CANDIDATES = [
  // Windows
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/segoeuib.ttf',
  'C:/Windows/Fonts/arial.ttf',
  // macOS
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  // Linux
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
];

let cachedFont: string | null | undefined;

/** Finds a usable font file, or null if the machine has none of the candidates. */
export async function resolveFontFile(): Promise<string | null> {
  if (cachedFont !== undefined) return cachedFont;

  const override = process.env.FFMPEG_FONT_FILE;
  const candidates = override ? [override, ...FONT_CANDIDATES] : FONT_CANDIDATES;
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.R_OK);
      cachedFont = candidate;
      return cachedFont;
    } catch {
      // Try the next one.
    }
  }
  cachedFont = null;
  return null;
}

/**
 * Escapes a path for use as a drawtext option value. Backslashes become forward
 * slashes (FFmpeg accepts those on Windows and they avoid a second escaping
 * layer), and the drive-letter colon must be escaped or it reads as an option
 * separator.
 */
export function escapeFontPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/** FFmpeg's drawtext takes a colon/backslash-sensitive string; escape it. */
function escapeDrawText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

/**
 * Rounds down to an even number. yuv420p subsamples chroma 2x2, so odd
 * dimensions are invalid - FFmpeg silently adjusts them, which makes the output
 * size differ from what we computed. Doing it here keeps the two in agreement.
 */
function even(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

/** Same, but an offset of zero is legitimate and must not be bumped to 2. */
function evenOffset(value: number): number {
  return Math.max(0, Math.floor(value / 2) * 2);
}

/**
 * Picks a font size for an overlay.
 *
 * The requested size is a fraction of frame *height*, which is the intuitive
 * control - but a 9:16 crop is narrow, so height-derived text runs off the
 * sides. drawtext cannot auto-shrink (fontsize takes no expression and text_w
 * isn't known until render), so the width is estimated here and the size capped
 * to fit. The 0.58 factor is a conservative average advance width for bold
 * sans-serif faces; erring high just means slightly smaller, safely-fitting text.
 */
export function fitFontSize(
  text: string,
  sizeRatio: number,
  outWidth: number,
  outHeight: number,
): number {
  const requested = outHeight * Math.min(0.4, Math.max(0.02, sizeRatio));
  const characters = Math.max(1, text.trim().length);
  // Leave a 6% margin on each side so text never kisses the frame edge.
  const maxForWidth = (outWidth * 0.88) / (characters * 0.58);
  return Math.max(8, Math.round(Math.min(requested, maxForWidth)));
}

/**
 * Builds the filter chain for a spec. Crop happens before overlays so overlay
 * coordinates are relative to the final framing rather than the source.
 */
export function buildFilterChain(
  spec: EditSpec,
  source: ProbeResult,
  fontFile: string | null,
): string {
  const filters: string[] = [];
  let outWidth = source.width;
  let outHeight = source.height;

  // Every dimension and offset below is forced even. A source can genuinely be
  // odd-sized, and libx264 with yuv420p cannot encode odd dimensions at all.
  outWidth = even(source.width);
  outHeight = even(source.height);
  let cropOriginX = 0;

  if (spec.crop !== 'none') {
    const targetRatio = spec.crop === 'vertical' ? 9 / 16 : 1;
    const sourceRatio = source.width / source.height;
    if (sourceRatio > targetRatio) {
      // Source is wider than target: crop width, pan horizontally.
      outWidth = even(source.height * targetRatio);
      const maxOffset = Math.max(0, even(source.width) - outWidth);
      cropOriginX = evenOffset(maxOffset * Math.min(1, Math.max(0, spec.cropOffset)));
    } else if (sourceRatio < targetRatio) {
      outHeight = even(source.width / targetRatio);
    }
  }

  // Emit the crop only when it actually changes something - an untouched clip
  // should produce an empty chain so it can be copied through unfiltered.
  if (outWidth !== source.width || outHeight !== source.height || cropOriginX !== 0) {
    filters.push(`crop=${outWidth}:${outHeight}:${cropOriginX}:0`);
  }

  // Speed comes before the overlays and fades so everything downstream works on
  // the final, retimed timeline rather than the source one.
  const speed = Math.min(4, Math.max(0.25, spec.speed || 1));
  if (Math.abs(speed - 1) > 0.001) {
    filters.push(`setpts=${(1 / speed).toFixed(6)}*PTS`);
  }

  // Without a font, drawtext would crash FFmpeg outright - drop the overlays
  // and still deliver the trimmed/cropped clip. The caller warns the user.
  const overlays = fontFile ? spec.overlays : [];

  for (const overlay of overlays) {
    if (!overlay.text.trim()) continue;
    // fontsize/borderw must be plain integers - drawtext does not evaluate
    // expressions for them (it errors out on e.g. "h*0.004"). Since the output
    // dimensions are known here after cropping, resolve the ratios to real
    // pixels rather than handing FFmpeg something it has to parse.
    const fontSize = fitFontSize(overlay.text, overlay.sizeRatio, outWidth, outHeight);
    const borderWidth = Math.max(1, Math.round(outHeight * 0.004));
    // x/y *do* take expressions, and these are the documented idiom for
    // positioning text relative to its own measured size.
    const x = `(w-text_w)*${Math.min(1, Math.max(0, overlay.x)).toFixed(3)}`;
    const y = `(h-text_h)*${Math.min(1, Math.max(0, overlay.y)).toFixed(3)}`;
    filters.push(
      [
        `drawtext=fontfile='${escapeFontPath(fontFile as string)}'`,
        `text='${escapeDrawText(overlay.text)}'`,
        `fontsize=${fontSize}`,
        `fontcolor=${overlay.color.replace('#', '0x')}`,
        `x=${x}`,
        `y=${y}`,
        `borderw=${borderWidth}`,
        'bordercolor=black@0.85',
      ].join(':'),
    );
  }

  // Fades are last: they apply to the finished frame, and their timings are on
  // the output timeline, which only exists after the speed change above.
  const outSeconds = outputDuration(spec);
  const fadeIn = clampFade(spec.fadeIn, outSeconds);
  const fadeOut = clampFade(spec.fadeOut, outSeconds);
  if (fadeIn > 0) filters.push(`fade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  if (fadeOut > 0) {
    filters.push(`fade=t=out:st=${(outSeconds - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  }

  return filters.join(',');
}

/**
 * A fade can never exceed half the clip, otherwise an in and an out overlap and
 * the middle of the clip is never fully visible.
 */
function clampFade(value: number, outSeconds: number): number {
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(requested, outSeconds / 2);
}

/** Audio counterpart of the video filter chain: volume, speed, and fades. */
export function buildAudioFilterChain(spec: EditSpec): string {
  if (spec.volume <= 0) return '';
  const filters: string[] = [];

  if (Math.abs(spec.volume - 1) > 0.01) filters.push(`volume=${spec.volume.toFixed(2)}`);
  filters.push(...buildAtempoChain(spec.speed || 1));

  const outSeconds = outputDuration(spec);
  const fadeIn = clampFade(spec.fadeIn, outSeconds);
  const fadeOut = clampFade(spec.fadeOut, outSeconds);
  if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  if (fadeOut > 0) {
    filters.push(`afade=t=out:st=${(outSeconds - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  }

  return filters.join(',');
}

export function buildRenderArgs(
  spec: EditSpec,
  source: ProbeResult,
  inputPath: string,
  outputPath: string,
  fontFile: string | null = null,
): string[] {
  const duration = Math.max(0.1, spec.trimEnd - spec.trimStart);
  const args = [
    '-y',
    // Both -ss and -t go *before* -i so they bound the slice of source that is
    // read. After -i, -t would instead cap the output length - which silently
    // breaks any speed change, since a 2x clip's output is half its input.
    '-ss', spec.trimStart.toFixed(3),
    '-t', duration.toFixed(3),
    '-i', inputPath,
  ];

  const filterChain = buildFilterChain(spec, source, fontFile);
  if (filterChain) args.push('-vf', filterChain);

  if (spec.volume <= 0) {
    args.push('-an');
  } else {
    const audioChain = buildAudioFilterChain(spec);
    if (audioChain) args.push('-af', audioChain);
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  );
  if (spec.volume > 0) args.push('-c:a', 'aac', '-b:a', '160k');

  // Machine-readable progress on stdout so the job runner can report a real
  // percentage instead of a spinner.
  args.push('-progress', 'pipe:1', '-nostats', outputPath);
  return args;
}

/** Parses `out_time_ms=...` lines from `-progress pipe:1` into a 0-100 percentage. */
export function progressFromChunk(chunk: string, totalSeconds: number): number | null {
  const matches = [...chunk.matchAll(/out_time_ms=(\d+)/g)];
  const last = matches[matches.length - 1];
  if (!last || totalSeconds <= 0) return null;
  const seconds = Number(last[1]) / 1_000_000;
  if (!Number.isFinite(seconds)) return null;
  return Math.max(0, Math.min(99, Math.round((seconds / totalSeconds) * 100)));
}

export interface RenderHandle {
  promise: Promise<void>;
}

/** Runs a render, reporting progress. Rejects with FFmpeg's stderr tail on failure. */
export function renderClip(
  ffmpeg: string,
  args: string[],
  totalSeconds: number,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true });
    let stderrTail = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const percent = progressFromChunk(chunk.toString(), totalSeconds);
      if (percent !== null) onProgress(percent);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('FFmpeg exited with code ' + code + '\n' + stderrTail));
    });
  });
}
