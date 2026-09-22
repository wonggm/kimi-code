<!-- apps/kimi-web/src/components/chat/tool-calls/BrowserTool.vue -->
<!-- The in-app browser's tool call. Upstream draws it as a normal tool line
     whose glyph is the browser mark, whose head is the action's label plus its
     detail, and whose body carries the detail again over the raw action and the
     tool's output. -->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import { iconSvg } from '../../../lib/icons';
import { browserToolInput, browserToolView } from '../../../lib/browserTool';
import { useRightPanel } from '../../../composables/useRightPanel';
import ToolRow from '../ToolRow.vue';
import ToolOutputBlock from './ToolOutputBlock.vue';
import ToolPanel from './ToolPanel.vue';
import MediaTool from './MediaTool.vue';

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
}>();

const { t } = useI18n();
const { openBrowser } = useRightPanel();

const GLYPH = iconSvg('browser', 'sm');

const view = computed(() => browserToolView(props.tool));
const media = computed(() => (props.tool.status === 'ok' ? props.tool.media : undefined));

const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
const open = ref(persisted ?? props.tool.defaultExpanded === true);

// The panel tab the call belongs to. Upstream's tab payload is keyed by
// `browserId`, which the desktop host resolves from the tab the action ran in;
// a call names its `tabId`, so that is the key here, and a call that names no
// tab gets a key of its own rather than sharing one with every other tab.
function showBrowserPanel(): void {
  const input = browserToolInput(props.tool.arg);
  const tabId = typeof input?.['tabId'] === 'string' && input['tabId'].length > 0 ? input['tabId'] : props.tool.id;
  openBrowser(tabId);
}

function toggle(): void {
  open.value = !open.value;
  if (expandKey && toolExpandState) toolExpandState.set(expandKey, open.value);
}

watch(
  () => props.tool.defaultExpanded,
  (expanded) => {
    if (expanded === true) open.value = true;
  },
);
</script>

<template>
  <ToolRow
    :status="view.status"
    :icon="GLYPH"
    :name="view.label"
    :arg="view.detail"
    :time="tool.timing"
    :open="open"
    :expandable="true"
    @toggle="toggle"
  >
    <template #trailing>
      <button type="button" class="bt-open" @click.stop="showBrowserPanel">
        {{ t('browser.openPanel') }}
      </button>
    </template>
    <ToolPanel scroll>
      <div class="browser-tool-details">
        <div v-if="view.detail" class="browser-tool-detail">{{ view.detail }}</div>
        <MediaTool v-if="media" :tool="tool" :mobile="mobile" @open-media="emit('openMedia', $event)" />
        <ToolOutputBlock :lines="[tool.arg]" />
        <ToolOutputBlock
          :lines="tool.output"
          :empty-text="view.status === 'running' ? t('tools.output.waiting') : t('tools.output.empty')"
        />
      </div>
    </ToolPanel>
  </ToolRow>
</template>

<style scoped>
.browser-tool-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.browser-tool-detail {
  color: var(--color-text-muted);
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
}
.bt-open {
  flex: none;
  background: none;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--color-text-muted);
  font: var(--text-xs) var(--font-ui);
  padding: 0;
  cursor: pointer;
}
.bt-open:hover {
  color: var(--color-text);
}
.bt-open:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
</style>
