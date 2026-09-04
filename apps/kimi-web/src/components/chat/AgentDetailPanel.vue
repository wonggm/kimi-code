<!-- apps/kimi-web/src/components/chat/AgentDetailPanel.vue -->
<!-- A subagent's full detail in the right-side panel (App's shared slot — opening
     this replaces a thinking/compaction/file view and vice versa).
     Content layers, top to bottom:
       - identity strip: subagent type / model / effort + suspension reason;
       - live-progress strip: while the subagent is actively working the panel
         streams its `Calling …` tool lines and assistant output here (same
         projection state as before — no per-keystroke transcript recompute);
       - transcript section: the subagent's own turns fetched over REST
         (`GET /sessions/{id}/transcript?agent_id=…`) when the panel opens,
         rendered as distinct blocks — thinking blocks are collapsible
         (default expanded while working, collapsed once the subagent settles;
         click toggles via a component-local map keyed by block id, nothing
         persisted). When REST gives nothing (cold restart / failed read), the
         section falls back to the live-projected progress snapshot.

Mirrors the thinking panel: the content is reactive, so a still-running
subagent keeps streaming its progress here, and the live strip follows its own
bottom edge as long as the user hasn't scrolled past it into the transcript. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getKimiWebApi } from '../../api';
import type { AppTask, TranscriptItem } from '../../api/types';
import type { AgentMember, FilePreviewRequest, ToolMedia } from '../../types';
import { normalizeToolName, toolLabel, toolSummary } from '../../lib/toolMeta';
import Badge from '../ui/Badge.vue';
import Icon from '../ui/Icon.vue';
import Markdown from './Markdown.vue';
import PanelHeader from '../ui/PanelHeader.vue';
import Spinner from '../ui/Spinner.vue';

const props = withDefaults(
  defineProps<{
    member: AgentMember;
    /** Active session id — the transcript REST read is per-session. */
    sessionId?: string;
    /** Live session tasks: resolve the member's wire agent id (`task.agentId`,
     *  else the task id) for the transcript fetch. */
    tasks?: AppTask[];
    /** Show the PanelHeader close button. The right-panel drill usage passes
     *  `false` so the tab bar's back chevron / ✕ are the only controls. */
    closable?: boolean;
  }>(),
  { closable: true },
);

const emit = defineEmits<{
  close: [];
  /** Open a file referenced by a transcript tool frame (edit/write/read). */
  openFile: [target: FilePreviewRequest];
  /** Open a media frame (read_media) whose input carries a file-store id. */
  openMedia: [media: ToolMedia];
  /** Open a nested subagent spawned by an agent tool frame. */
  openAgent: [toolCallId: string];
}>();

const { t } = useI18n();

// ---------------------------------------------------------------------------
// Live strip (existing projection state — reused unchanged)
// ---------------------------------------------------------------------------

const progressLines = computed(() =>
  (props.member.outputLines ?? [])
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0),
);

// The subagent's concatenated live output (assistant deltas). Trim trailing
// whitespace for display; grows in real time as deltas stream in.
const liveText = computed(() => (props.member.text ?? '').trimEnd());

interface ProgressGroup {
  key: string;
  /** The "Calling …" tool-call line, or '' for output with no preceding call. */
  call: string;
  output: string[];
}

/** Group flat progress lines into tool-call groups: a "Calling …" line starts a
 *  group and subsequent non-call lines are its output. */
function groupProgress(lines: string[]): ProgressGroup[] {
  const groups: ProgressGroup[] = [];
  let current: ProgressGroup | null = null;
  let idx = 0;
  for (const line of lines) {
    if (line.startsWith('Calling ')) {
      current = { key: `g${idx++}`, call: line, output: [] };
      groups.push(current);
    } else if (current) {
      current.output.push(line);
    } else {
      current = { key: `g${idx++}`, call: '', output: [line] };
      groups.push(current);
    }
  }
  return groups;
}

const progressGroups = computed(() => groupProgress(progressLines.value));

function phaseLabel(phase: AgentMember['phase']): string {
  switch (phase) {
    case 'queued': return t('tools.swarm.phaseQueued');
    case 'working': return t('tools.swarm.phaseWorking');
    case 'suspended': return t('tools.swarm.phaseSuspended');
    case 'completed': return t('tools.swarm.phaseCompleted');
    case 'failed': return t('tools.swarm.phaseFailed');
  }
}

// Trim a `provider/alias` model alias down to its short name for display
// (e.g. `opencode-go/deepseek-v4-flash` → `deepseek-v4-flash`). Shows the whole
// alias when no provider prefix is present.
const displayModel = computed(() => {
  const model = props.member.model;
  if (typeof model !== 'string' || model.length === 0) return undefined;
  const lastSlash = model.lastIndexOf('/');
  return lastSlash >= 0 && lastSlash < model.length - 1 ? model.slice(lastSlash + 1) : model;
});

const isWorking = computed(() => props.member.phase === 'working');

// ---------------------------------------------------------------------------
// Transcript section (REST per-agent transcript, fetched on panel open)
// ---------------------------------------------------------------------------

// The wire agent id keying the server's transcript store. Same rule as the
// live-seed path: REST `/tasks` rows carry `agentId`, live-spawn / roster rows
// use the task id itself.
const wireAgentId = computed(() => {
  const task = (props.tasks ?? []).find(
    (tk) => tk.id === props.member.id || tk.agentId === props.member.id,
  );
  return props.member.agentId ?? task?.agentId ?? props.member.id;
});

const transcriptItems = ref<TranscriptItem[] | null>(null);
const transcriptLoading = ref(false);
const transcriptError = ref(false);

const hasTranscript = computed(() => (transcriptItems.value?.length ?? 0) > 0);

/** Extract a displayable note from a marker item's payload (`{ text }`). */
function markerText(item: { payload?: unknown }): string | undefined {
  const payload = item.payload;
  if (payload === null || typeof payload !== 'object') return undefined;
  const text = (payload as Record<string, unknown>)['text'];
  if (typeof text !== 'string' || text.trim().length === 0) return undefined;
  return text;
}

let fetchToken = 0;
async function fetchTranscript(): Promise<void> {
  const sid = props.sessionId;
  const agentId = wireAgentId.value;
  const token = ++fetchToken;
  // Keep the previous page mounted while refreshing — nulling it here blanked
  // the pane (and reset its scroll) on every subagent event.
  transcriptError.value = false;
  transcriptLoading.value = true;
  if (!sid) {
    transcriptLoading.value = false;
    return;
  }
  try {
    const page = await getKimiWebApi().getAgentTranscript(sid, agentId);
    if (token !== fetchToken) return;
    transcriptItems.value = page.items;
  } catch {
    if (token !== fetchToken) return;
    transcriptItems.value = null;
    transcriptError.value = true;
  } finally {
    if (token === fetchToken) transcriptLoading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Transcript view model — built from the static fetch result, so it never
// recomputes while the subagent streams (the live strip owns the moving parts).
// ---------------------------------------------------------------------------

interface ViewTool {
  toolCallId: string;
  name: string;
  /** Normalized tool kind (see toolMeta). */
  kind: string;
  label: string;
  summary: string;
  /** File path an edit/write/read frame references (click → openFile). */
  path?: string;
  /** Browser-loadable media a read_media frame references, when derivable. */
  media?: ToolMedia;
}

type ViewBlock =
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'text'; role: 'assistant' | 'user'; text: string }
  | { kind: 'tool'; tool: ViewTool }
  | { kind: 'notice'; text: string };

interface ViewTurn {
  id: string;
  state?: string;
  blocks: ViewBlock[];
}

const VIEW_TEXT = 'text';
const VIEW_THINKING = 'thinking';
const VIEW_TOOL = 'tool';
const VIEW_NOTICE = 'notice';

const viewTurns = computed<ViewTurn[]>(() =>
  (transcriptItems.value ?? []).map((item) => {
    if (item.kind !== 'turn') {
      // Marker items (compaction/undo checkpoints) ride the transcript stream
      // with no steps — surface the marker text as a notice instead of
      // crashing the render on the missing steps array.
      const text = markerText(item);
      const blocks: ViewBlock[] = text !== undefined ? [{ kind: VIEW_NOTICE, text }] : [];
      return { id: item.markerId, blocks };
    }
    const blocks: ViewBlock[] = [];
    if (item.prompt?.trim()) {
      blocks.push({ kind: VIEW_TEXT, role: 'user', text: item.prompt });
    }
    let thinkingIndex = 0;
    for (const step of item.steps) {
      for (const frame of step.frames) {
        switch (frame.kind) {
          case VIEW_THINKING:
            blocks.push({
              kind: VIEW_THINKING,
              // Stable across recomputes: the fetch result is static, so the
              // per-turn index is enough to key the collapse state.
              id: `${item.turnId}:${thinkingIndex++}`,
              text: frame.text,
            });
            break;
          case VIEW_TEXT:
            if (frame.text.trim().length > 0) {
              blocks.push({ kind: VIEW_TEXT, role: frame.role, text: frame.text });
            }
            break;
          case VIEW_TOOL:
            blocks.push({ kind: VIEW_TOOL, tool: toViewTool(frame) });
            break;
          case VIEW_NOTICE:
            if (frame.text?.trim()) blocks.push({ kind: VIEW_NOTICE, text: frame.text });
            break;
        }
      }
    }
    return { id: item.turnId, state: item.state, blocks };
  }),
);

const READ_MEDIA_RE = /^read[_-]?media(?:file)?$/i;
const FILE_STORE_ID_RE =
  /^f_(?:[0-9A-Za-z]{26}|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})$/;
const FILE_STORE_ID_AT_START_RE =
  /^f_(?:[0-9A-Za-z]{26}|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})(?=-)/;

/** Pull a `path` value out of a tool frame's input (JSON `path` field, else a
 *  `"path": "…"` literal). */
function framePath(arg: string): string | undefined {
  const s = arg.trim();
  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (parsed !== null && typeof parsed === 'object') {
        const candidate = (parsed as Record<string, unknown>)['path'];
        if (typeof candidate === 'string' && candidate.length > 0) return candidate;
      }
    } catch {
      // Fall through to the regex pass.
    }
  }
  const m = /"path"\s*:\s*"([^"]+)"/.exec(arg);
  return m?.[1];
}

/** Derive a browser-loadable media reference from a read_media frame: only when
 *  the input path carries a file-store id (`f_…`, served via getFileUrl) or is
 *  an absolute http(s) URL. Server-local paths have no URL and stay inert. */
function frameMedia(name: string, arg: string): ToolMedia | undefined {
  if (!READ_MEDIA_RE.test(name)) return undefined;
  const path = framePath(arg);
  if (!path) return undefined;
  const base = path.split(/[\\/]/).at(-1) ?? '';
  const id = FILE_STORE_ID_AT_START_RE.exec(base)?.[0];
  if (id !== undefined && FILE_STORE_ID_RE.test(id)) {
    return {
      kind: mediaKindFromPath(path),
      url: getKimiWebApi().getFileUrl(id),
      fileId: id,
      path,
    };
  }
  if (/^https?:\/\//i.test(path)) {
    return { kind: mediaKindFromPath(path), url: path, path };
  }
  return undefined;
}

function mediaKindFromPath(path: string): 'image' | 'video' | 'audio' {
  const ext = path.split(/[\\/]/).at(-1)?.split('.').at(-1)?.toLowerCase() ?? '';
  if (ext === 'mp4' || ext === 'webm' || ext === 'mov' || ext === 'mkv') return 'video';
  if (ext === 'mp3' || ext === 'wav' || ext === 'ogg' || ext === 'flac') return 'audio';
  return 'image';
}

function toViewTool(frame: {
  toolCallId?: string;
  name: string;
  input?: unknown;
  inputText?: string;
}): ViewTool {
  const name = frame.name;
  const kind = normalizeToolName(name);
  const arg = frame.inputText ?? (frame.input !== undefined ? JSON.stringify(frame.input) : '');
  const tool: ViewTool = {
    toolCallId: frame.toolCallId ?? '',
    name,
    kind,
    label: toolLabel(name),
    summary: arg.trim().length > 0 ? toolSummary(name, arg) : '',
  };
  if (kind === 'edit' || kind === 'write' || kind === 'read') {
    const path = framePath(arg);
    if (path) tool.path = path;
  }
  const media = frameMedia(name, arg);
  if (media) tool.media = media;
  return tool;
}

/** The interaction a clickable transcript tool frame triggers, if any. */
function frameAction(tool: ViewTool): (() => void) | undefined {
  if (tool.kind === 'task' && tool.toolCallId) {
    return () => emit('openAgent', tool.toolCallId);
  }
  if (tool.media) {
    return () => emit('openMedia', tool.media!);
  }
  if (tool.path) {
    return () => emit('openFile', { path: tool.path! });
  }
  return undefined;
}

function turnStateLabel(state: string | undefined): string | undefined {
  switch (state) {
    case 'failed': return t('tools.swarm.phaseFailed');
    case 'running': return t('tools.swarm.phaseWorking');
    case 'suspended': return t('tools.swarm.phaseSuspended');
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// Thinking-block collapse. Default: expanded while the subagent is actively
// working (so live thinking stays visible), collapsed once it settles. The
// local map holds the user's per-block override (keyed by stable block id);
// nothing persists, and switching to another subagent clears it.
// ---------------------------------------------------------------------------

const thinkingOverride = ref<Map<string, boolean>>(new Map());

function isThinkingExpanded(id: string): boolean {
  const override = thinkingOverride.value.get(id);
  return override !== undefined ? override : isWorking.value;
}

function toggleThinking(id: string): void {
  const next = new Map(thinkingOverride.value);
  next.set(id, !isThinkingExpanded(id));
  thinkingOverride.value = next;
}

/** Collapsed thinking's teaser: the last non-empty paragraph. */
function thinkTeaser(text: string): string {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return paragraphs.at(-1) ?? text.trim();
}

// ---------------------------------------------------------------------------
// Scroll behavior
// ---------------------------------------------------------------------------

const bodyEl = ref<HTMLElement | null>(null);

// Follow the live strip's bottom edge as the tool progress / live text grows —
// but only while the user's view still ends at or above the strip's bottom
// (reading the transcript below never gets yanked back). Without a loaded
// transcript the strip ends at the body bottom, so this is the old
// "follow-the-bottom" behavior.
// Follow the live strip ONLY while the user is already pinned at the bottom
// (within 40px). Any manual scroll up releases the follow until they return.
const pinnedBottom = ref(true);
function onBodyScroll(): void {
  const b = bodyEl.value;
  if (!b) return;
  pinnedBottom.value = b.scrollTop + b.clientHeight >= b.scrollHeight - 40;
}

watch(
  () => progressLines.value.length + liveText.value.length,
  () => {
    void nextTick(() => {
      const body = bodyEl.value;
      if (!body || !pinnedBottom.value) return;
      body.scrollTop = body.scrollHeight;
    });
  },
  { immediate: true },
);

// Fresh transcript lands at the top of the scroller (a new panel starts at the
// subagent's first turn, or the live strip while running).
watch(transcriptItems, (next, prev) => {
  if (!next || next.length === 0) return;
  if (prev !== null) return;
  void nextTick(() => {
    if (bodyEl.value) bodyEl.value.scrollTop = 0;
  });
});

// Panel switches to another subagent (or the session changes) without
// unmounting: reset the transcript + collapse state and fetch the new agent.
watch(
  () => `${props.member.id}|${props.sessionId ?? ''}`,
  (next, prev) => {
    if (next === prev) return;
    thinkingOverride.value = new Map();
    void fetchTranscript();
  },
  { immediate: true },
);
</script>

<template>
  <div class="ap">
    <PanelHeader
      :title="t('common.preview')"
      :subtitle="member.name"
      :closable="closable"
      :close-label="t('thinking.close')"
      @close="emit('close')"
    >
      <Badge variant="neutral" size="sm" class="ap-phase">{{ phaseLabel(member.phase) }}</Badge>
    </PanelHeader>
    <div ref="bodyEl" class="ap-body" @scroll.passive="onBodyScroll">
      <!-- Identity strip: subagent type / model / effort + suspension reason -->
      <div v-if="member.subagentType || member.suspendedReason" class="ap-id">
        <div v-if="member.subagentType" class="ap-type">{{ member.subagentType }}<span v-if="displayModel"> ({{ displayModel }}<span v-if="member.thinkingEffort">, {{ member.thinkingEffort }}</span>)</span><span v-else-if="member.thinkingEffort"> ({{ member.thinkingEffort }})</span></div>
        <div v-if="member.suspendedReason" class="ap-reason">{{ member.suspendedReason }}</div>
      </div>

      <!-- Live progress strip: only while actively working, or as the frozen
           fallback snapshot when the REST transcript gave nothing. -->
      <div
        v-if="isWorking || !hasTranscript"
        class="ap-live-strip"
      >
        <div v-if="member.prompt" class="ap-field">
          <span class="ap-field-label">Task</span>
          <div class="ap-field-body">{{ member.prompt }}</div>
        </div>
        <div v-if="liveText" class="ap-field">
          <span class="ap-field-label">Output</span>
          <div class="ap-field-body ap-live">
            <Markdown :text="liveText" :streaming="isWorking" :open-file="(target) => emit('openFile', target)" />
          </div>
        </div>
        <div v-if="progressGroups.length > 0" class="ap-field">
          <span class="ap-field-label">Progress</span>
          <div class="ap-field-body ap-progress">
            <div v-for="group in progressGroups" :key="group.key" class="ap-group">
              <div v-if="group.call" class="ap-call">
                <Icon name="chevron-right" size="sm" class="ap-glyph" />
                {{ group.call }}
              </div>
              <div v-if="group.output.length > 0" class="ap-output">
                <div v-for="(line, li) in group.output" :key="li" class="ap-out-line">{{ line }}</div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="member.summary" class="ap-field">
          <span class="ap-field-label">Result</span>
          <div class="ap-field-body">
            <Markdown :text="member.summary" :open-file="(target) => emit('openFile', target)" />
          </div>
        </div>
      </div>

      <!-- Transcript: the subagent's own turns, thinking blocks collapsible -->
      <div class="ap-transcript">
        <div v-if="transcriptLoading" class="ap-transcript-note">
          <Spinner size="sm" />
        </div>
        <div v-else-if="transcriptError" class="ap-transcript-note ap-transcript-error">
          {{ t('tasks.transcriptLoadError') }}
        </div>
        <template v-else-if="hasTranscript">
          <div v-for="turn in viewTurns" :key="turn.id" class="ap-turn">
            <div v-if="turnStateLabel(turn.state)" class="ap-turn-state">{{ turnStateLabel(turn.state) }}</div>
            <div
              v-for="(blk, bi) in turn.blocks"
              :key="`${turn.id}:${bi}`"
              class="ap-block"
            >
              <div v-if="blk.kind === 'thinking'" class="ap-think">
                <button
                  type="button"
                  class="ap-think-head"
                  :aria-expanded="isThinkingExpanded(blk.id)"
                  :aria-label="isThinkingExpanded(blk.id) ? t('tasks.collapse') : t('tasks.expand')"
                  @click="toggleThinking(blk.id)"
                >
                  <Icon :name="isThinkingExpanded(blk.id) ? 'chevron-down' : 'chevron-right'" size="sm" />
                  <span class="ap-think-title">{{ t('thinking.panelTitle') }}</span>
                </button>
                <div v-if="isThinkingExpanded(blk.id)" class="ap-think-body">{{ blk.text }}</div>
                <div v-else class="ap-think-teaser">{{ thinkTeaser(blk.text) }}</div>
              </div>
              <div v-else-if="blk.kind === 'text'" class="ap-text" :class="{ user: blk.role === 'user' }"><Markdown :text="blk.text" :open-file="(target) => emit('openFile', target)" /></div>
              <div
                v-else-if="blk.kind === 'tool'"
                class="ap-tool"
                :class="{ clickable: frameAction(blk.tool) !== undefined }"
                role="button"
                :tabindex="frameAction(blk.tool) !== undefined ? 0 : undefined"
                @click="frameAction(blk.tool)?.()"
                @keydown.enter="frameAction(blk.tool)?.()"
              >
                <span class="ap-tool-label">{{ blk.tool.label }}</span>
                <span v-if="blk.tool.summary" class="ap-tool-summary">{{ blk.tool.summary }}</span>
              </div>
              <div v-else class="ap-notice">{{ blk.text }}</div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ap {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--color-bg);
}
.ap-phase { flex: none; }

.ap-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  font: var(--text-base)/var(--leading-normal) var(--font-ui);
  color: var(--color-text-muted);
}
.ap-id {
  margin-bottom: 8px;
}
.ap-type {
  font: var(--text-xs) var(--font-mono);
  color: var(--color-text-muted);
  margin-bottom: 8px;
}
.ap-reason {
  color: var(--color-warning);
  margin-bottom: 8px;
}
.ap-live-strip + .ap-transcript {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--color-line);
}
.ap-field + .ap-field {
  margin-top: 12px;
}
.ap-field-label {
  display: block;
  color: var(--color-text-muted);
  font: var(--text-xs) var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.ap-field-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ap-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font: var(--text-base)/var(--leading-relaxed) var(--font-mono);
  color: var(--color-text);
  min-width: 0;
}
.ap-live {
  font: var(--text-base)/var(--leading-relaxed) var(--font-mono);
  color: var(--color-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ap-group {
  min-width: 0;
}
.ap-call {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  font-weight: var(--weight-medium);
  color: var(--color-text);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.ap-glyph {
  flex: none;
  color: var(--color-accent);
}
.ap-output {
  margin: 2px 0 0 16px;
  padding-left: 8px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  border-left: 2px solid var(--color-line);
  min-width: 0;
}
.ap-out-line {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

/* ---- Transcript section ---- */
.ap-transcript {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.ap-transcript-note {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-faint);
  font: var(--text-sm) var(--font-ui);
  padding: 8px 0;
}
.ap-transcript-error {
  color: var(--color-danger);
}
.ap-turn {
  min-width: 0;
}
.ap-turn + .ap-turn {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--color-line);
}
.ap-turn-state {
  color: var(--color-danger);
  font: var(--text-xs) var(--font-mono);
  margin-bottom: 6px;
}
.ap-block {
  min-width: 0;
}
.ap-block + .ap-block {
  margin-top: 8px;
}

/* Collapsible thinking block */
.ap-think {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  overflow: hidden;
}
.ap-think-head {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 5px 8px;
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--color-text-muted);
  font: var(--text-xs) var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: left;
}
.ap-think-head:hover {
  color: var(--color-text);
  background: var(--color-hover);
}
.ap-think-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ap-think-body {
  padding: 0 10px 8px;
  color: var(--color-text-muted);
  font: var(--text-sm)/var(--leading-relaxed) var(--font-ui);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 240px;
  overflow-y: auto;
}
.ap-think-teaser {
  padding: 0 10px 8px 26px;
  color: var(--color-text-faint);
  font: var(--text-sm)/var(--leading-relaxed) var(--font-ui);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Text / notice blocks */
.ap-text {
  color: var(--color-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ap-text.user {
  color: var(--color-text-muted);
  font: var(--text-sm)/var(--leading-normal) var(--font-mono);
}
.ap-notice {
  color: var(--color-text-faint);
  font: var(--text-sm) var(--font-mono);
}

/* Tool frame */
.ap-tool {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font: var(--text-sm)/var(--leading-normal) var(--font-mono);
}
.ap-tool.clickable {
  cursor: pointer;
}
.ap-tool.clickable:hover,
.ap-tool.clickable:focus-visible {
  border-color: var(--color-accent);
  color: var(--color-text);
  outline: none;
}
.ap-tool-label {
  flex: none;
  color: var(--color-accent);
  font-weight: var(--weight-medium);
}
.ap-tool-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>