<!-- apps/kimi-web/src/components/chat/TurnFold.vue -->
<!-- A settled turn's work folded away behind one head row ("Worked for 12s")
     with the turn's final message left below it. The head is the only
     affordance: clicking it shows the work again.

     Two rules come from upstream's version of this fold:
       - while the turn is still running the head is hidden and the body is
         open, so nothing folds away under the reader's eyes mid-answer;
       - a closed fold keeps NO rows in the DOM. The body mounts one frame
         before it opens (so the 0fr -> 1fr transition plays instead of the
         content snapping open) and unmounts once the collapse has finished.
         Markdown and tool cards are the expensive part of a turn, so a folded
         row is cheap to keep around.

     Open state is owned by the caller (ChatPane is the single writer of the
     shared fold-state map, exactly as for the activity run) — this component
     only reports what the reader clicked. -->
<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import Icon from '../ui/Icon.vue';

const props = withDefaults(
  defineProps<{
    /** Fold identity: the state is remembered per turn, and survives the
     *  row's eviction/re-mount when it scrolls out of the viewport. */
    foldKey: string;
    /** Effective open state — the streaming exemption or the reader's own
     *  expansion. */
    open: boolean;
    /** The turn is still running: the head is hidden and the body is open. */
    streaming?: boolean;
    /** Head text, e.g. "Worked for 12s". */
    label: string;
  }>(),
  { streaming: false },
);

const emit = defineEmits<{ toggleFold: [key: string, open: boolean] }>();

/** The collapse transition (`--duration-base`) must finish before the rows
 *  leave the DOM, or the fold would disappear instead of folding. */
const BODY_UNMOUNT_MS = 200;

const bodyMounted = ref(props.open);
const bodyOpen = ref(props.open);
let unmountTimer: ReturnType<typeof setTimeout> | null = null;

function clearUnmountTimer(): void {
  if (unmountTimer === null) return;
  clearTimeout(unmountTimer);
  unmountTimer = null;
}

watch(
  () => props.open,
  (open) => {
    clearUnmountTimer();
    if (!open) {
      bodyOpen.value = false;
      unmountTimer = setTimeout(() => {
        unmountTimer = null;
        bodyMounted.value = false;
      }, BODY_UNMOUNT_MS);
      return;
    }
    if (bodyMounted.value) {
      bodyOpen.value = true;
      return;
    }
    bodyMounted.value = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bodyOpen.value = true;
      });
    });
  },
);

onUnmounted(clearUnmountTimer);

function toggle(): void {
  emit('toggleFold', props.foldKey, !props.open);
}
</script>

<template>
  <div class="turn-fold" :class="{ open, streaming }">
    <button
      v-if="!streaming"
      type="button"
      class="turn-fold-head"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="turn-fold-sum">{{ label }}</span>
      <Icon class="turn-fold-car" name="chevron-right" size="sm" aria-hidden="true" />
    </button>
    <div v-if="bodyMounted" class="turn-fold-body" :class="{ open: bodyOpen }" :inert="!open">
      <div class="turn-fold-body-inner">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.turn-fold {
  display: flex;
  flex-direction: column;
}
.turn-fold-head {
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
  line-height: var(--leading-solid);
  text-align: left;
  cursor: pointer;
  user-select: none;
  transition: color var(--duration-base) var(--ease-out);
}
.turn-fold-head:hover {
  color: var(--color-text);
}
.turn-fold-head:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--color-accent-soft);
}
.turn-fold-sum {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--weight-regular);
}
.turn-fold-car {
  flex: none;
  color: var(--color-text-faint);
  transition: transform var(--duration-base) var(--ease-out);
}
.turn-fold.open .turn-fold-car {
  transform: rotate(90deg);
}
.turn-fold-body {
  display: grid;
  grid-template-rows: minmax(0, 0fr);
  overflow: hidden;
  transition: grid-template-rows var(--duration-base) var(--ease-out);
}
.turn-fold-body.open {
  grid-template-rows: minmax(0, 1fr);
}
.turn-fold-body-inner {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
