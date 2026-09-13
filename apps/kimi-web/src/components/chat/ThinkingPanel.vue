<!-- apps/kimi-web/src/components/chat/ThinkingPanel.vue -->
<!-- Body-sized scrolling text in the right panel — the compaction summary.
     Content is reactive: while the block is still streaming the text keeps
     growing, and the body follows the bottom as long as the user hasn't
     scrolled up. Upstream's own compaction pane is exactly this element pair
     (`div.tp > pre.tp-body`), with no pane header of its own. -->
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  text: string;
}>();

const bodyEl = ref<HTMLElement | null>(null);
watch(
  () => props.text,
  () => {
    const el = bodyEl.value;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (!atBottom) return;
    void nextTick(() => {
      if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight;
    });
  },
  { immediate: true },
);
</script>

<template>
  <div class="tp">
    <pre ref="bodyEl" class="tp-body">{{ text }}</pre>
  </div>
</template>

<style scoped>
.tp {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--color-bg);
}

.tp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 12px 14px;
  padding-bottom: max(12px, var(--pfc-host-h, 0px));
  font: var(--text-base)/var(--leading-relaxed) var(--font-ui);
  font-weight: 400;
  color: var(--color-text-muted);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
