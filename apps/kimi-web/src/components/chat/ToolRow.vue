<!-- apps/kimi-web/src/components/chat/ToolRow.vue
     One tool call as upstream renders it: a `tool-line` row with a `tl-head`
     (glyph, name, per-tool detail, the expand chevron) over a `tl-body` that
     stays mounted and goes `inert` while closed. No card chrome — upstream's
     rows are borderless lines, grouped by the activity run above them. -->
<script setup lang="ts">
import { inject, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from '../ui/Icon.vue';
import Tooltip from '../ui/Tooltip.vue';
import StatusDot from '../ui/StatusDot.vue';

withDefaults(
  defineProps<{
    status: 'running' | 'ok' | 'error' | 'suspended';
    /** Inline-SVG glyph string (toolGlyph), or empty for none. */
    icon?: string;
    name: string;
    /** Head detail, upstream's per-kind shape: a file button, the faint
     *  directory, or a mono subject. `arg` is the plain fallback. */
    file?: string;
    dir?: string;
    mono?: string;
    /** Edit stats: the +A / −A pair and their proportion bar. */
    diff?: { add: number; del: number };
    arg?: string;
    faint?: string;
    time?: string;
    open?: boolean;
    expandable?: boolean;
  }>(),
  {
    icon: '',
    file: '',
    dir: '',
    mono: '',
    arg: '',
    faint: '',
    time: '',
    open: false,
    expandable: false,
  },
);

const emit = defineEmits<{ toggle: [] }>();

const { t } = useI18n();

const pinScroll = inject<(el: HTMLElement, ms?: number) => void>('pinScroll', () => {});
const bodyEl = ref<HTMLElement | null>(null);

function onHeadClick(): void {
  emit('toggle');
  const el = bodyEl.value;
  if (el) nextTick(() => pinScroll(el));
}
</script>

<template>
  <div class="tool-line" :class="{ expandable, open }">
    <div class="tl-head" :class="{ clickable: expandable }" @click="onHeadClick">
      <span v-if="icon" class="tl-ic" aria-hidden="true" v-html="icon" />
      <span class="tl-main">
        <span class="tl-lead">
          <span class="tl-name">{{ name }}</span>
          <button v-if="file" type="button" class="tl-file">{{ file }}</button>
          <span v-if="dir" class="tl-faint">{{ dir }}</span>
          <span v-if="mono" class="tl-mono">{{ mono }}</span>
          <Tooltip v-if="!file && !mono" :text="arg">
            <span v-if="arg" class="tl-dim">{{ arg }}</span>
          </Tooltip>
          <span v-if="faint" class="tl-faint">{{ faint }}</span>
          <span v-if="expandable" class="ui-tip">
            <button
              type="button"
              class="tl-car"
              :aria-expanded="open"
              :aria-label="t('tools.disclosure.expand')"
              @click.stop="onHeadClick"
            >
              <Icon class="tl-car-ic" name="chevron-right" size="sm" />
            </button>
          </span>
        </span>
      </span>
      <span class="tl-tail">
        <template v-if="diff">
          <span class="tl-add">+{{ diff.add }}</span>
          <span class="tl-del">−{{ diff.del }}</span>
          <span class="diffbar" aria-hidden="true">
            <span class="seg-add" :style="{ flexGrow: Math.max(diff.add, 1) }" />
            <span class="seg-del" :style="{ flexGrow: Math.max(diff.del, 1) }" />
          </span>
        </template>
        <slot name="trailing" />
        <span v-if="time" class="tl-time">{{ time }}</span>
        <span v-if="status !== 'ok'" class="tl-status" :class="status" role="status" :aria-label="status">
          <Icon v-if="status === 'error'" name="close" size="sm" />
          <StatusDot v-else-if="status === 'suspended'" status="suspended" />
          <StatusDot v-else status="running" />
        </span>
      </span>
    </div>
    <div ref="bodyEl" class="tl-body" :class="{ open }" :inert="!open">
      <div class="tl-body-inner">
        <div class="tl-body-content">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-line {
  display: block;
  --tl-gutter: 20px;
  --tl-gap: var(--space-2);
  --tl-indent: calc(var(--tl-gutter) + var(--tl-gap));
}
.tl-head {
  display: flex;
  align-items: center;
  gap: var(--tl-gap);
  width: 100%;
  min-height: var(--tl-gutter);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  /* The head's height is the gutter token, not the font's line box, so the row
     and the body's rail share one column. */
  line-height: var(--tl-gutter);
  text-align: left;
}
.tl-head.clickable { cursor: pointer; user-select: none; }
.tl-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--tl-gutter);
  height: var(--tl-gutter);
  color: var(--color-text-faint);
}
.tl-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-1); }
.tl-lead { display: flex; align-items: center; gap: var(--space-1); min-width: 0; }
.tl-name { font-weight: var(--weight-regular); color: var(--color-text-muted); flex: none; }
.tl-dim {
  color: var(--color-text-muted);
  line-height: var(--leading-tight);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-tail { margin-left: auto; display: flex; align-items: center; gap: var(--space-1); flex: none; }
.tl-time { color: var(--color-text-faint); font-size: var(--text-xs); }
.tl-status { display: inline-flex; align-items: center; flex: none; }
.tl-status.error { color: var(--color-danger); }
/* The chevron's wrapper is a plain span, whose line box added a pixel over the
   16px button and made every tool row 25px where upstream's is 24px. */
.tl-lead > .ui-tip {
  display: inline-flex;
  align-items: center;
}
.tl-car {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-faint);
  cursor: pointer;
}
.tl-car:hover { color: var(--color-text); }
.tl-car:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.tl-car-ic { transition: transform var(--duration-base) var(--ease-out); }
.tool-line.open .tl-car-ic { transform: rotate(90deg); }

/* Expanded detail: `grid-template-rows` 0fr ↔ 1fr animates in every modern
   browser, unlike `height: auto`. The inner needs min-height 0 + overflow
   hidden so the 0fr track collapses fully. */
.tl-body {
  display: grid;
  grid-template-rows: minmax(0, 0fr);
  overflow: hidden;
  transition: grid-template-rows var(--duration-base) var(--ease-out);
}
.tl-body.open { grid-template-rows: minmax(0, 1fr); }
/* The dotted rail: upstream's column rule, centred on the head's icon box and
   running the full height of the expanded body. */
.tl-body-inner {
  position: relative;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-1) 0 var(--space-2) var(--tl-indent);
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}
.tl-body-inner::before {
  /* The dashes ride a token: check-style reads a token's own line, so a raw
     gradient here would be reported as a gradient value. */
  --tl-rail: repeating-linear-gradient(to bottom, var(--color-line) 0 2px, transparent 2px 4px);
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc((var(--tl-gutter) - var(--p-hairline)) / 2);
  width: var(--p-hairline);
  background-image: var(--tl-rail);
}
.tl-body-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

/* Chip slot (line counts, result counts): upstream's tl-chip. */
.tl-file {
  font-weight: var(--weight-regular);
  color: var(--color-text);
  line-height: var(--leading-tight);
  flex: none;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
}
.tl-file:hover { color: var(--color-accent); text-decoration: underline; text-underline-offset: 3px; }
.tl-file:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.tl-faint {
  color: var(--color-text-faint);
  line-height: var(--leading-tight);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-mono {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-ligatures: none;
  color: var(--color-text-muted);
  line-height: normal;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-add { color: var(--color-success); font-family: var(--font-mono); font-size: var(--text-xs); flex: none; }
.tl-del { color: var(--color-danger); font-family: var(--font-mono); font-size: var(--text-xs); flex: none; }
.diffbar {
  display: inline-flex;
  width: 36px;
  height: 3px;
  border-radius: var(--radius-full);
  overflow: hidden;
  gap: 1px;
  flex: none;
}
.seg-add { background: var(--color-success); }
.seg-del { background: var(--color-danger); }

/* Chip slot (line counts, result counts): upstream's tl-chip. */
:slotted(.chip) {
  color: var(--color-text-faint);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  flex: none;
  white-space: nowrap;
}

/* The status chip a tool can carry (the goal tools' state): upstream's
   `tl-pill` geometry, with the tone colours in the owning card. */
:slotted(.tl-pill) {
  font-size: var(--text-xs);
  line-height: 1.5;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  flex: none;
  white-space: nowrap;
}
</style>
