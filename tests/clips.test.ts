import { describe, expect, it } from 'vitest';
import {
  buildFilterChain,
  buildRenderArgs,
  buildAudioFilterChain,
  buildAtempoChain,
  outputDuration,
  escapeFontPath,
  fitFontSize,
  progressFromChunk,
  type EditSpec,
} from '@/lib/video/ffmpeg';
import { normaliseEditSpec } from '@/lib/video/clips';
import { pickModel } from '@/lib/ai/ollama';

const source = { durationSeconds: 60, width: 1920, height: 1080, hasAudio: true };

const FONT = 'C:\\Windows\\Fonts\\arialbd.ttf';

const baseSpec: EditSpec = {
  trimStart: 0,
  trimEnd: 10,
  crop: 'none',
  cropOffset: 0.5,
  overlays: [],
  volume: 1,
  speed: 1,
  fadeIn: 0,
  fadeOut: 0,
};

describe('buildFilterChain', () => {
  it('produces no filters for an untouched clip', () => {
    expect(buildFilterChain(baseSpec, source, FONT)).toBe('');
  });

  it('crops a 16:9 source to 9:16 by narrowing width, not squashing', () => {
    const chain = buildFilterChain({ ...baseSpec, crop: 'vertical', cropOffset: 0 }, source, FONT);
    // 1080 * (9/16) = 607.5, rounded down to an even 606 (yuv420p needs even)
    expect(chain).toBe('crop=606:1080:0:0');
  });

  it('pans the crop window horizontally with cropOffset', () => {
    const left = buildFilterChain({ ...baseSpec, crop: 'vertical', cropOffset: 0 }, source, FONT);
    const right = buildFilterChain({ ...baseSpec, crop: 'vertical', cropOffset: 1 }, source, FONT);
    expect(left).toContain(':0:0');
    // Full pan puts x at sourceWidth - cropWidth = 1920 - 606 = 1314
    expect(right).toContain(':1314:0');
  });

  it('never emits an odd crop dimension or offset', () => {
    // Regression: an odd width made FFmpeg silently adjust the output, so the
    // rendered file did not match the size the editor had promised.
    const odd = { durationSeconds: 10, width: 1281, height: 721, hasAudio: true };
    for (const cropOffset of [0, 0.33, 0.5, 0.77, 1]) {
      const chain = buildFilterChain({ ...baseSpec, crop: 'vertical', cropOffset }, odd, FONT);
      const [w, h, x, y] = chain.replace('crop=', '').split(':').map(Number);
      for (const value of [w, h, x, y]) expect(value % 2).toBe(0);
    }
  });

  it('escapes characters that would break drawtext syntax', () => {
    const chain = buildFilterChain(
      { ...baseSpec, overlays: [{ text: "1:5 clutch 100% o'clock", x: 0.5, y: 0.1, sizeRatio: 0.08, color: '#ffffff' }] },
      source,
      FONT,
    );
    expect(chain).toContain("1\\:5 clutch 100\\% o\\'clock");
    expect(chain).toContain('fontcolor=0xffffff');
  });

  it('emits fontsize/borderw as plain integers, not expressions', () => {
    // Regression: drawtext does not evaluate expressions for these options.
    // "borderw=(h*0.004)" made FFmpeg abort with "Unable to parse borderw".
    const chain = buildFilterChain(
      { ...baseSpec, overlays: [{ text: 'CLUTCH', x: 0.5, y: 0.08, sizeRatio: 0.09, color: '#ffdd00' }] },
      source,
      FONT,
    );
    // 1080 * 0.09 = 97.2 -> 97, border 1080 * 0.004 = 4.32 -> 4
    expect(chain).toContain('fontsize=97');
    expect(chain).toContain('borderw=4');
    expect(chain).not.toContain('h*');
  });

  it('sizes overlay text against the cropped height, not the source height', () => {
    // A square crop of a 1920x1080 source is 1080x1080, so height is unchanged
    // and text keeps its size; the letterboxed case is what would differ.
    const tall = { durationSeconds: 10, width: 1080, height: 1920, hasAudio: true };
    const chain = buildFilterChain(
      { ...baseSpec, crop: 'square', overlays: [{ text: 'HI', x: 0, y: 0, sizeRatio: 0.1, color: '#ffffff' }] },
      tall,
      FONT,
    );
    // Crop to 1:1 from a 1080x1920 source gives 1080x1080 -> 1080 * 0.1 = 108
    expect(chain).toContain('crop=1080:1080:0:0');
    expect(chain).toContain('fontsize=108');
  });

  it('skips blank overlays rather than emitting an empty drawtext', () => {
    const chain = buildFilterChain(
      { ...baseSpec, overlays: [{ text: '   ', x: 0.5, y: 0.1, sizeRatio: 0.08, color: '#ffffff' }] },
      source,
      FONT,
    );
    expect(chain).toBe('');
  });

  it('always passes an explicit fontfile to drawtext', () => {
    // Regression: with no fontfile, this FFmpeg build crashes on Windows
    // (access violation) because there is no fontconfig config to fall back to.
    const chain = buildFilterChain(
      { ...baseSpec, overlays: [{ text: 'GG', x: 0.5, y: 0.5, sizeRatio: 0.08, color: '#ffffff' }] },
      source,
      FONT,
    );
    expect(chain).toContain("drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf'");
  });

  it('drops overlays instead of crashing when no font is available', () => {
    const chain = buildFilterChain(
      { ...baseSpec, crop: 'vertical', overlays: [{ text: 'GG', x: 0.5, y: 0.5, sizeRatio: 0.08, color: '#fff000' }] },
      source,
      null,
    );
    // The crop survives; only the text is dropped.
    expect(chain).toContain('crop=');
    expect(chain).not.toContain('drawtext');
  });
});

describe('speed', () => {
  it('retimes video with setpts and leaves normal speed untouched', () => {
    expect(buildFilterChain({ ...baseSpec, speed: 2 }, source, FONT)).toContain('setpts=0.500000*PTS');
    expect(buildFilterChain({ ...baseSpec, speed: 1 }, source, FONT)).not.toContain('setpts');
  });

  it('reports the output length as the trim range divided by the speed', () => {
    expect(outputDuration({ ...baseSpec, trimStart: 0, trimEnd: 10, speed: 2 })).toBe(5);
    expect(outputDuration({ ...baseSpec, trimStart: 0, trimEnd: 10, speed: 0.5 })).toBe(20);
  });

  it('chains atempo to reach rates outside its 0.5-2.0 limit', () => {
    // atempo rejects anything outside 0.5-2.0, so 4x must become 2x * 2x.
    expect(buildAtempoChain(4)).toEqual(['atempo=2.0000', 'atempo=2.0000']);
    expect(buildAtempoChain(0.25)).toEqual(['atempo=0.5000', 'atempo=0.5000']);
    expect(buildAtempoChain(1)).toEqual([]);
  });

  it('multiplies out to the requested rate for an in-range speed', () => {
    const product = buildAtempoChain(1.5).reduce((acc, f) => acc * Number(f.split('=')[1]), 1);
    expect(product).toBeCloseTo(1.5, 3);
  });
});

describe('fades', () => {
  it('places the fade-out against the end of the output, not the source', () => {
    // 10s trim at 2x is a 5s output, so a 1s fade-out starts at t=4.
    const chain = buildFilterChain(
      { ...baseSpec, trimStart: 0, trimEnd: 10, speed: 2, fadeOut: 1 },
      source,
      FONT,
    );
    expect(chain).toContain('fade=t=out:st=4.000:d=1.000');
  });

  it('never lets a fade run past half the clip', () => {
    const chain = buildFilterChain(
      { ...baseSpec, trimStart: 0, trimEnd: 4, fadeIn: 999 },
      source,
      FONT,
    );
    expect(chain).toContain('fade=t=in:st=0:d=2.000');
  });

  it('mirrors the fades onto the audio track', () => {
    const chain = buildAudioFilterChain({ ...baseSpec, trimStart: 0, trimEnd: 10, fadeIn: 1, fadeOut: 2 });
    expect(chain).toContain('afade=t=in:st=0:d=1.000');
    expect(chain).toContain('afade=t=out:st=8.000:d=2.000');
  });

  it('produces no audio chain at all when the clip is muted', () => {
    expect(buildAudioFilterChain({ ...baseSpec, volume: 0, speed: 2, fadeIn: 1 })).toBe('');
  });
});

describe('fitFontSize', () => {
  it('honours the requested ratio when the text comfortably fits', () => {
    // Short text on a wide frame: width is not the binding constraint.
    expect(fitFontSize('GG', 0.1, 1920, 1080)).toBe(108);
  });

  it('shrinks long text so it cannot overflow a narrow vertical crop', () => {
    // Regression: a 9:16 crop is only 606px wide, so height-derived text ran
    // off both sides of the frame.
    const size = fitFontSize('1v5 CLUTCH OF THE CENTURY', 0.09, 606, 1080);
    const estimatedWidth = size * 0.58 * 25;
    expect(estimatedWidth).toBeLessThanOrEqual(606);
    expect(size).toBeLessThan(1080 * 0.09);
  });

  it('never returns an unreadably small size', () => {
    expect(fitFontSize('x'.repeat(500), 0.1, 200, 200)).toBe(8);
  });
});

describe('escapeFontPath', () => {
  it('normalises separators and escapes the drive-letter colon', () => {
    expect(escapeFontPath('C:\\Windows\\Fonts\\arial.ttf')).toBe('C\\:/Windows/Fonts/arial.ttf');
  });

  it('leaves a POSIX path alone', () => {
    expect(escapeFontPath('/usr/share/fonts/x.ttf')).toBe('/usr/share/fonts/x.ttf');
  });
});

describe('buildRenderArgs', () => {
  it('seeks before the input and sets duration from the trim range', () => {
    const args = buildRenderArgs({ ...baseSpec, trimStart: 5, trimEnd: 12.5 }, source, 'in.mp4', 'out.mp4');
    const ssIndex = args.indexOf('-ss');
    const tIndex = args.indexOf('-t');
    const inputIndex = args.indexOf('-i');
    expect(ssIndex).toBeGreaterThan(-1);
    expect(ssIndex).toBeLessThan(inputIndex);
    expect(args[tIndex + 1]).toBe('7.500');
    // Regression: with -t after -i, FFmpeg caps the OUTPUT length, so a 2x clip
    // came out at the full source length instead of half of it.
    expect(tIndex).toBeLessThan(inputIndex);
  });

  it('drops the audio stream entirely when muted', () => {
    const args = buildRenderArgs({ ...baseSpec, volume: 0 }, source, 'in.mp4', 'out.mp4');
    expect(args).toContain('-an');
    expect(args).not.toContain('-c:a');
  });

  it('applies a volume filter only when it differs from unity', () => {
    expect(buildRenderArgs(baseSpec, source, 'in.mp4', 'out.mp4')).not.toContain('-af');
    expect(buildRenderArgs({ ...baseSpec, volume: 1.5 }, source, 'in.mp4', 'out.mp4')).toContain('volume=1.50');
  });
});

describe('progressFromChunk', () => {
  it('converts out_time_ms into a percentage of the trimmed length', () => {
    expect(progressFromChunk('out_time_ms=5000000\n', 10)).toBe(50);
  });

  it('uses the most recent value when a chunk carries several', () => {
    expect(progressFromChunk('out_time_ms=1000000\nout_time_ms=8000000\n', 10)).toBe(80);
  });

  it('never reports 100 before the process actually exits', () => {
    expect(progressFromChunk('out_time_ms=10000000\n', 10)).toBe(99);
  });

  it('returns null when there is nothing parseable', () => {
    expect(progressFromChunk('frame=12 fps=30\n', 10)).toBeNull();
  });
});

describe('normaliseEditSpec', () => {
  it('clamps a trim range that runs past the end of the source', () => {
    const spec = normaliseEditSpec({ trimStart: -5, trimEnd: 999 }, 30);
    expect(spec.trimStart).toBe(0);
    expect(spec.trimEnd).toBe(30);
  });

  it('keeps the end after the start even when given nonsense', () => {
    const spec = normaliseEditSpec({ trimStart: 20, trimEnd: 1 }, 30);
    expect(spec.trimEnd).toBeGreaterThan(spec.trimStart);
  });

  it('rejects an unknown crop preset and a malformed colour', () => {
    const spec = normaliseEditSpec(
      { crop: 'hexagon', overlays: [{ text: 'hi', color: 'red; rm -rf /' }] },
      30,
    );
    expect(spec.crop).toBe('none');
    expect(spec.overlays[0].color).toBe('#ffffff');
  });

  it('caps the number of overlays', () => {
    const overlays = Array.from({ length: 20 }, () => ({ text: 'x' }));
    expect(normaliseEditSpec({ overlays }, 30).overlays).toHaveLength(5);
  });
});

describe('pickModel', () => {
  it('returns null with nothing installed', () => {
    expect(pickModel([])).toBeNull();
  });

  it('prefers a known instruct-tuned family over an arbitrary first entry', () => {
    expect(pickModel(['zzz-custom:latest', 'llama3.2:3b'])).toBe('llama3.2:3b');
  });

  it('falls back to whatever is installed when nothing is recognised', () => {
    expect(pickModel(['zzz-custom:latest'])).toBe('zzz-custom:latest');
  });
});
