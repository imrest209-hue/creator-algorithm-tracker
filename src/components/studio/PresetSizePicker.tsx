'use client';

export interface SizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'youtube', label: 'YouTube thumbnail (1280×720)', width: 1280, height: 720 },
  { id: 'shorts', label: 'Shorts / TikTok cover (1080×1920)', width: 1080, height: 1920 },
  { id: 'square', label: 'Square (1080×1080)', width: 1080, height: 1080 },
];

export function PresetSizePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (presetId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor="preset-size" className="label mb-1 block">
        Canvas size
      </label>
      <select
        id="preset-size"
        className="input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {SIZE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
      </select>
    </div>
  );
}
