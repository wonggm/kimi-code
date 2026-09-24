<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import type { DetachTaskTarget } from '../../../lib/detachTarget';
import { toolGlyph, toolLabel, toolSummary } from '../../../lib/toolMeta';
import ToolRow from '../ToolRow.vue';
import Icon from '../../ui/Icon.vue';
import IconButton from '../../ui/IconButton.vue';
import ToolOutputBlock from './ToolOutputBlock.vue';
import ToolPanel from './ToolPanel.vue';

const props = withDefaults(
  defineProps<{
    tool: ToolCall;
    mobile?: boolean;
    toolDiffPanel?: boolean;
  }>(),
  { mobile: false, toolDiffPanel: false },
);

const emit = defineEmits<{
  openMedia: [media: ToolMedia];
  openFile: [target: FilePreviewRequest];
  openToolDiff: [id: string];
  detachTask: [target: DetachTaskTarget];
}>();

const { t } = useI18n();

interface BashInput {
  command: string;
  cwd: string;
  runInBackground: boolean;
}

function parseInput(arg: string): BashInput {
  try {
    const value = JSON.parse(arg) as Record<string, unknown>;
    const command = value['command'] ?? value['cmd'] ?? value['script'];
    const cwd = value['cwd'] ?? value['workdir'] ?? value['directory'];
    return {
      command: typeof command === 'string' ? command.trim() : arg.replace(/^·\s*/, '').trim(),
      cwd: typeof cwd === 'string' ? cwd : '',
      runInBackground: value['run_in_background'] === true,
    };
  } catch {
    return {
      command: arg.replace(/^·\s*/, '').trim(),
      cwd: '',
      runInBackground: false,
    };
  }
}

const input = computed(() => parseInput(props.tool.arg));
const command = computed(() => input.value.command);
const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status);
const label = computed(() => toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));
const summary = computed(() => toolSummary(props.tool.name, props.tool.arg));
const isRunning = computed(() => props.tool.status === 'running');
const hasOutput = computed(() => (props.tool.output?.length ?? 0) > 0);
const canDetach = computed(() => isRunning.value && !input.value.runInBackground);
const canExpand = computed(() => hasOutput.value || isRunning.value || command.value.length > 0);

const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const persisted = props.tool.id ? toolExpandState?.get(props.tool.id) : undefined;
const open = ref(persisted ?? (props.tool.defaultExpanded === true && canExpand.value));
const commandWrap = ref(false);
const outputWrap = ref(false);

function toggle(): void {
  if (!canExpand.value) return;
  open.value = !open.value;
  if (props.tool.id && toolExpandState) toolExpandState.set(props.tool.id, open.value);
}

watch(
  () => [props.tool.defaultExpanded, props.tool.output?.length, props.tool.status] as const,
  () => {
    if (props.tool.defaultExpanded === true && canExpand.value) open.value = true;
  },
);
</script>

<template>
  <ToolRow
    :status="status"
    :icon="glyph"
    :name="label"
    :arg="!open ? summary : ''"
    :time="tool.timing"
    :open="open"
    :expandable="canExpand"
    @toggle="toggle"
  >
    <template #trailing>
      <button
        v-if="canDetach"
        type="button"
        class="bt-detach"
        @click.stop="emit('detachTask', { toolCallId: tool.id, command })"
      >
        <Icon name="external-link" size="sm" aria-hidden="true" />
        <span>{{ t('tasks.sendToBackground') }}</span>
      </button>
    </template>
    <div class="bash-boxes">
      <ToolPanel v-if="command" :title="tool.name.trim() || 'Bash'" :meta="input.cwd">
        <template #actions>
          <IconButton
            size="sm"
            :pressed="commandWrap"
            :label="commandWrap ? t('conversation.codeBlock.unwrapCode') : t('conversation.codeBlock.wrapCode')"
            @click="commandWrap = !commandWrap"
          >
            <Icon :name="commandWrap ? 'text-wrap-disabled' : 'text-wrap'" size="md" />
          </IconButton>
        </template>
        <div class="bash-cmd" :class="{ wrap: commandWrap }">
          <pre><code>{{ command }}</code></pre>
        </div>
      </ToolPanel>
      <ToolPanel :title="t('tasks.fieldOutput')">
        <template #actions>
          <IconButton
            v-if="hasOutput"
            size="sm"
            :pressed="outputWrap"
            :label="outputWrap ? t('conversation.codeBlock.unwrapCode') : t('conversation.codeBlock.wrapCode')"
            @click="outputWrap = !outputWrap"
          >
            <Icon :name="outputWrap ? 'text-wrap-disabled' : 'text-wrap'" size="md" />
          </IconButton>
        </template>
        <ToolOutputBlock
          :lines="tool.output"
          :wrap="outputWrap"
          :empty-text="isRunning ? t('tools.output.waiting') : t('tools.output.empty')"
        />
      </ToolPanel>
    </div>
  </ToolRow>
</template>

<style scoped>
.bash-boxes {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--space-2);
}
.bash-cmd {
  max-height: calc(8 * 1lh + var(--space-2));
  overflow: auto;
  overscroll-behavior: contain;
  font-family: var(--font-mono);
  font-size: var(--content-font-size);
  line-height: 1.571;
  font-variant-ligatures: none;
}
.bash-cmd pre {
  margin: 0;
  font: inherit;
}
.bash-cmd.wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.bash-cmd:not(.wrap) {
  white-space: pre;
}
.bt-detach {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xs);
  background: none;
  color: var(--color-text-muted);
  font: var(--text-xs) var(--font-ui);
  padding: 1px var(--space-2);
  cursor: pointer;
}
.bt-detach:hover {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}
.bt-detach:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
</style>
