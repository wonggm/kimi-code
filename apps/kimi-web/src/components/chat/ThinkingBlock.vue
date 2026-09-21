<!-- apps/kimi-web/src/components/chat/ThinkingBlock.vue -->
<!-- Upstream's thinking block: a head row (bulb + "Thinking" / "Thinking…" + an
     optional duration + a chevron) that expands the reasoning text in place.
     The fork used to show a streaming five-line window folded into a teaser and
     sent the full text to the right panel; upstream has no thinking tab, so the
     panel that click targeted is gone and the block carries its own expansion.
     Once its thinking ends the card folds back up and the head reads how long
     that thinking took ("Thought for 3s"): the span of the step the block came
     from, read off the transcript page (`durationMs`), falling back to the span
     this block watched stream when the page has none. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { bareDuration } from '../../lib/bareDuration';
import Icon from '../ui/Icon.vue';

const props = withDefaults(
  defineProps<{
    text: string;
    mobile?: boolean;
    streaming?: boolean;
    /** When the block started thinking — while streaming, the head shows the
     *  elapsed time ticking once a second. */
    startedAt?: string;
    /** A finished block's thinking time, overriding the span the block timed
     *  itself; the head reads "Thought for 3s". Comes from the transcript page,
     *  which carries the span on the step the block came from. */
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
  return '';
});

// How long the thinking took. A thinking frame carries no time of its own
// (`{frameId, text}`) and the step that holds it spans the whole model round,
// tools included, so the page's per-step span — passed in as `durationMs` — is
// the measured fact, and `headTitle` prefers it. What the block watched itself
// is the fallback for a block the page has no span for: `streaming` is true
// exactly while this block is the one being written, so the span between the
// flag rising and falling is that thinking. A block that was already finished
// when the transcript arrived (a reload) and that the page has no span for has
// nothing to measure and keeps the plain head.
const thinkingStartedAt = ref<number | null>(null);
const measuredMs = ref<number | null>(null);

watch(
  () => props.streaming,
  (streaming) => {
    if (streaming) {
      thinkingStartedAt.value = Date.now();
      measuredMs.value = null;
      return;
    }
    if (thinkingStartedAt.value !== null) {
      measuredMs.value = Date.now() - thinkingStartedAt.value;
      thinkingStartedAt.value = null;
    }
  },
  { immediate: true },
);

const headTitle = computed<string>(() => {
  if (props.streaming) return t('conversation.thinkingStreaming');
  const ms = props.durationMs ?? measuredMs.value;
  if (ms === null || ms === undefined) return t('conversation.thinkingTitle');
  const duration = bareDuration(ms / 1000);
  return duration ? t('conversation.thoughtFor', { duration }) : t('conversation.thinkingTitle');
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
      <span class="think-ic"><Icon name="thinking" size="sm" /></span>
      <span class="think-title">{{ headTitle }}</span>
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
  --think-gutter: 20px;
  --think-gap: var(--space-2);
  margin: 0;
}
.think-head {
  display: flex;
  align-items: center;
  gap: var(--think-gap);
  width: 100%;
  min-height: var(--think-gutter);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-faint);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  line-height: var(--think-gutter);
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
.think-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--think-gutter);
  height: var(--think-gutter);
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
  position: relative;
  min-height: 0;
  overflow: hidden;
  padding-left: calc(var(--think-gutter) + var(--think-gap));
}
.think-body-inner::before {
  /* Same token trick as the tool row's rail, for the same reason. */
  --think-rail: repeating-linear-gradient(to bottom, var(--color-line) 0 2px, transparent 2px 4px);
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc((var(--think-gutter) - var(--p-hairline)) / 2);
  width: var(--p-hairline);
  background-image: var(--think-rail);
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
