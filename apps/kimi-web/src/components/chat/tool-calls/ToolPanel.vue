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
  }>(),
  { title: '', flush: false, scroll: false },
);

// Upstream's panel head carries a Copy control beside the title, and it copies
// what the panel shows — the tool's own output. Reading the rendered body keeps
// every tool card from having to thread the same text through a prop.
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
      <IconButton size="sm" :class="{ copied }" :label="t('common.copy')" @click="copyBody">
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
  gap: var(--space-2);
  min-width: 0;
}
/* The edit card's head carries its own padding, so the panel adds none. */
.tp.flush { gap: 0; }
.tp.flush .tp-head { padding: 0 0 var(--space-2); }
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
  font-size: var(--text-sm);
  line-height: var(--leading-solid);
}
.tp-title {
  color: var(--color-text);
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tp-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
/* The body is the panel's scroll region; the block inside owns the scrolling
   itself, so the panel only has to allow it to shrink. */
.tp-body.scroll { min-height: 0; }
</style>
