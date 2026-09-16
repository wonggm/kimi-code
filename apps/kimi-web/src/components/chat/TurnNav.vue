<!-- apps/kimi-web/src/components/chat/TurnNav.vue -->
<!-- The previous/next item pair a transcript row carries. It walks the
     reader's focus from turn to turn: a row far from the viewport keeps only a
     height placeholder instead of its content, so there is nothing inside it
     to Tab into, and this pair is the way back to it (and the way past it).

     The pair is invisible — and out of the tab order, which `visibility:
     hidden` removes along with the paint — until the row it belongs to holds
     keyboard focus. A mouse click focuses a row without `:focus-visible`, so
     selecting text never uncovers the pair. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from '../ui/Button.vue';

/** Which neighbour exists: the first row has no previous item, the last none
 *  to go on to, so each button is rendered only where it can act. */
withDefaults(defineProps<{
  hasPrevious?: boolean;
  hasNext?: boolean;
}>(), {
  hasPrevious: false,
  hasNext: false,
});

const emit = defineEmits<{
  previous: [];
  next: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="turn-nav">
    <Button v-if="hasPrevious" variant="secondary" size="sm" @click="emit('previous')">
      {{ t('conversation.historyPrevious') }}
    </Button>
    <Button v-if="hasNext" variant="secondary" size="sm" @click="emit('next')">
      {{ t('conversation.historyNext') }}
    </Button>
  </div>
</template>

<style scoped>
/* Anchored to the row's inline start. Side by side rather than stacked: a row
   can be as short as a one-line divider, and two stacked buttons would overlap
   each other on one. The reveal lives in ChatPane, which owns the row. */
.turn-nav {
  position: absolute;
  inset-inline-start: var(--space-1);
  top: var(--space-1);
  z-index: var(--z-sticky);
  display: flex;
  gap: var(--space-1);
  visibility: hidden;
  user-select: none;
}
</style>
