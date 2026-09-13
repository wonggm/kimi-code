<!-- apps/kimi-web/src/components/chat/GoalPanel.vue -->
<!-- The goal dock panel's body, ported from upstream's `.goal-panel`: the
     objective, then a `Done when` label over the completion criterion. Both are
     markdown, so they render through the same renderer the transcript uses. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { AppGoal } from '../../api/types';
import type { FilePreviewRequest } from '../../types';
import Markdown from './Markdown.vue';
import Icon from '../ui/Icon.vue';

defineProps<{
  goal: AppGoal;
  openFile?: (target: FilePreviewRequest) => void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="goal-panel">
    <Markdown :text="goal.objective" :open-file="openFile" />
    <div v-if="goal.completionCriterion" class="goal-criterion">
      <span class="goal-criterion-label">
        <Icon name="check-list" size="sm" />
        {{ t('status.goalDoneWhen') }}
      </span>
      <Markdown :text="goal.completionCriterion" :open-file="openFile" />
    </div>
  </div>
</template>

<style scoped>
.goal-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  overflow-wrap: anywhere;
}
.goal-criterion {
  padding-top: var(--space-2);
  border-top: 0.5px solid var(--color-line);
}
.goal-criterion-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: var(--weight-section-label);
  line-height: var(--leading-normal);
  margin-bottom: var(--space-1);
}
</style>
