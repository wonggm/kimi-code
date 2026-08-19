<!-- apps/kimi-web/src/components/chat/MentionMenu.vue -->
<!-- Popup list shown when user types @ in the Composer textarea: searched file
     paths, then session skills. Long lists get a scroll fade plus a draggable
     floating scrollbar (see useMenuScrollbar). -->
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
</script>

<template>
  <div class="mention-menu lg-glass" role="listbox">
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
          <span class="mention-name">{{ item.name }}</span>
          <span class="mention-path">{{ item.path }}</span>
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

/* ---- Menu surface defaults ---- */
.mention-menu { border-radius: var(--radius-lg); box-shadow: var(--sh); }
.mention-state { font-family: var(--sans); }
</style>