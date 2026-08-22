<!-- apps/kimi-web/src/components/chat/ComposerAddMenu.vue -->
<!-- Content of the composer "+" menu (Files / Goal / Plan / Swarm). Rendered
     inside the composer's anchored add-menu panel on desktop and inside the
     mobile bottom sheet; the rows and their actions are identical in both,
     so the content lives here once and the composer picks the wrapper. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Icon from '../ui/Icon.vue';
import Button from '../ui/Button.vue';

withDefaults(
  defineProps<{
    /** Files row shows only when the composer accepts uploads. */
    hasUpload: boolean;
    goalActive: boolean;
    goalMode: boolean;
    goalCanPause: boolean;
    goalCanResume: boolean;
    planOn: boolean;
    planArmedOn: boolean;
    swarmOn: boolean;
  }>(),
  {
    hasUpload: false,
    goalActive: false,
    goalMode: false,
    goalCanPause: false,
    goalCanResume: false,
    planOn: false,
    planArmedOn: false,
    swarmOn: false,
  },
);

const emit = defineEmits<{
  files: [];
  /** Goal row main button: arm for the next send, or focus when already active. */
  goalMain: [];
  /** Plan row main button: arm for the next send, or turn an active plan off. */
  plan: [];
  swarm: [];
  pause: [];
  resume: [];
  cancel: [];
}>();

const { t } = useI18n();
</script>

<template>
  <!-- Files — opens the attachment picker -->
  <button
    v-if="hasUpload"
    type="button"
    class="am-row"
    role="menuitem"
    @mousedown.prevent
    @click="emit('files')"
  >
    <span class="am-row-icon"><Icon name="attachment" size="sm" /></span>
    <span class="am-row-info">
      <span class="am-row-name">{{ t('composer.addFiles') }}</span>
    </span>
  </button>

  <!-- Goal — arm for the next send; live controls when active -->
  <div class="am-row am-row-goal" :class="{ on: goalActive || goalMode }">
    <button
      type="button"
      class="am-row-main"
      role="menuitem"
      @click="emit('goalMain')"
    >
      <span class="am-row-icon"><Icon name="target" size="sm" /></span>
      <span class="am-row-info">
        <span class="am-row-name">{{ t('status.goalLabel') }}</span>
        <span class="am-row-desc">{{ t('composer.addGoalDesc') }}</span>
      </span>
      <span v-if="!goalActive" class="am-switch" :class="{ on: goalMode }"><span class="am-knob" /></span>
    </button>
    <div v-if="goalActive" class="am-row-actions">
      <Button
        v-if="goalCanPause"
        size="sm"
        variant="secondary"
        class="am-row-action"
        @click="emit('pause')"
      >
        <Icon name="pause" size="sm" />
        <span>{{ t('status.goalPause') }}</span>
      </Button>
      <Button
        v-if="goalCanResume"
        size="sm"
        variant="primary"
        class="am-row-action"
        @click="emit('resume')"
      >
        <Icon name="play" size="sm" />
        <span>{{ t('status.goalResume') }}</span>
      </Button>
      <Button
        size="sm"
        variant="danger-soft"
        class="am-row-action"
        @click="emit('cancel')"
      >
        <Icon name="close" size="sm" />
        <span>{{ t('status.goalCancel') }}</span>
      </Button>
    </div>
  </div>

  <!-- Plan — arm for the next send (deferred); toggles an active plan off -->
  <button
    type="button"
    class="am-row"
    :class="{ on: planOn || planArmedOn }"
    role="menuitem"
    @mousedown.prevent
    @click="emit('plan')"
  >
    <span class="am-row-icon"><Icon name="file-edit" size="sm" /></span>
    <span class="am-row-info">
      <span class="am-row-name">{{ t('status.planLabel') }}</span>
      <span class="am-row-desc">{{ t('composer.addPlanDesc') }}</span>
    </span>
    <span class="am-switch" :class="{ on: planOn || planArmedOn }"><span class="am-knob" /></span>
  </button>

  <!-- Swarm — immediate client toggle -->
  <button
    type="button"
    class="am-row"
    :class="{ on: swarmOn }"
    role="menuitem"
    @mousedown.prevent
    @click="emit('swarm')"
  >
    <span class="am-row-icon"><Icon name="sparkles" size="sm" /></span>
    <span class="am-row-info">
      <span class="am-row-name">{{ t('status.swarmLabel') }}</span>
      <span class="am-row-desc">{{ t('composer.addSwarmDesc') }}</span>
    </span>
    <span class="am-switch" :class="{ on: swarmOn }"><span class="am-knob" /></span>
  </button>
</template>

<style scoped>
.am-row {
  display: grid;
  grid-template-columns: 14px max-content;
  column-gap: 7px;
  row-gap: 2px;
  align-items: start;
  width: 100%;
  padding: 6px 7px;
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: var(--font-ui);
  text-align: left;
}
.am-row:hover:not(:disabled) { background: var(--color-surface-sunken); }
.am-row:disabled { cursor: not-allowed; opacity: 0.45; }
.am-row-info {
  display: contents;
}
.am-row-icon {
  grid-column: 1;
  grid-row: 1;
  width: 14px;
  min-height: 1lh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: var(--ui-font-size);
  line-height: var(--leading-normal);
}
.am-row-name {
  grid-column: 2;
  grid-row: 1;
  font-size: var(--ui-font-size);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  line-height: var(--leading-normal);
}
.am-row-desc {
  grid-column: 2;
  grid-row: 2;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--muted);
  line-height: var(--leading-normal);
}
.am-row.on {
  background: var(--color-accent-soft);
}
.am-row.on .am-row-name { color: var(--color-accent-hover); }
.am-row.on .am-row-icon { color: var(--color-accent-hover); }
.am-switch {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  width: 34px;
  height: 19px;
  border-radius: var(--radius-full);
  background: var(--panel2);
  border: 1px solid var(--line);
  position: relative;
  transition: background 0.15s;
}
.am-switch.on { background: var(--color-accent); border-color: var(--color-accent); }
.am-knob {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 15px;
  height: 15px;
  border-radius: var(--radius-full);
  background: var(--bg);
  box-shadow: var(--shadow-xs);
  transition: transform 0.15s;
}
.am-switch.on .am-knob { transform: translateX(15px); }

.am-row-goal {
  --am-row-icon-col: 14px;
  --am-row-col-gap: 7px;
  --am-row-pad-x: 7px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  cursor: default;
  padding: 0;
  gap: 0;
}
.am-row-goal:hover { background: transparent; }
.am-row-goal.on {
  background: var(--color-accent-soft);
}
.am-row-main {
  display: grid;
  grid-template-columns: var(--am-row-icon-col) max-content;
  column-gap: var(--am-row-col-gap);
  row-gap: 2px;
  align-items: start;
  width: 100%;
  padding: 6px var(--am-row-pad-x);
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: var(--font-ui);
  text-align: left;
}
.am-row-main:hover { background: var(--color-surface-sunken); }
.am-row-goal.on .am-row-main .am-row-name { color: var(--color-accent-hover); }
.am-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: flex-start;
  padding: 0 var(--am-row-pad-x) var(--am-row-pad-x)
    calc(var(--am-row-pad-x) + var(--am-row-icon-col) + var(--am-row-col-gap));
}
.am-row-action {
  flex: none;
}
.am-row-action :deep(.ui-button__content) { gap: var(--space-1); }

/* Mobile: the "+" menu opens as a bottom sheet — give the rows a comfortable
   tap height (44px) so touch users hit them reliably. */
@media (max-width: 640px) {
  .am-row,
  .am-row-main {
    min-height: 44px;
  }
}
</style>