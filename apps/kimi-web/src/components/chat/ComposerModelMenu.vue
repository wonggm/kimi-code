<!-- apps/kimi-web/src/components/chat/ComposerModelMenu.vue -->
<!-- Content of the composer model quick-switch dropdown: starred models from
     other providers, the current provider's models, the thinking level
     segmented control, and the "more models" row. Rendered inside the
     composer's anchored model-dropdown panel on desktop and inside the mobile
     bottom sheet; the rows are identical in both, so the content lives here
     once and the composer picks the wrapper. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppModel, ThinkingLevel } from '../../api/types';
import type { ConversationStatus } from '../../types';
import {
  commitLevel,
  effectiveThinkingLevel,
  effortLabel,
  modelThinkingAvailability,
  segmentsFor,
} from '../../lib/modelThinking';
import Icon from '../ui/Icon.vue';

const props = withDefaults(
  defineProps<{
    models: AppModel[];
    starredIds: string[];
    status?: ConversationStatus;
    thinking?: ThinkingLevel;
  }>(),
  {
    models: () => [],
    starredIds: () => [],
    status: undefined,
    thinking: undefined,
  },
);

const emit = defineEmits<{
  select: [modelId: string];
  more: [];
  setThinking: [level: string];
}>();

const { t } = useI18n();

// Identity is the model id — display/model names can collide across providers.
const currentModel = computed(() => props.models.find((m) => m.id === props.status?.modelId));
const currentProvider = computed(() => currentModel.value?.provider ?? '');

const providerModels = computed(() => {
  if (!currentProvider.value || !props.models.length) return [];
  return props.models.filter((m) => m.provider === currentProvider.value);
});

const starredSet = computed(() => new Set(props.starredIds));
function isStarred(modelId: string): boolean {
  return starredSet.value.has(modelId);
}
const starredOtherModels = computed(() => {
  if (!props.models.length) return [];
  return props.models.filter((m) => isStarred(m.id) && m.provider !== currentProvider.value);
});

// Thinking level — mirrors the composer's own computation (effort segments for
// effort models, On/Off for boolean models, unsupported note otherwise).
const thinkingAvailability = computed(() => modelThinkingAvailability(currentModel.value));
const thinkingSegments = computed(() => segmentsFor(currentModel.value));
const thinkingLevel = computed(() => effectiveThinkingLevel(currentModel.value, props.thinking));
const activeThinkingSegment = computed(() => {
  const segs = thinkingSegments.value;
  return segs.includes(thinkingLevel.value) ? thinkingLevel.value : '';
});
const thinkingReadonly = computed(
  () => thinkingAvailability.value === 'unsupported' || thinkingSegments.value.length <= 1,
);
function setThinkingSegment(draft: string): void {
  if (thinkingReadonly.value) return;
  emit('setThinking', commitLevel(currentModel.value, draft));
}
function thinkingSegmentLabel(segment: string): string {
  if (segment === 'on') return t('status.thinkingOn');
  if (segment === 'off') return t('status.thinkingOff');
  return effortLabel(segment);
}
</script>

<template>
  <!-- Starred models from other providers -->
  <div v-if="starredOtherModels.length > 0" class="md-section">{{ t('status.starredModels') }}</div>
  <button
    v-for="m in starredOtherModels"
    :key="m.id"
    class="md-row"
    :class="{ 'is-current': m.id === status?.modelId }"
    role="menuitem"
    @click="emit('select', m.id)"
  >
    <span class="md-check"><Icon v-if="m.id === status?.modelId" name="check" size="sm" /></span>
    <span class="md-name">{{ m.displayName ?? m.model }}</span>
    <span class="md-provider">{{ m.provider }}</span>
    <Icon class="md-star" name="star" size="sm" />
  </button>

  <div v-if="starredOtherModels.length > 0" class="md-divider" />

  <!-- Current provider models -->
  <div v-if="providerModels.length > 0" class="md-section">{{ currentProvider }}</div>
  <button
    v-for="m in providerModels"
    :key="m.id"
    class="md-row"
    :class="{ 'is-current': m.id === status?.modelId }"
    role="menuitem"
    @click="emit('select', m.id)"
  >
    <span class="md-check"><Icon v-if="m.id === status?.modelId" name="check" size="sm" /></span>
    <span class="md-name">{{ m.displayName ?? m.model }}</span>
    <Icon v-if="isStarred(m.id)" class="md-star" name="star" size="sm" />
  </button>

  <div v-if="providerModels.length > 0" class="md-divider" />

  <!-- Thinking level — segmented control. Effort models show every declared
       level; boolean models show On/Off; unsupported shows a note. -->
  <div class="md-thinking" :class="{ 'is-readonly': thinkingReadonly }">
    <span class="md-name">{{ t('status.thinkingLabel') }}</span>
    <span
      v-if="thinkingAvailability === 'unsupported'"
      class="md-note"
    >{{ t('status.modeNotSupported') }}</span>
    <div
      v-else
      class="effort-segments"
      role="group"
      :aria-label="t('status.thinkingLabel')"
    >
      <button
        v-for="seg in thinkingSegments"
        :key="seg"
        type="button"
        class="effort-seg"
        :class="{ 'is-active': seg === activeThinkingSegment }"
        :disabled="thinkingReadonly"
        @click="setThinkingSegment(seg)"
      >{{ thinkingSegmentLabel(seg) }}</button>
    </div>
  </div>

  <div class="md-divider" />
  <div class="md-cache-note">{{ t('status.cacheNote') }}</div>

  <div class="md-divider" />

  <!-- More models → open full picker -->
  <button class="md-row md-row-more" role="menuitem" @click="emit('more')">
    <span class="md-name">{{ t('status.moreModels') }}</span>
  </button>
</template>

<style scoped>
.md-section {
  padding: 4px 7px 2px;
  font-size: var(--text-xs);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0;
  font-weight: var(--weight-semibold);
}

.md-row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: var(--ui-font-size);
  color: var(--color-text);
  padding: 5px 7px;
  border-radius: 6px;
  text-align: left;
}
.md-row:hover { background: var(--color-surface-sunken); }
.md-row:disabled {
  cursor: default;
  opacity: 0.58;
}
.md-row:disabled:hover { background: none; }
.md-row.is-current { color: var(--color-text); background: var(--color-accent-soft); }
.md-row.is-on { color: var(--color-accent); }
.md-note {
  margin-left: auto;
  color: var(--muted);
  font-size: var(--ui-font-size-xs);
}

.md-row-more {
  color: var(--color-accent);
  font-weight: 500;
}
.md-row-more:hover {
  background: var(--color-accent-soft);
}

.md-check {
  width: 14px;
  flex: none;
  color: var(--color-accent);
  font-weight: 500;
  display: flex;
  justify-content: center;
}

.md-name {
  flex: 1;
}
.md-provider {
  color: var(--muted);
  font-size: var(--ui-font-size-xs);
  flex: none;
}
.md-star {
  color: var(--star);
  flex: none;
  margin-left: auto;
}

.md-divider {
  height: 1px;
  background: var(--line);
  margin: 3px 0;
}

/* Thinking level segmented control — sits inside the model menu. */
.md-thinking {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 7px;
  border-radius: var(--radius-sm);
}
.md-thinking .md-name {
  font-family: var(--font-ui);
  font-size: var(--ui-font-size);
  color: var(--color-text);
  flex: none;
}
.md-thinking .md-note {
  margin-left: auto;
}
.effort-segments {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 2px;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
}
.effort-seg {
  appearance: none;
  border: none;
  background: none;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: var(--ui-font-size-xs);
  line-height: 1;
  color: var(--color-text-muted);
  padding: 4px 9px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  transition: background 0.12s, color 0.12s, box-shadow 0.12s;
}
.effort-seg:hover:not(:disabled):not(.is-active) {
  background: var(--color-surface-raised);
  color: var(--color-text);
}
.effort-seg:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.effort-seg.is-active {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  box-shadow: var(--shadow-xs);
  font-weight: 500;
}
.effort-seg:disabled {
  cursor: default;
}
.md-thinking.is-readonly .effort-segments {
  opacity: 0.62;
}
.md-cache-note {
  /* width:0 + min-width:100% — the note never widens the shrink-to-fit
     dropdown, but always fills its width and wraps there naturally. */
  width: 0;
  min-width: 100%;
  padding: 2px 7px 4px;
  color: var(--muted);
  font-size: var(--ui-font-size-xs);
  line-height: 1.4;
}
.md-thinking.is-readonly .effort-seg.is-active {
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  box-shadow: none;
}

/* Mobile: the menu opens as a bottom sheet at full width — bump the row and
   segment fonts, and let the thinking segments stretch across the row
   (same flex treatment the composer's docked menu got). */
@media (max-width: 640px) {
  .md-row {
    font-size: var(--ui-font-size);
  }
  .md-section {
    font-size: var(--ui-font-size);
  }
  .md-thinking {
    flex-wrap: wrap;
    row-gap: 6px;
  }
  .md-thinking .effort-segments {
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
  }
  .md-thinking .effort-seg {
    flex: 1;
    padding: 5px 6px;
  }
}
</style>