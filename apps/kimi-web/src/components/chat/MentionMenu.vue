<!-- apps/kimi-web/src/components/chat/MentionMenu.vue -->
<!-- Popup list shown when user types @ in the Composer textarea: file/folder
     and skill completion candidates, merged and ranked by match quality. The
     engine's fs:suggest ranks fuzzy name + path-fragment matches and reports
     per-character match positions (offsets into the path) — those light up as
     bold fragments in the name / path columns. Long lists get a scroll fade
     plus a draggable floating scrollbar (see useMenuScrollbar). -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { iconSvg } from '../../lib/icons';
import { useMenuScrollbar } from '../../composables/useMenuScrollbar';
import type { FileItem } from '../../types';
import type { MentionItem } from '../../composables/useMentionMenu';

// Re-exported for the .vue consumers (Composer / ChatDock / ConversationPane)
// that import FileItem from this component.
export type { FileItem };

const props = defineProps<{
  items: MentionItem[];
  activeIndex: number;
  loading: boolean;
  /** The raw `@token` typed in the composer — fallback highlight when the
   *  search result carries no match positions. */
  query?: string;
  /** Inline viewport-clamp overrides (flip below / horizontal insets),
   *  computed by the composer against the anchor wrap's rect. */
  clampStyle?: Record<string, string>;
  /** `docked` = anchored floating panel above the textarea (desktop);
   *  `sheet` = flattened list rendered inside a mobile bottom sheet. */
  layout?: 'docked' | 'sheet';
}>();

const emit = defineEmits<{
  select: [item: MentionItem];
  hover: [index: number];
}>();

const { t } = useI18n();

const scrollEl = ref<HTMLElement | null>(null);
const { maskStyle, thumbStyle, onScroll, onThumbPointerDown } = useMenuScrollbar(scrollEl);

// ---------------------------------------------------------------------------
// File-type glyphs: small line-SVG icons (viewBox 0 0 16 16) keyed off the
// extension, plus the folder and skill glyphs. Subtle + muted; never an emoji.
// ---------------------------------------------------------------------------

const ICON_FOLDER = iconSvg('folder', 'sm');
const ICON_SKILL = iconSvg('sparkles', 'sm');
const ICON_CODE = iconSvg('code', 'sm');
const ICON_DOC = iconSvg('file-text', 'sm');
const ICON_IMAGE = iconSvg('image', 'sm');
const ICON_GENERIC = iconSvg('file', 'sm');

const CODE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'json', 'py', 'go', 'rs',
  'java', 'kt', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs', 'rb', 'php', 'swift',
  'sh', 'bash', 'zsh', 'css', 'scss', 'less', 'html', 'htm', 'xml', 'sql',
  'yaml', 'yml', 'toml', 'lua', 'dart', 'scala', 'clj', 'ex', 'exs',
]);
const DOC_EXT = new Set(['md', 'markdown', 'mdx', 'txt', 'rst', 'adoc', 'pdf', 'doc', 'docx']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif']);

function fileIcon(path: string): string {
  // Trailing slash → folder.
  if (path.endsWith('/')) return ICON_FOLDER;
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  if (!ext) return ICON_GENERIC;
  if (CODE_EXT.has(ext)) return ICON_CODE;
  if (DOC_EXT.has(ext)) return ICON_DOC;
  if (IMAGE_EXT.has(ext)) return ICON_IMAGE;
  return ICON_GENERIC;
}

function rowIcon(item: MentionItem): string {
  if (item.kind === 'skill') return ICON_SKILL;
  return fileIcon(item.path);
}

const firstSkillIndex = computed(() => props.items.findIndex((item) => item.kind === 'skill'));

function itemKey(item: MentionItem): string {
  return item.kind === 'skill' ? `skill:${item.name}` : item.path;
}

// ---------------------------------------------------------------------------
// Match highlighting: split a string into bold-hit / plain pieces. The engine
// reports per-character match positions as offsets into the full path; a run
// of consecutive positions merges into one range, and `baseOffset` shifts the
// positions into the displayed string (0 for the path, the name's offset for
// the name column). Without positions, fall back to the first plain substring
// of the query in the name.
// ---------------------------------------------------------------------------

interface Piece {
  text: string;
  hit: boolean;
}

function mergeRanges(positions: number[], baseOffset: number): [number, number][] {
  const sorted = [...positions].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  let start = -1;
  let prev = -2;
  for (const p of sorted) {
    if (start >= 0 && p === prev + 1) {
      prev = p;
      continue;
    }
    if (start >= 0) {
      ranges.push([start - baseOffset, prev + 1 - baseOffset]);
    }
    start = p;
    prev = p;
  }
  if (start >= 0) ranges.push([start - baseOffset, prev + 1 - baseOffset]);
  return ranges;
}

function pieces(text: string, ranges: [number, number][]): Piece[] {
  const out: Piece[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    const s = Math.max(cursor, start);
    const e = Math.min(text.length, Math.max(s, end));
    if (e <= s) continue;
    if (s > cursor) out.push({ text: text.slice(cursor, s), hit: false });
    out.push({ text: text.slice(s, e), hit: true });
    cursor = e;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out.length > 0 ? out : [{ text, hit: false }];
}

function fallbackNameRanges(name: string, query: string | undefined): [number, number][] {
  const q = (query ?? '').trim().toLowerCase();
  if (q.length === 0) return [];
  const idx = name.toLowerCase().indexOf(q);
  return idx >= 0 ? [[idx, idx + q.length]] : [];
}

function namePieces(item: MentionItem): Piece[] {
  if (item.kind === 'skill') return [{ text: item.name, hit: false }];
  const positions = item.matchPositions ?? [];
  const base = Math.max(0, item.path.length - item.name.length);
  const ranges = mergeRanges(positions, base).filter(([, end]) => end > 0);
  return pieces(item.name, ranges.length > 0 ? ranges : fallbackNameRanges(item.name, props.query));
}

function pathPieces(item: MentionItem): Piece[] {
  if (item.kind !== 'file' && item.kind !== 'folder') return [{ text: item.path, hit: false }];
  const positions = item.matchPositions ?? [];
  if (positions.length === 0) return [{ text: item.path, hit: false }];
  return pieces(item.path, mergeRanges(positions, 0));
}
</script>

<template>
  <div
    class="mention-menu lg-glass"
    :class="{ 'is-sheet': layout === 'sheet' }"
    :style="clampStyle"
    role="listbox"
  >
    <!-- Loading state -->
    <div v-if="props.loading" class="mention-state dim">{{ t('mention.searching') }}</div>

    <!-- Empty state (not loading, no items) -->
    <div v-else-if="props.items.length === 0" class="mention-state dim">{{ t('mention.noMatch') }}</div>

    <!-- Items: searched files, then a skill section -->
    <div v-else ref="scrollEl" class="menu-scroll" :style="maskStyle" @scroll="onScroll">
      <template v-for="(item, i) in props.items" :key="itemKey(item)">
        <div v-if="i === firstSkillIndex" class="mention-section">
          {{ t('mention.skills') }}
        </div>
        <div
          class="mention-item"
          :class="{ active: i === props.activeIndex }"
          role="option"
          :aria-selected="i === props.activeIndex"
          @mouseenter="emit('hover', i)"
          @mousedown.prevent="emit('select', item)"
        >
          <!-- type glyph (line-SVG) -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span class="mention-icon" v-html="rowIcon(item)" aria-hidden="true" />
          <span class="mention-name">
            <template v-for="(piece, pi) in namePieces(item)" :key="pi">
              <span v-if="piece.hit" class="mention-match">{{ piece.text }}</span><template v-else>{{ piece.text }}</template>
            </template>
          </span>
          <span class="mention-path">
            <template v-for="(piece, pi) in pathPieces(item)" :key="pi">
              <span v-if="piece.hit" class="mention-match">{{ piece.text }}</span><template v-else>{{ piece.text }}</template>
            </template>
          </span>
        </div>
      </template>
    </div>
    <div
      v-if="thumbStyle"
      class="menu-thumb"
      :style="thumbStyle"
      @pointerdown="onThumbPointerDown"
    />
  </div>
</template>

<style scoped>
/* `[role="listbox"]` raises specificity (0,3,0) so the redesign's surface +
   shadow-md win over any global menu styles. */
.mention-menu[role="listbox"] {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  padding: var(--space-1);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  z-index: var(--z-dropdown);
}

/* Concentric corners: the frame is radius-lg with space-1 padding, so the
   outermost rows pick up radius-md (frame radius minus padding) on their
   outer corners to stay concentric with the frame. */
.mention-menu > .menu-scroll > :first-child {
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
}
.mention-menu > .menu-scroll > :last-child {
  border-bottom-left-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-md);
}

/* Scroll container: owns the max-height + scrolling; hides the native
   scrollbar in favor of the floating thumb. */
.menu-scroll {
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: none;
}
.menu-scroll::-webkit-scrollbar {
  display: none;
}

/* Floating draggable scrollbar — sibling of the scroll container, anchored to
   the menu frame. Interactive hit area widened by the ::before overlay. */
.menu-thumb {
  position: absolute;
  right: 4px;
  width: var(--menu-scrollbar-width);
  border-radius: var(--radius-full);
  background: var(--menu-scrollbar-color);
  cursor: default;
  touch-action: none;
  transition: background var(--duration-base) var(--ease-out);
}
.menu-thumb::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(-1 * var(--space-2));
  right: 0;
}
.mention-menu:hover .menu-thumb {
  background: var(--menu-scrollbar-color-hover);
}

.mention-state {
  padding: 8px 12px;
  font-family: var(--font-ui);
  font-size: var(--text-sm);
}

.dim {
  color: var(--color-text-muted);
}

.mention-section {
  padding: 5px 10px 2px;
  font-size: var(--text-xs);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0;
  font-weight: var(--weight-semibold);
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
}

.mention-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: var(--color-text-faint);
  flex-shrink: 0;
}

/* Pin every glyph to the same 14px box so rows line up regardless of icon kind. */
.mention-icon :deep(svg) {
  width: 13px;
  height: 13px;
  display: block;
}

.mention-item:hover .mention-icon,
.mention-item.active .mention-icon {
  color: var(--color-text-muted);
}

.mention-item:hover {
  background: var(--color-surface-sunken);
}
.mention-item.active {
  background: var(--color-accent-soft);
}

.mention-name {
  color: var(--color-text);
  font-weight: 500;
  min-width: 80px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mention-path {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Bold-highlighted matched fragment (mirrors the slash menu's highlight). */
.mention-match {
  font-weight: var(--weight-semibold);
}

/* ---- Menu surface defaults ---- */
.mention-menu { border-radius: var(--radius-lg); box-shadow: var(--sh); }
.mention-state { font-family: var(--sans); }

/* ---- Sheet layout (mobile bottom sheet): same flattening as SlashMenu — no
   absolute anchoring, no raised surface (the sheet's own lg-frost surface
   owns the blur; the frame drops the lg-glass frost), no floating scrollbar
   thumb. ---- */
.mention-menu.is-sheet[role="listbox"] {
  position: static;
  padding: 0;
  background: transparent;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  border: none;
  border-radius: 0;
  box-shadow: none;
  z-index: auto;
}
.mention-menu.is-sheet .menu-scroll {
  padding: var(--space-1) var(--space-2);
}
.mention-menu.is-sheet .menu-thumb {
  display: none;
}
.mention-menu.is-sheet .menu-scroll > :first-child {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
.mention-menu.is-sheet .menu-scroll > :last-child {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.mention-menu.is-sheet .mention-state {
  padding-left: var(--space-4);
}
</style>
