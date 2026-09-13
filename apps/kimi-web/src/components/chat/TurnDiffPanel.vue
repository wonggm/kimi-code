<!-- apps/kimi-web/src/components/chat/TurnDiffPanel.vue -->
<!-- Turn-diff tab: one file the latest turn wrote, rendered line by line. The
     header carries the path, the wrap toggle and the open-file control, as
     upstream's own TurnDiffPanel does. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { DiffViewLine } from '../../types';
import { panelDiffFullPath, panelDiffPathLabel } from '../../lib/rightPanelTabs';
import Button from '../ui/Button.vue';
import DiffLines from './DiffLines.vue';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';
import PanelHeader from '../ui/PanelHeader.vue';
import Spinner from '../ui/Spinner.vue';

const props = defineProps<{
  /** The path the turn wrote, as the tool call recorded it. */
  path: string;
  /** The session's working directory, used to complete a relative path. */
  cwd?: string;
  /** Parsed diff lines, or null when the turn has none to show. */
  lines?: DiffViewLine[] | null;
  /** True while the turn's changes are still being assembled. */
  loading?: boolean;
}>();

const emit = defineEmits<{
  openFile: [path: string];
}>();

const { t } = useI18n();

const hasLines = computed(() => (props.lines?.length ?? 0) > 0);
const wrap = ref(false);
</script>

<template>
  <div class="td panel-file-head">
    <PanelHeader
      :title="panelDiffPathLabel(path, cwd)"
      :title-tooltip="panelDiffFullPath(path, cwd)"
      :closable="false"
    >
      <div class="panel-file-head-actions">
        <IconButton
          v-if="hasLines"
          size="sm"
          :label="wrap ? t('conversation.codeBlock.unwrapCode') : t('conversation.codeBlock.wrapCode')"
          :aria-pressed="wrap"
          @click="wrap = !wrap"
        >
          <Icon :name="wrap ? 'text-wrap-disabled' : 'text-wrap'" size="md" />
        </IconButton>
        <IconButton
          size="sm"
          :label="t('conversation.turnFiles.openFile')"
          @click="emit('openFile', panelDiffFullPath(path, cwd))"
        >
          <Icon name="external-link" size="md" />
        </IconButton>
      </div>
    </PanelHeader>

    <div class="td-body" data-quote-display-lines>
      <DiffLines v-if="hasLines" :lines="lines ?? []" :wrap="wrap" />
      <div v-else-if="loading" class="td-empty">
        <Spinner size="sm" />
        <p>{{ t('conversation.turnFiles.rebuilding') }}</p>
      </div>
      <div v-else class="td-empty">
        <p>{{ t('conversation.turnFiles.diffUnavailable') }}</p>
        <Button variant="ghost" size="sm" @click="emit('openFile', panelDiffFullPath(path, cwd))">
          {{ t('conversation.turnFiles.openFile') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.td {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.td-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-bottom: var(--pfc-host-h, 0px);
}
.td-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  height: 100%;
  padding: var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.panel-file-head-actions {
  margin-left: auto;
  min-width: 0;
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
/* The header titles itself with the file path: upstream renders the same class
   in its plain UI font, clipped from the left so the tail stays readable. */
.td.panel-file-head :deep(.ui-panel-header__title) {
  font: 400 var(--text-xs) var(--font-ui);
  direction: rtl;
  text-align: left;
}
</style>
