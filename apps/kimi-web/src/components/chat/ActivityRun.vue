<!-- apps/kimi-web/src/components/chat/ActivityRun.vue
     Upstream's activity run: a run of consecutive tool calls behind one head
     row — a state glyph, the counted summary ("Read 1 file · Ran 1 command ·
     Searched 1 pattern · Made 1 edit") and a chevron — over a body that holds
     the run's tool rows. The run wraps tool calls only, and counts them only; a
     thinking block is a block of its own above the run, not a row inside it
     (upstream nests the thinking block in the run's body).
     Collapsed by default; the body stays mounted and is `inert` while closed,
     exactly as upstream renders it. -->
<script setup lang="ts">
import { computed, type VNode } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RunItem, ToolStackItem } from '../chatTurnRendering';
import { toolStackKey } from '../chatTurnRendering';
import { buildActivitySummary } from '../../lib/activitySummary';
import { foldAggregateStatus } from '../../lib/toolFold';
import { activityRunFolding } from '../../lib/conversationPrefs';
import { iconSvg } from '../../lib/icons';
import { toolGlyph } from '../../lib/toolMeta';
import Icon from '../ui/Icon.vue';

const props = withDefaults(
  defineProps<{
    items: RunItem[];
    /** The turn's streaming flag, passed by the caller. The run does not read
     *  it: its only rows are tool cards, and a tool's own status carries the
     *  live state. */
    streaming?: boolean;
    /** Run identity — the fold state is remembered per run. */
    runKey: string;
    /** Open state, owned by the parent: ChatPane is the single writer of the
     *  shared fold-state map (a second writer flips the key twice). */
    expanded?: boolean;
  }>(),
  { streaming: false, expanded: false },
);

const emit = defineEmits<{ toggleFold: [key: string, open: boolean] }>();

/** The parent renders the tool rows: it owns their cards and their events. */
defineSlots<{ default?: (props: { item: ToolStackItem }) => VNode[] }>();

const { t } = useI18n();

/** Every row of the run is a tool call, so the head counts the rows as they are. */
const status = computed(() => foldAggregateStatus(props.items));

/** Upstream picks the glyph by state: a check when done, a close on failure,
 *  the running tool's own glyph while it works. */
const glyph = computed<string>(() => {
  if (status.value === 'running') {
    const running =
      props.items.find((item) => item.tool.status === 'running') ?? props.items[props.items.length - 1];
    if (running) return toolGlyph(running.tool.name);
  }
  return iconSvg(status.value === 'error' ? 'close' : 'check', 'sm');
});

const summary = computed(() => buildActivitySummary(props.items, t, { durationMs: undefined }));

// With the tool-call summary preference off, the run is always expanded —
// upstream does the same (`open = forceOpen || !activityRunFolding || state`).
const expanded = computed(() => !activityRunFolding.value || props.expanded);

function toggle(): void {
  emit('toggleFold', props.runKey, !props.expanded);
}
</script>

<template>
  <div class="activity-run" :class="{ open: expanded }">
    <button
      type="button"
      class="ar-head"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <!-- eslint-disable-next-line vue/no-v-html -- iconSvg() returns a registry SVG string, never user input. -->
      <span class="ar-sr-only" role="status">{{ status }}</span>
      <span class="ar-glyph" :class="{ run: status === 'running', err: status === 'error', ok: status === 'done' }" aria-hidden="true" v-html="glyph" />
      <span class="ar-sum" :title="summary.plain">
        <template v-for="(clause, i) in summary.clauses" :key="i">
          <span v-if="i > 0" class="ar-sep"> · </span>
          <span
            v-for="(fragment, j) in clause.fragments"
            :key="j"
            :class="{ 'ar-faint': fragment.tone === 'faint', 'ar-danger': fragment.tone === 'danger' }"
          >{{ fragment.text }}</span>
        </template>
      </span>
      <Icon class="ar-car" name="chevron-right" size="sm" aria-hidden="true" />
    </button>
    <div class="ar-body" :class="{ open: expanded }" :inert="!expanded">
      <div class="ar-body-inner">
        <template v-for="item in items" :key="toolStackKey(item)">
          <slot :item="item" />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.activity-run {
  display: flex;
  flex-direction: column;
  animation: kimi-card-in var(--duration-base) var(--ease-out);
}
.ar-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-2) 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-faint);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  /* Upstream's `--leading-solid`: its summary row is 30px tall, not 32. */
  line-height: var(--leading-solid);
  cursor: pointer;
  text-align: left;
}
.ar-head:hover { color: var(--color-text); }
.ar-head:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--color-accent-soft); }
.ar-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.ar-glyph {
  display: inline-flex;
  align-items: center;
  flex: none;
  color: var(--color-text-faint);
}
.ar-glyph.ok { color: var(--color-success); }
.ar-glyph.err { color: var(--color-danger); }
.ar-glyph.run { color: var(--color-text-muted); }
.ar-sum {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--weight-regular);
}
.ar-faint,
.ar-sep { color: var(--color-text-faint); }
.ar-danger { color: var(--color-danger); }
.activity-run.open .ar-car { transform: rotate(90deg); }
.ar-car { flex: none; transition: transform var(--duration-fast) var(--ease-out); }
.ar-body {
  display: grid;
  grid-template-rows: minmax(0, 0fr);
  overflow: hidden;
  transition: grid-template-rows var(--duration-base) var(--ease-out);
}
.ar-body.open { grid-template-rows: minmax(0, 1fr); }
.ar-body-inner {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-1);
}
</style>
