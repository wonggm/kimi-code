<!-- apps/kimi-web/src/components/chat/SlashMenu.vue -->
<!-- Popup list of slash commands shown above the Composer textarea. Matched
     fragments are bold-highlighted; long lists get a scroll fade plus a
     draggable floating scrollbar (see useMenuScrollbar). -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SlashCommand } from '../../lib/slashCommands';
import type { SlashMatchRanges } from '../../lib/slashFuzzy';
import { useMenuScrollbar } from '../../composables/useMenuScrollbar';

const { t } = useI18n();

const props = defineProps<{
  items: SlashCommand[];
  activeIndex: number;
  /** The raw `/token` typed in the composer — drives the fallback highlight. */
  query?: string;
  /** Per-item highlight ranges computed by the fuzzy filter. */
  ranges?: SlashMatchRanges[];
}>();

const emit = defineEmits<{
  select: [item: SlashCommand];
  hover: [index: number];
}>();

const itemRefs = ref<HTMLElement[]>([]);
const scrollEl = ref<HTMLElement | null>(null);
const { maskStyle, thumbStyle, onScroll, onThumbPointerDown } = useMenuScrollbar(scrollEl);

/** Split a string into highlighted / plain pieces from the given ranges. */
function pieces(text: string, ranges?: [number, number][]): { text: string; hit: boolean }[] {
  if (!ranges || ranges.length === 0) return [{ text, hit: false }];
  const out: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  // Ranges may overlap; clamp and merge by walking them sorted.
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  for (const [start, end] of sorted) {
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

/** Fallback highlight when no ranges arrive (e.g. skills fed from elsewhere):
 *  bold any plain substring of the query in the name / desc. */
function fallbackRanges(query: string, name: string, desc: string): SlashMatchRanges {
  const q = query.trim().replace(/^\//, '').toLowerCase();
  if (q === '') return {};
  const ranges: SlashMatchRanges = {};
  const nameLower = name.replace(/^\//, '').toLowerCase();
  const nameIdx = nameLower.indexOf(q);
  if (nameIdx !== -1) ranges.name = [[nameIdx, nameIdx + q.length]];
  const descLower = desc.toLowerCase();
  const descIdx = descLower.indexOf(q);
  if (descIdx !== -1) ranges.desc = [[descIdx, descIdx + q.length]];
  return ranges;
}

const rows = computed(() =>
  props.items.map((item, i) => {
    const desc = item.isSkill ? item.desc : t(item.desc);
    const ranges = props.ranges?.[i] ?? fallbackRanges(props.query ?? '', item.name, desc);
    return {
      item,
      namePieces: pieces(item.name, ranges.name),
      desc,
      descPieces: pieces(desc, ranges.desc),
    };
  }),
);

watch(
  () => props.activeIndex,
  (idx) => {
    itemRefs.value[idx]?.scrollIntoView({ block: 'nearest' });
  },
);
</script>

<template>
  <div v-if="rows.length > 0 || items.length === 0" class="slash-menu lg-glass" role="listbox">
    <div v-if="items.length === 0" class="slash-empty" role="status">
      {{ t('composer.noCommands') }}
    </div>
    <div v-else ref="scrollEl" class="menu-scroll" :style="maskStyle" @scroll="onScroll">
      <div
        v-for="(row, i) in rows"
        :ref="(el) => { if (el) itemRefs[i] = el as HTMLElement }"
        :key="`${row.item.name}-${i}`"
        class="slash-item"
        :class="{ active: i === props.activeIndex }"
        role="option"
        :aria-selected="i === props.activeIndex"
        @mouseenter="emit('hover', i)"
        @mousedown.prevent="emit('select', row.item)"
      >
        <span class="slash-name">
          <template v-for="(piece, pi) in row.namePieces" :key="pi">
            <span v-if="piece.hit" class="slash-match">{{ piece.text }}</span><template v-else>{{ piece.text }}</template>
          </template>
        </span>
        <span class="slash-desc">
          <template v-for="(piece, pi) in row.descPieces" :key="pi">
            <span v-if="piece.hit" class="slash-desc-match">{{ piece.text }}</span><template v-else>{{ piece.text }}</template>
          </template>
        </span>
      </div>
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
.slash-menu[role="listbox"] {
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
  max-height: 240px;
  overflow-y: auto;
  scrollbar-width: none;
}
.menu-scroll::-webkit-scrollbar {
  display: none;
}

.slash-empty {
  padding: var(--space-2) var(--space-1);
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
}

.slash-item {
  display: grid;
  grid-template-columns: minmax(90px, 32%) minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 6px 10px;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
}

.slash-item:hover {
  background: var(--color-surface-sunken);
}
.slash-item.active {
  background: var(--color-accent-soft);
}
.slash-item.active .slash-name {
  color: var(--color-accent-hover);
}

.slash-name {
  color: var(--color-accent);
  font-weight: 500;
  min-width: 0;
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
}

/* Bold-highlighted matched fragment. */
.slash-match {
  font-weight: var(--weight-semibold);
}

.slash-desc {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  min-width: 0;
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
}

.slash-desc-match {
  font-weight: var(--weight-semibold);
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
.slash-menu:hover .menu-thumb {
  background: var(--menu-scrollbar-color-hover);
}

@media (max-width: 520px) {
  .slash-item {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
}

/* ---- Menu surface defaults ---- */
.slash-menu { border-radius: var(--radius-lg); box-shadow: var(--sh); }
.slash-desc { font-family: var(--sans); }
</style>