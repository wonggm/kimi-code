<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from '../../ui/Icon.vue';
import IconButton from '../../ui/IconButton.vue';

const { t } = useI18n();

withDefaults(
  defineProps<{
    title?: string;
    flush?: boolean;
    scroll?: boolean;
    copy?: boolean;
  }>(),
  { title: '', flush: false, scroll: false, copy: true },
);

// Upstream's panel head carries a Copy control beside the title, and it copies
// what the panel shows — the tool's own output. Reading the rendered body keeps
// every tool card from having to thread the same text through a prop. A head
// with no output behind it (the todo list) turns the control off.
const bodyEl = ref<HTMLElement | null>(null);
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

async function copyBody(): Promise<void> {
  const text = bodyEl.value?.innerText ?? '';
  if (text === '') return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copied.value = false;
  }, 1500);
}
</script>

<template>
  <div class="tp" :class="{ flush }">
    <div v-if="title || $slots.head" class="tp-head">
      <span class="tp-titles">
        <slot name="head">
          <span v-if="title" class="tp-title">{{ title }}</span>
        </slot>
      </span>
      <IconButton v-if="copy" size="sm" :class="{ copied }" :label="t('common.copy')" @click="copyBody">
        <Icon :name="copied ? 'check' : 'copy'" size="md" />
      </IconButton>
    </div>
    <div ref="bodyEl" class="tp-body" :class="{ scroll }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.tp {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-fill-1);
  overflow: clip;
}
/* The edit card's head carries its own padding, so the panel adds none. */
.tp.flush { gap: 0; padding: 0; }
.tp.flush .tp-head { padding: var(--space-2) var(--space-3); }
.tp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
}
.tp-titles {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
}
.tp-title {
  color: var(--color-text);
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tp-body { min-width: 0; min-height: 0; }
.tp-body.scroll {
  max-height: 13lh;
  overflow: auto;
  overscroll-behavior: contain;
}
</style>
