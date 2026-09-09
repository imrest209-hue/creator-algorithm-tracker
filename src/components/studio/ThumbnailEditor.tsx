'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer as KonvaLayer, Image as KonvaImage, Text as KonvaText, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import { Card, SectionHeading, EmptyState } from '@/components/ui/primitives';
import { PresetSizePicker, SIZE_PRESETS } from '@/components/studio/PresetSizePicker';
import { TEXT_FONTS, DEFAULT_FONT_ID, fontFamilyFor, preloadStudioFonts } from '@/components/studio/fonts';
import { listTemplates, saveTemplate, deleteTemplate, type ThumbnailTemplate } from '@/components/studio/templates';
import {
  IconImage,
  IconText,
  IconRect,
  IconUpload,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
  IconWand,
  IconSparkles,
} from '@/components/studio/icons';

/**
 * THUMBNAIL EDITOR
 * ---------------------------------------------------------------------------
 * A small layer-based canvas editor for making thumbnails - not a Photoshop
 * clone. Base image + text + rectangle layers, drag/resize/rotate via
 * Konva's Transformer, export to a PNG at the exact target platform size.
 *
 * The Stage always renders at the preset's real pixel dimensions (e.g.
 * 1280x720) - on-screen scaling is a pure CSS transform on the wrapper div,
 * so `stage.toCanvas()` always exports at the correct resolution with no
 * extra math. Konva accounts for CSS-scaled containers automatically when
 * translating pointer coordinates.
 *
 * Undo/redo covers structural edits (add/delete/duplicate/reorder/apply
 * template), not every keystroke or drag frame - that keeps the history
 * stack meaningful instead of one entry per typed character.
 */

type LayerKind = 'image' | 'text' | 'rect';

interface BaseLayer {
  id: string;
  kind: LayerKind;
  x: number;
  y: number;
  rotation: number;
}

export interface ImageLayerState extends BaseLayer {
  kind: 'image';
  src: string;
  width: number;
  height: number;
}

export interface TextLayerState extends BaseLayer {
  kind: 'text';
  text: string;
  fontSize: number;
  fontId: string;
  fill: string;
  bold: boolean;
  width: number;
}

export interface RectLayerState extends BaseLayer {
  kind: 'rect';
  width: number;
  height: number;
  fill: string;
  opacity: number;
}

export type LayerState = ImageLayerState | TextLayerState | RectLayerState;

let nextId = 1;
function makeId(prefix: string): string {
  nextId += 1;
  return prefix + '-' + nextId + '-' + Date.now().toString(36);
}

/** Loads a `src` (data URL or object URL) into an HTMLImageElement for Konva's <Image>. */
function useHtmlImage(src: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return image;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  as,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  as?: 'label';
  children?: React.ReactNode;
}) {
  const className =
    'group relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors ' +
    (disabled ? 'cursor-not-allowed opacity-35' : 'hover:bg-white/10 hover:text-ink active:scale-95');
  const inner = (
    <>
      {icon}
      <span className="pointer-events-none absolute top-full z-10 mt-1.5 whitespace-nowrap rounded-md bg-base-950 px-2 py-1 text-[11px] font-medium text-ink opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </>
  );
  if (as === 'label') {
    return (
      <label className={className + ' cursor-pointer'} aria-label={label}>
        {inner}
        {children}
      </label>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-label={label}>
      {inner}
    </button>
  );
}

function ImageLayerNode({
  layer,
  onSelect,
  onChange,
  shapeRef,
}: {
  layer: ImageLayerState;
  onSelect: () => void;
  onChange: (next: Partial<ImageLayerState>) => void;
  shapeRef: (node: Konva.Node | null) => void;
}) {
  const image = useHtmlImage(layer.src);
  if (!image) return null;
  return (
    <KonvaImage
      ref={shapeRef}
      image={image}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) => onChange({ x: event.target.x(), y: event.target.y() })}
      onTransformEnd={(event) => {
        const node = event.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(10, layer.width * scaleX),
          height: Math.max(10, layer.height * scaleY),
        });
      }}
    />
  );
}

export interface ThumbnailEditorHandle {
  /** Exports the current canvas as a PNG blob at the preset's real resolution. */
  exportPng: () => Promise<{ blob: Blob; width: number; height: number } | null>;
}

export function ThumbnailEditor({
  onExportRef,
  initialPresetId = 'youtube',
}: {
  /** Receives an export function the parent can call (e.g. from a "Save" button). */
  onExportRef: (handle: ThumbnailEditorHandle) => void;
  initialPresetId?: string;
}) {
  const [presetId, setPresetId] = useState(initialPresetId);
  const preset = SIZE_PRESETS.find((p) => p.id === presetId) ?? SIZE_PRESETS[0];
  const [layers, setLayers] = useState<LayerState[]>([]);
  const [past, setPast] = useState<LayerState[][]>([]);
  const [future, setFuture] = useState<LayerState[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [templates, setTemplates] = useState<ThumbnailTemplate[]>([]);
  const [savingTemplateName, setSavingTemplateName] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [displayScale, setDisplayScale] = useState(1);

  useEffect(() => {
    setTemplates(listTemplates());
    void preloadStudioFonts().then(() => {
      // Fonts may finish loading after Konva's first paint - redraw once ready
      // so text doesn't stay stuck on the browser's fallback font.
      stageRef.current?.getLayers().forEach((l) => l.batchDraw());
    });
  }, []);

  // Prune shape refs for layers that no longer exist - undo/redo/template-apply
  // all replace the layers array wholesale rather than going through
  // deleteLayer(), so without this a stale ref can stick around and get
  // re-attached to the Transformer, leaving a lingering selection outline for
  // a layer that's already gone.
  useEffect(() => {
    const liveIds = new Set(layers.map((l) => l.id));
    for (const id of shapeRefs.current.keys()) {
      if (!liveIds.has(id)) shapeRefs.current.delete(id);
    }
  }, [layers]);

  // Fit the full-resolution stage into the available panel width via a pure
  // CSS scale - the Stage's own width/height stay at the real preset size.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const available = el.clientWidth;
      if (available > 0) setDisplayScale(Math.min(1, available / preset.width));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [preset.width]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    if (!selectedId) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }
    const node = shapeRefs.current.get(selectedId);
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, layers]);

  useEffect(() => {
    if (!onExportRef) return;
    onExportRef({
      exportPng: async () => {
        const stage = stageRef.current;
        if (!stage) return null;
        setSelectedId(null);
        // Let the Transformer's handles clear from the canvas before capturing.
        await new Promise((resolve) => setTimeout(resolve, 30));
        const canvas = stage.toCanvas({ width: preset.width, height: preset.height, pixelRatio: 1 });
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) return null;
        return { blob, width: preset.width, height: preset.height };
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.width, preset.height]);

  /** Structural edits go through here so they're undoable. */
  const commit = useCallback((next: LayerState[] | ((prev: LayerState[]) => LayerState[])) => {
    setLayers((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: LayerState[]) => LayerState[])(prev) : next;
      setPast((p) => [...p.slice(-49), prev]);
      setFuture([]);
      return resolved;
    });
  }, []);

  /** Continuous edits (typing, color pickers, drag/resize) - not pushed to history. */
  function updateLayer(id: string, patch: Partial<LayerState>) {
    setLayers((prev) => prev.map((layer) => (layer.id === id ? ({ ...layer, ...patch } as LayerState) : layer)));
  }

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [layers, ...f]);
      setLayers(previous);
      setSelectedId(null);
      return p.slice(0, -1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, layers]);
      setLayers(next);
      setSelectedId(null);
      return f.slice(1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  const addTextLayer = useCallback(() => {
    const layer: TextLayerState = {
      id: makeId('text'),
      kind: 'text',
      x: preset.width / 4,
      y: preset.height / 3,
      rotation: 0,
      text: 'YOUR TITLE HERE',
      fontSize: Math.round(preset.width / 11),
      fontId: DEFAULT_FONT_ID,
      fill: '#ffffff',
      bold: true,
      width: preset.width / 1.6,
    };
    commit((prev) => [...prev, layer]);
    setSelectedId(layer.id);
  }, [commit, preset.width, preset.height]);

  const addRectLayer = useCallback(() => {
    const layer: RectLayerState = {
      id: makeId('rect'),
      kind: 'rect',
      x: preset.width / 4,
      y: preset.height / 2,
      rotation: 0,
      width: preset.width / 2,
      height: preset.height / 6,
      fill: '#4f7cff',
      opacity: 0.85,
    };
    commit((prev) => [...prev, layer]);
    setSelectedId(layer.id);
  }, [commit, preset.width, preset.height]);

  const handleImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = typeof reader.result === 'string' ? reader.result : '';
        if (!src) return;
        const probe = new window.Image();
        probe.onload = () => {
          const scale = preset.width / probe.width;
          const width = preset.width;
          const height = probe.height * scale;
          const layer: ImageLayerState = {
            id: makeId('image'),
            kind: 'image',
            x: 0,
            y: (preset.height - height) / 2,
            rotation: 0,
            src,
            width,
            height,
          };
          commit((prev) => [layer, ...prev]);
          setSelectedId(layer.id);
        };
        probe.src = src;
      };
      reader.readAsDataURL(file);
    },
    [commit, preset.width, preset.height],
  );

  function moveLayer(id: string, direction: 'up' | 'down') {
    commit((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      if (index === -1) return prev;
      const swapWith = direction === 'up' ? index + 1 : index - 1;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[swapWith];
      next[swapWith] = tmp;
      return next;
    });
  }

  const deleteLayer = useCallback(
    (id: string) => {
      commit((prev) => prev.filter((l) => l.id !== id));
      shapeRefs.current.delete(id);
      setSelectedId((current) => (current === id ? null : current));
    },
    [commit],
  );

  const duplicateLayer = useCallback(
    (id: string) => {
      const source = layers.find((l) => l.id === id);
      if (!source) return;
      const copy = { ...source, id: makeId(source.kind), x: source.x + 24, y: source.y + 24 } as LayerState;
      commit((prev) => [...prev, copy]);
      setSelectedId(copy.id);
    },
    [layers, commit],
  );

  // Keyboard shortcuts - ignored while typing in a form field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (meta && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault();
        redo();
      } else if (meta && event.key.toLowerCase() === 'd' && selectedId) {
        event.preventDefault();
        duplicateLayer(selectedId);
      } else if (!isTyping && (event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        deleteLayer(selectedId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, undo, redo, duplicateLayer, deleteLayer]);

  function applyTemplate(template: ThumbnailTemplate) {
    setPresetId(template.presetId);
    const applied: LayerState[] = template.layers.map((tplLayer) => ({
      ...tplLayer,
      id: makeId(tplLayer.kind),
    })) as LayerState[];
    commit((prev) => [...prev.filter((l) => l.kind === 'image'), ...applied]);
    setSelectedId(null);
  }

  function confirmSaveTemplate() {
    const name = (savingTemplateName ?? '').trim();
    if (!name) return;
    const templateLayers = layers
      .filter((l): l is TextLayerState | RectLayerState => l.kind !== 'image')
      .map((l) => {
        const { id: _id, ...rest } = l;
        void _id;
        return rest as import('@/components/studio/templates').TemplateLayer;
      });
    saveTemplate(name, presetId, templateLayers);
    setTemplates(listTemplates());
    setSavingTemplateName(null);
  }

  function removeTemplate(id: string) {
    deleteTemplate(id);
    setTemplates(listTemplates());
  }

  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-base-700 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Canvas</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Drag to move · handles to resize/rotate · Delete to remove</p>
          </div>
          <PresetSizePicker value={presetId} onChange={setPresetId} />
        </div>

        <div className="relative bg-[radial-gradient(ellipse_at_top,rgba(79,124,255,0.08),transparent_60%)] p-4">
          {/* Floating glass toolbar */}
          <div className="mb-3 flex w-fit items-center gap-0.5 rounded-xl border border-white/10 bg-base-900/70 p-1 shadow-lg backdrop-blur-md">
            <ToolbarButton as="label" icon={<IconUpload width={18} height={18} />} label="Upload image">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleImageFile(file);
                  event.target.value = '';
                }}
              />
            </ToolbarButton>
            <ToolbarButton icon={<IconText width={18} height={18} />} label="Add text" onClick={addTextLayer} />
            <ToolbarButton icon={<IconRect width={18} height={18} />} label="Add rectangle" onClick={addRectLayer} />
            <div className="mx-1 h-5 w-px bg-white/10" />
            <ToolbarButton
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 14 4 9l5-5" />
                  <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                </svg>
              }
              label="Undo"
              onClick={undo}
              disabled={past.length === 0}
            />
            <ToolbarButton
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 14 5-5-5-5" />
                  <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
                </svg>
              }
              label="Redo"
              onClick={redo}
              disabled={future.length === 0}
            />
            <div className="mx-1 h-5 w-px bg-white/10" />
            <ToolbarButton
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="7" y="7" width="12" height="12" rx="2" />
                  <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                </svg>
              }
              label="Duplicate (⌘D)"
              onClick={() => selectedId && duplicateLayer(selectedId)}
              disabled={!selectedId}
            />
            <ToolbarButton
              icon={<IconTrash width={18} height={18} />}
              label="Delete (Del)"
              onClick={() => selectedId && deleteLayer(selectedId)}
              disabled={!selectedId}
            />
          </div>

          <div
            ref={wrapperRef}
            className="relative overflow-hidden rounded-lg border border-base-700 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_20px_40px_-15px_rgba(0,0,0,0.6)]"
            style={{ height: preset.height * displayScale }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingFile(false);
              const file = event.dataTransfer.files?.[0];
              if (file) handleImageFile(file);
            }}
          >
            <div
              style={{
                width: preset.width,
                height: preset.height,
                transform: 'scale(' + displayScale + ')',
                transformOrigin: 'top left',
              }}
            >
              <Stage
                ref={stageRef}
                width={preset.width}
                height={preset.height}
                onMouseDown={(event) => {
                  if (event.target === event.target.getStage()) setSelectedId(null);
                }}
              >
                <KonvaLayer>
                  <Rect x={0} y={0} width={preset.width} height={preset.height} fill="#0b0d13" listening={false} />
                  {layers.map((layer) => {
                    if (layer.kind === 'image') {
                      return (
                        <ImageLayerNode
                          key={layer.id}
                          layer={layer}
                          onSelect={() => setSelectedId(layer.id)}
                          onChange={(patch) => updateLayer(layer.id, patch)}
                          shapeRef={(node) => {
                            if (node) shapeRefs.current.set(layer.id, node);
                          }}
                        />
                      );
                    }
                    if (layer.kind === 'text') {
                      return (
                        <KonvaText
                          key={layer.id}
                          ref={(node) => {
                            if (node) shapeRefs.current.set(layer.id, node);
                          }}
                          text={layer.text}
                          x={layer.x}
                          y={layer.y}
                          width={layer.width}
                          fontSize={layer.fontSize}
                          fontFamily={fontFamilyFor(layer.fontId)}
                          fontStyle={layer.bold ? 'bold' : 'normal'}
                          fill={layer.fill}
                          rotation={layer.rotation}
                          shadowColor="#000000"
                          shadowBlur={layer.fontId === 'system' ? 0 : 6}
                          shadowOpacity={0.35}
                          draggable
                          onClick={() => setSelectedId(layer.id)}
                          onTap={() => setSelectedId(layer.id)}
                          onDragEnd={(event) =>
                            updateLayer(layer.id, { x: event.target.x(), y: event.target.y() })
                          }
                          onTransformEnd={(event) => {
                            const node = event.target;
                            const scaleX = node.scaleX();
                            node.scaleX(1);
                            node.scaleY(1);
                            updateLayer(layer.id, {
                              x: node.x(),
                              y: node.y(),
                              rotation: node.rotation(),
                              width: Math.max(20, layer.width * scaleX),
                            });
                          }}
                        />
                      );
                    }
                    return (
                      <Rect
                        key={layer.id}
                        ref={(node) => {
                          if (node) shapeRefs.current.set(layer.id, node);
                        }}
                        x={layer.x}
                        y={layer.y}
                        width={layer.width}
                        height={layer.height}
                        fill={layer.fill}
                        opacity={layer.opacity}
                        rotation={layer.rotation}
                        cornerRadius={6}
                        draggable
                        onClick={() => setSelectedId(layer.id)}
                        onTap={() => setSelectedId(layer.id)}
                        onDragEnd={(event) => updateLayer(layer.id, { x: event.target.x(), y: event.target.y() })}
                        onTransformEnd={(event) => {
                          const node = event.target;
                          const scaleX = node.scaleX();
                          const scaleY = node.scaleY();
                          node.scaleX(1);
                          node.scaleY(1);
                          updateLayer(layer.id, {
                            x: node.x(),
                            y: node.y(),
                            rotation: node.rotation(),
                            width: Math.max(10, layer.width * scaleX),
                            height: Math.max(10, layer.height * scaleY),
                          });
                        }}
                      />
                    );
                  })}
                  <Transformer ref={transformerRef} rotateEnabled boundBoxFunc={(oldBox, newBox) => newBox} />
                </KonvaLayer>
              </Stage>
            </div>

            {layers.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-ink-muted">
                    <IconSparkles width={22} height={22} />
                  </div>
                  <p className="text-sm font-medium text-ink">Start with an image</p>
                  <p className="max-w-[220px] text-xs text-ink-muted">
                    Upload a screenshot, then add title text or a highlight shape from the toolbar above.
                  </p>
                </div>
              </div>
            ) : null}

            {isDraggingFile ? (
              <div className="absolute inset-0 flex items-center justify-center border-2 border-dashed border-brand-500 bg-brand-500/10 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2 text-brand-300">
                  <IconUpload width={28} height={28} />
                  <p className="text-sm font-medium">Drop image to add</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <SectionHeading title="Layers" />
          {layers.length === 0 ? (
            <p className="text-xs text-ink-muted">Nothing yet - upload an image or add a layer to get started.</p>
          ) : (
            <ul className="space-y-1">
              {[...layers].reverse().map((layer) => (
                <li
                  key={layer.id}
                  className={
                    'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ' +
                    (selectedId === layer.id
                      ? 'bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30'
                      : 'text-ink-muted hover:bg-base-800')
                  }
                >
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 overflow-hidden text-left"
                    onClick={() => setSelectedId(layer.id)}
                  >
                    <span className="shrink-0 opacity-80">
                      {layer.kind === 'image' ? (
                        <IconImage width={15} height={15} />
                      ) : layer.kind === 'text' ? (
                        <IconText width={15} height={15} />
                      ) : (
                        <IconRect width={15} height={15} />
                      )}
                    </span>
                    <span className="truncate">
                      {layer.kind === 'image' ? 'Image' : layer.kind === 'text' ? layer.text || 'Text' : 'Rectangle'}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button type="button" title="Move up" className="rounded p-1 hover:bg-base-750" onClick={() => moveLayer(layer.id, 'up')}>
                      <IconChevronUp width={14} height={14} />
                    </button>
                    <button type="button" title="Move down" className="rounded p-1 hover:bg-base-750" onClick={() => moveLayer(layer.id, 'down')}>
                      <IconChevronDown width={14} height={14} />
                    </button>
                    <button type="button" title="Delete" className="rounded p-1 text-bad hover:bg-bad/10" onClick={() => deleteLayer(layer.id)}>
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selectedLayer ? (
          <Card>
            <SectionHeading title="Properties" />
            {selectedLayer.kind === 'text' ? (
              <div className="space-y-3">
                <div>
                  <label className="label mb-1 block">Text</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={selectedLayer.text}
                    onChange={(event) => updateLayer(selectedLayer.id, { text: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label mb-1 block">Font</label>
                  <select
                    className="input"
                    value={selectedLayer.fontId}
                    onChange={(event) => updateLayer(selectedLayer.id, { fontId: event.target.value })}
                  >
                    {TEXT_FONTS.map((font) => (
                      <option key={font.id} value={font.id}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="label mb-1 block">Size</label>
                    <input
                      type="number"
                      className="input"
                      min={8}
                      max={400}
                      value={selectedLayer.fontSize}
                      onChange={(event) =>
                        updateLayer(selectedLayer.id, { fontSize: Number(event.target.value) || selectedLayer.fontSize })
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <label className="label mb-1 block">Color</label>
                    <input
                      type="color"
                      className="input h-[38px] p-1"
                      value={selectedLayer.fill}
                      onChange={(event) => updateLayer(selectedLayer.id, { fill: event.target.value })}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={selectedLayer.bold}
                    onChange={(event) => updateLayer(selectedLayer.id, { bold: event.target.checked })}
                  />
                  Bold
                </label>
              </div>
            ) : null}
            {selectedLayer.kind === 'rect' ? (
              <div className="space-y-3">
                <div>
                  <label className="label mb-1 block">Fill color</label>
                  <input
                    type="color"
                    className="input h-[38px] p-1"
                    value={selectedLayer.fill}
                    onChange={(event) => updateLayer(selectedLayer.id, { fill: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label mb-1 block">Opacity ({Math.round(selectedLayer.opacity * 100)}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedLayer.opacity}
                    onChange={(event) => updateLayer(selectedLayer.id, { opacity: Number(event.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            ) : null}
            {selectedLayer.kind === 'image' ? (
              <p className="text-xs text-ink-muted">Drag to reposition, use the corner handles to resize.</p>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <SectionHeading
            title="Templates"
            tooltip="Save the current text/shape layout (not the base image) to reuse on your next thumbnail."
          />
          {savingTemplateName !== null ? (
            <div className="mb-3 flex gap-1.5">
              <input
                autoFocus
                type="text"
                className="input"
                placeholder="e.g. MW3 Clutch"
                value={savingTemplateName}
                onChange={(event) => setSavingTemplateName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && confirmSaveTemplate()}
              />
              <button type="button" className="btn-primary px-3" onClick={confirmSaveTemplate}>
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-ghost mb-3 w-full text-xs"
              disabled={layers.every((l) => l.kind === 'image')}
              onClick={() => setSavingTemplateName('')}
            >
              <IconWand width={15} height={15} /> Save current layout as template
            </button>
          )}
          {templates.length === 0 ? (
            <EmptyState icon="✦" title="No templates yet" description="Design a layout, then save it above to reuse next time." />
          ) : (
            <ul className="space-y-1">
              {templates.map((template) => (
                <li key={template.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-muted hover:bg-base-800">
                  <button type="button" className="flex-1 truncate text-left text-ink" onClick={() => applyTemplate(template)}>
                    {template.name}
                  </button>
                  <button type="button" title="Delete template" className="rounded p-1 text-bad hover:bg-bad/10" onClick={() => removeTemplate(template.id)}>
                    <IconTrash width={13} height={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
