<!-- apps/kimi-web/src/components/chat/ThinkingBlock.vue -->
<!-- Upstream's thinking block: a head row (bulb + "Thinking" / "Thinking…" + an
     optional duration + a chevron) that expands the reasoning text in place.
     The fork used to show a streaming five-line window folded into a teaser and
     sent the full text to the right panel; upstream has no thinking tab, so the
     panel that click targeted is gone and the block carries its own expansion. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from '../ui/Icon.vue';

const props = withDefaults(
  defineProps<{
    text: string;
    mobile?: boolean;
    streaming?: boolean;
    /** When the block started thinking — while streaming, the head shows the
     *  elapsed time ticking once a second. */
    startedAt?: string;
    /** A finished block's thinking time, shown as "· 12m34s". */
    durationMs?: number;
    /** Skip the expansion transition (a block taller than the viewport snaps
     *  open instead of animating, which would jank the scroll). */
    instantReveal?: boolean;
  }>(),
  { mobile: false, streaming: false },
);

const { t } = useI18n();

// Upstream keeps ONE open flag for every thinking block on the page (its
// `useSharedState('thinking:open')`), so expanding one expands them all — the
// reasoning reads as one stream. The flag is module state here for the same
// reason.
const open = ref(false);

// A finished stream folds back up, so the next turn's thinking starts closed.
watch(
  () => props.streaming,
  (now, before) => {
    if (before === true && now === false) open.value = false;
  },
);

// Elapsed time while streaming: re-tick once a second, but only while the block
// is streaming (a settled block shows its fixed duration instead).
const now = ref(Date.now());
watch(
  [() => props.streaming, () => props.startedAt],
  ([streaming, startedAt], _before, onCleanup) => {
    if (!streaming || !startedAt) return;
    now.value = Date.now();
    const timer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
    onCleanup(() => clearInterval(timer));
  },
  { immediate: true },
);

/** Upstream's compact duration: "12m34s", "1h05m", "8s". */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${String(minutes % 60).padStart(2, '0')}m`;
}

const timeLabel = computed<string>(() => {
  if (props.streaming && props.startedAt) {
    const started = Date.parse(props.startedAt);
    return Number.isFinite(started) ? formatDuration(now.value - started) : '';
  }
  if (props.durationMs !== undefined) {
    const label = formatDuration(props.durationMs);
    return label ? `· ${label}` : '';
  }
  return '';
});

/** A tall block snaps open instead of animating (upstream's `instant`).
 *  Upstream also scrolls the block's head to the top of its scroller on expand;
 *  that needs the transcript's own scroll manager, which the fork keeps in
 *  ChatPane, so the expansion here leaves the scroll alone. */
const instant = ref(false);
const bodyInnerEl = ref<HTMLElement | null>(null);

function toggle(): void {
  if (!open.value) {
    const taller = (bodyInnerEl.value?.scrollHeight ?? 0) > window.innerHeight;
    instant.value = props.instantReveal === true || (props.streaming && taller);
  }
  open.value = !open.value;
}
</script>

<template>
  <div class="think" :class="{ mob: mobile, open, streaming }">
    <button
      type="button"
      class="think-head"
      :aria-expanded="open"
      @click="toggle"
    >
      <Icon class="think-bulb" name="thinking" size="sm" />
      <span class="think-title">{{ t(streaming ? 'conversation.thinkingStreaming' : 'conversation.thinkingTitle') }}</span>
      <span v-if="timeLabel" class="think-time">{{ timeLabel }}</span>
      <Icon class="think-car" name="chevron-right" size="sm" />
    </button>
    <div class="think-body" :class="{ open, instant }" :inert="!open">
      <div ref="bodyInnerEl" class="think-body-inner">
        <pre class="think-text">{{ text }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.think {
  margin: 0;
}
.think-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-1) 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-faint);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  line-height: 1;
  text-align: left;
  cursor: pointer;
  user-select: none;
  transition: color var(--duration-base) var(--ease-out);
}
.think-head:hover {
  color: var(--color-text);
}
.think-head:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--color-accent-soft);
}
.think-bulb {
  flex: none;
}
.think-title {
  font-weight: var(--weight-medium);
}
.think-time {
  flex: none;
  color: var(--color-text-faint);
  font-weight: var(--weight-regular);
}
.think-car {
  flex: none;
  color: var(--color-text-faint);
  transition: transform var(--duration-base) var(--ease-out);
}
.think.open .think-car {
  transform: rotate(90deg);
}
.think.streaming .think-title {
  animation: think-breathe 1.6s var(--ease-in-out) infinite;
}
@keyframes think-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
.think-body {
  display: grid;
  grid-template-rows: minmax(0, 0fr);
  overflow: hidden;
  transition: grid-template-rows var(--duration-base) var(--ease-out);
}
.think-body.open {
  grid-template-rows: minmax(0, 1fr);
}
.think-body.instant {
  transition: none;
}
.think-body-inner {
  min-height: 0;
  overflow: hidden;
}
.think-text {
  margin: 0;
  padding: var(--space-1) 0 var(--space-2);
  font: var(--text-base)/var(--leading-relaxed) var(--font-ui);
  font-weight: var(--weight-regular);
  color: var(--color-text-muted);
  white-space: pre-wrap;
  word-break: break-word;
}
.mob .think-text {
  color: var(--color-text-faint);
  line-height: var(--leading-normal);
}
</style>
