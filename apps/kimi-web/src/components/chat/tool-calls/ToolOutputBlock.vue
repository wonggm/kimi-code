<!-- Shared line-oriented tool output block. Keeps long outputs to a readable
     viewport while preserving the tool card's normal typography. -->
<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  lines?: string[];
  emptyText?: string;
  wrap?: boolean;
}>(), { wrap: true });

const outputLines = computed(() => props.lines ?? []);
</script>

<template>
  <div class="op" :class="{ nowrap: !wrap }">
    <div v-if="outputLines.length === 0 && emptyText" class="bb-empty">{{ emptyText }}</div>
    <div v-for="(line, i) in outputLines" :key="i">{{ line }}</div>
  </div>
</template>

<style scoped>
.op {
  font-family: var(--font-mono);
  font-size: var(--content-font-size);
  line-height: 1.571;
  font-feature-settings: 'liga' 0, 'calt' 0;
  font-variant-ligatures: none;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  text-autospace: no-autospace;
  max-height: 12lh;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.op.nowrap {
  white-space: pre;
  word-break: normal;
}
.op.nowrap > div {
  box-sizing: border-box;
  width: max-content;
  min-width: 100%;
  padding-right: var(--space-3);
}
.bb-empty {
  color: var(--color-text-faint);
  font-style: italic;
}
</style>
