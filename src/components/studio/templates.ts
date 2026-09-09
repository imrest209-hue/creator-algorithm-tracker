import type { TextLayerState, RectLayerState } from '@/components/studio/ThumbnailEditor';

/**
 * THUMBNAIL TEMPLATES
 * ---------------------------------------------------------------------------
 * A template is a reusable layout - title text position/style, highlight
 * shapes - saved WITHOUT the base image, since that's different every video.
 * Applying a template onto a fresh screenshot is exactly the repeat workflow
 * a creator posting frequently actually wants (swap the footage, keep the
 * look), which matters more day to day than raw editing power.
 *
 * Stored in localStorage rather than the database: this is a single-user
 * local app, templates are a personal editing convenience (not account data
 * that needs a server backup), and it means zero new API surface for what's
 * otherwise just "remember this list of shapes."
 */

const STORAGE_KEY = 'studio.thumbnail_templates.v1';
const MAX_TEMPLATES = 24;

export type TemplateLayer =
  | (Omit<TextLayerState, 'id'> & { kind: 'text' })
  | (Omit<RectLayerState, 'id'> & { kind: 'rect' });

export interface ThumbnailTemplate {
  id: string;
  name: string;
  createdAt: string;
  presetId: string;
  layers: TemplateLayer[];
}

function readAll(): ThumbnailTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(templates: ThumbnailTemplate[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates.slice(0, MAX_TEMPLATES)));
  } catch {
    // Storage full or unavailable (private browsing) - templates just won't persist this session.
  }
}

export function listTemplates(): ThumbnailTemplate[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveTemplate(name: string, presetId: string, layers: TemplateLayer[]): ThumbnailTemplate {
  const template: ThumbnailTemplate = {
    id: 'tpl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    name: name.trim() || 'Untitled template',
    createdAt: new Date().toISOString(),
    presetId,
    layers,
  };
  writeAll([template, ...readAll()]);
  return template;
}

export function deleteTemplate(id: string): void {
  writeAll(readAll().filter((t) => t.id !== id));
}
