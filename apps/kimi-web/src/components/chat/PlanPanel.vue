<!-- apps/kimi-web/src/components/chat/PlanPanel.vue -->
<!-- Plan viewer dock panel: shows the latest ExitPlanMode plan with its review
     outcome (selected option + feedback), the full plan body, or the plan file
     path when only that is available. Mirrors the upstream plan viewer surface,
     rendered in our design system (Markdown + ui/Button + tokens). -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppPlanEntry } from '../../api/types';
import type { FilePreviewRequest } from '../../types';
import Markdown from './Markdown.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';

const props = defineProps<{
  /** Latest plan entry; undefined (or null) when the session has no plan yet. */
  plan?: AppPlanEntry | null;
  /** Plan mode active — only affects the empty-state hint text. */
  planMode?: boolean;
  openFile?: (target: FilePreviewRequest) => void;
}>();

const { t } = useI18n();

// Path-only plan (no body): the pill becomes a button that opens the file.
const pathOnly = computed(() => {
  const p = props.plan;
  if (!p) return undefined;
  return !p.plan && p.path ? p.path : undefined;
});

function openPlanFile(path: string): void {
  props.openFile?.({ path });
}
</script>

<template>
  <div class="pp">
    <template v-if="plan">
      <div v-if="plan.review?.selectedOption" class="pp-row">
        <span class="pp-label">{{ t('tools.plan.selectedOption') }}</span>
        <span class="pp-value">{{ plan.review.selectedOption }}</span>
      </div>
      <div v-if="plan.review?.feedback" class="pp-row">
        <span class="pp-label">{{ t('tools.plan.feedback') }}</span>
        <span class="pp-value pp-feedback">{{ plan.review.feedback }}</span>
      </div>
      <Markdown v-if="plan.plan" class="pp-body" :text="plan.plan" :open-file="openFile" />
      <div v-else-if="pathOnly" class="pp-pathonly">
        <span class="pp-path-hint">{{ t('tools.plan.pathOnlyHint') }}</span>
        <Button variant="ghost" size="sm" class="pp-path" @click="openPlanFile(pathOnly)">
          {{ pathOnly }}
        </Button>
      </div>
    </template>
    <div v-else class="pp-empty">
      <Icon name="file-edit" size="lg" />
      <span>{{ planMode ? t('status.planEmptyArmed') : t('status.planEmptyIdle') }}</span>
    </div>
  </div>
</template>

<style scoped>
.pp {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.pp-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-sm);
}
.pp-label {
  flex: none;
  color: var(--color-text-faint);
  font-weight: var(--weight-medium);
}
.pp-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--color-text);
}
.pp-feedback {
  color: var(--color-text-muted);
  font-style: italic;
}

.pp-body {
  min-width: 0;
}

.pp-pathonly {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
}
.pp-path-hint {
  color: var(--color-text-faint);
}
.pp-path {
  max-width: 100%;
}
.pp-path :deep(.ui-button__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.pp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) 0;
  color: var(--color-text-faint);
  font-size: var(--text-sm);
  text-align: center;
}
</style>