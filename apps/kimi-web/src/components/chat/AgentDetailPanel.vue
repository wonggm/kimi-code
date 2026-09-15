<!-- apps/kimi-web/src/components/chat/AgentDetailPanel.vue -->
<!-- A subagent's detail in the right panel. Element structure and the
     prompt-bubble clamp follow upstream's own AgentDetailPanel:
       - prompt bubble: the task text, collapsed to a few lines until expanded;
       - body: the subagent's transcript (the fork reads it over REST —
         `GET /sessions/{id}/transcript?agent_id=…`) rendered with the main
         conversation's own turn/run primitives, or, when there is none yet,
         upstream's fallback block: the suspended reason / output / summary
         lines plus the "waiting for output" rows.
     Upstream feeds a ChatPane from panel-held turns; the fork's engine has no
     turn store for a subagent, so the REST transcript is mapped onto the same
     ChatTurn model ChatPane renders and put through ChatPane's block pipeline
     (assistantRenderBlocks → foldRenderBlocks → ThinkingBlock / Markdown /
     ToolCall / ActivityRun), which is what makes the two transcripts alike. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getKimiWebApi } from '../../api';
import type { AppTask, TranscriptFrame, TranscriptItem } from '../../api/types';
import type { AgentMember, ChatTurn, FilePreviewRequest, ToolCall, ToolMedia, TurnBlock } from '../../types';
import Icon from '../ui/Icon.vue';
import Markdown from './Markdown.vue';
import MoonSpinner from '../ui/MoonSpinner.vue';
import Spinner from '../ui/Spinner.vue';
import ActivityRun from './ActivityRun.vue';
import ToolCallCard from './ToolCall.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import {
  assistantRenderBlocks,
  firstRunTool,
  renderBlockKey,
  toolFoldBlockKey,
  type RunItem,
} from '../chatTurnRendering';
import { foldRenderBlocks, TOOL_FOLD_KEY_PREFIX, type FoldedRenderBlock } from '../../lib/toolFold';
import { activityRunFolding } from '../../lib/conversationPrefs';

const props = defineProps<{
  member: AgentMember;
  /** Active session id — the transcript REST read is per-session. */
  sessionId?: string;
  /** Live session tasks: resolve the member's wire agent id (`task.agentId`,
   *  else the task id) for the transcript fetch. */
  tasks?: AppTask[];
}>();

const emit = defineEmits<{
  /** Open a file referenced from the transcript — a tool card's path link, or
   *  a file link in the prompt / reply markdown. */
  openFile: [target: FilePreviewRequest];
  /** Open a media frame (read_media) whose input carries a file-store id. */
  openMedia: [media: ToolMedia];
  /** Open a subagent spawned by this transcript's own `Agent` tool call. */
  openAgent: [toolCallId: string];
}>();

const { t } = useI18n();

// ---------------------------------------------------------------------------
// Prompt bubble
// ---------------------------------------------------------------------------

const prompt = computed(() => {
  const text = props.member.prompt;
  return text !== undefined && text.trim() !== '' ? text : undefined;
});

// Upstream clamps the bubble to six lines and offers an expand/collapse toggle
// only when the text overflows that clamp.
const PROMPT_CLAMP_LINES = 6;
const promptTextEl = ref<HTMLElement | null>(null);
const promptOverflows = ref(false);
const promptExpanded = ref(false);

function measurePrompt(): void {
  const el = promptTextEl.value;
  if (!el) return;
  const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
  promptOverflows.value = el.scrollHeight > lineHeight * PROMPT_CLAMP_LINES + 1;
}

let promptObserver: ResizeObserver | null = null;
watch(promptTextEl, (el, previous) => {
  if (previous) promptObserver?.unobserve(previous);
  promptObserver ??= typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(() => measurePrompt());
  if (el) promptObserver?.observe(el);
  measurePrompt();
});
watch(prompt, () => {
  promptExpanded.value = false;
  void nextTick(measurePrompt);
});
onBeforeUnmount(() => promptObserver?.disconnect());

const promptClamped = computed(() => promptOverflows.value && !promptExpanded.value);

function togglePrompt(): void {
  promptExpanded.value = !promptExpanded.value;
}

// ---------------------------------------------------------------------------
// Fallback lines — upstream projects the member's suspension reason, live text,
// tool-progress lines and summary into one deduplicated line list.
// ---------------------------------------------------------------------------

const promptCommandLine = computed(() => {
  const text = props.member.prompt?.trim();
  return text ? `$ ${text}` : null;
});

const fallbackLines = computed(() => {
  const seen = new Set<string>();
  const joined: string[] = [];
  const sources = [
    props.member.suspendedReason,
    props.member.text,
    props.member.outputLines?.join('\n'),
    props.member.summary,
  ];
  for (const source of sources) {
    const text = source?.trim();
    if (!text || seen.has(text)) continue;
    if (promptCommandLine.value !== null && text === promptCommandLine.value) continue;
    seen.add(text);
    joined.push(text);
  }
  return joined.flatMap((text) => text.split('\n'));
});

const isWorking = computed(
  () =>
    props.member.status === 'running' &&
    props.member.phase !== 'queued' &&
    props.member.phase !== 'suspended',
);

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

// While no transcript exists the pane shows the fallback block: upstream gates
// it on the turn list being empty and the load having settled, which for the
// fork's REST read is the same "nothing yet" condition.
const showFallback = computed(
  () =>
    !hasTranscript.value &&
    (transcriptError.value || fallbackLines.value.length > 0 || transcriptLoading.value),
);

/** "Working…" once the run has produced something, "Requesting…" until then. */
const workingLabel = computed(() =>
  hasTranscript.value || fallbackLines.value.length > 0
    ? t('conversation.working')
    : t('conversation.requesting'),
);

// ---------------------------------------------------------------------------
// Transcript → ChatTurn mapping. The pane renders the subagent's turns with the
// same model and block pipeline the main conversation uses, so the two
// transcripts read alike (see ChatPane's assistant row for the template shape).
// ---------------------------------------------------------------------------

/** A tool frame's fields beyond the shape the local wire type declares: the
 *  server's transcript contract also carries the call's state and its output. */
type WireToolFrame = Extract<TranscriptFrame, { kind: 'tool' }> & {
  state?: 'running' | 'done' | 'error';
  output?: unknown;
};

const FRAME_STATUS: Record<string, ToolCall['status']> = {
  running: 'running',
  done: 'ok',
  error: 'error',
};

/** A tool result as the tool cards' line array; other shapes stay invisible. */
function frameOutputLines(output: unknown): string[] | undefined {
  if (typeof output === 'string') return output.length > 0 ? output.split('\n') : undefined;
  if (Array.isArray(output) && output.every((line): line is string => typeof line === 'string')) {
    return output;
  }
  return undefined;
}

/** One tool frame as the conversation's tool card model. */
function toToolCall(frame: WireToolFrame): ToolCall {
  const arg = frame.inputText ?? (frame.input !== undefined ? JSON.stringify(frame.input) : '');
  return {
    id: frame.toolCallId,
    name: frame.name,
    arg,
    status: FRAME_STATUS[frame.state ?? ''] ?? 'ok',
    output: frameOutputLines(frame.output),
    media: frameMedia(frame.name, arg),
  };
}

const transcriptTurns = computed<ChatTurn[]>(() => {
  const turns: ChatTurn[] = [];
  for (const item of transcriptItems.value ?? []) {
    if (item.kind !== 'turn') {
      // The transcript stream carries a marker for every non-turn event the
      // daemon records: `hook`, `skill`, `cron.fired`, `compaction`, `undo`,
      // `interruption`, `notice`, `goal`, `plan.revision`. Only a compaction
      // marker is the conversation's divider — every other kind has no row of
      // its own (upstream draws none), and drawing one for all of them printed
      // a "Context compacted" line for markers that were nothing of the sort.
      // A compaction is recorded twice (a `started` phase and a `completed`
      // one), and upstream draws its divider only for the completed phase, so
      // the start marker must not add a second one.
      const phase = (item.payload as { phase?: string } | undefined)?.phase;
      if (item.marker === 'compaction' && phase !== 'started') {
        turns.push({ id: item.markerId, role: 'compaction', no: 0, text: '' });
      }
      continue;
    }
    const blocks: TurnBlock[] = [];
    for (const step of item.steps) {
      for (const frame of step.frames) {
        switch (frame.kind) {
          case 'thinking':
            if (frame.text.trim().length > 0) blocks.push({ kind: 'thinking', thinking: frame.text });
            break;
          case 'tool':
            blocks.push({ kind: 'tool', tool: toToolCall(frame as WireToolFrame) });
            break;
          case 'text':
            // A user frame is the subagent's own prompt echo: it renders as a
            // user turn, the shape the main conversation gives the same text.
            if (frame.text.trim().length === 0) break;
            if (frame.role === 'user') {
              turns.push({ id: `${item.turnId}:u${turns.length}`, role: 'user', no: 0, text: frame.text });
            } else {
              blocks.push({ kind: 'text', text: frame.text });
            }
            break;
        }
      }
    }
    // A turn with nothing readable left to show (the mock's prompt-only turn,
    // an empty step) would render as an empty row, so it is dropped.
    if (blocks.length === 0) continue;
    turns.push({
      id: item.turnId,
      role: 'assistant',
      no: 0,
      text: blocks.flatMap((blk) => (blk.kind === 'text' ? [blk.text] : [])).join('\n\n'),
      blocks,
      createdAt: item.startedAt,
    });
  }
  return turns;
});

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

// ---------------------------------------------------------------------------
// Activity-run expansion. ChatPane keeps this state in the shared
// `toolExpandState` map because its rows are evicted and re-mounted; the pane
// never unmounts a row, so a local set is enough. The Map (not a reactive
// object) is read at expand time only, so a tick invalidates the computed.
// ---------------------------------------------------------------------------

const openRuns = new Set<string>();
const runTick = ref(0);

function onRunToggle(key: string, open: boolean): void {
  if (open) openRuns.add(key);
  else openRuns.delete(key);
  runTick.value++;
}

const expandedRuns = computed<Set<string>>(() => {
  void runTick.value;
  return new Set(openRuns);
});

/** Run identity, shared by both run shapes — same rule as ChatPane's: a short
 *  run (`tool-stack`) carries no source index of its own, so its first tool's
 *  id anchors it. */
function runKeyFor(block: { items: RunItem[]; sourceIndex?: number }): string {
  const first = firstRunTool(block.items);
  return `${TOOL_FOLD_KEY_PREFIX}${first?.tool.id ?? `idx-${first?.sourceIndex ?? block.sourceIndex}`}`;
}

/** The pane matches ChatPane's render pipeline: straight from the turn's block
 *  order through the run grouping, then the fold pass. No expanded folds are
 *  passed to the fold helper — the run's rows render inside ActivityRun, so the
 *  helper must not also emit a follow-up tool-stack for an open run. */
function renderBlocksFor(turn: ChatTurn): FoldedRenderBlock[] {
  return foldRenderBlocks(assistantRenderBlocks(turn), new Set(), activityRunFolding.value);
}

function renderBlockKeyFor(block: FoldedRenderBlock, index: number): string {
  return block.kind === 'tool-fold' ? toolFoldBlockKey(block) : renderBlockKey(block, index);
}

/** Stable handler for Markdown's `open-file` event (a per-render closure would
 *  churn Markdown's props on every re-render of the row). */
function forwardOpenFile(target: FilePreviewRequest): void {
  emit('openFile', target);
}

// ---------------------------------------------------------------------------
// Scroll behavior
// ---------------------------------------------------------------------------

const bodyEl = ref<HTMLElement | null>(null);

const pinnedBottom = ref(true);
function onBodyScroll(): void {
  const b = bodyEl.value;
  if (!b) return;
  pinnedBottom.value = b.scrollTop + b.clientHeight >= b.scrollHeight - 40;
}

watch(
  () => fallbackLines.value.length + (props.member.text?.length ?? 0),
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
// subagent's first turn, or the live block while running).
watch(transcriptItems, (next, prev) => {
  if (!next || next.length === 0) return;
  if (prev !== null) return;
  void nextTick(() => {
    if (bodyEl.value) bodyEl.value.scrollTop = 0;
  });
});

// Panel switches to another subagent (or the session changes) without
// unmounting: reset the transcript + run expansion and fetch the new agent.
watch(
  () => `${props.member.id}|${props.sessionId ?? ''}`,
  (next, prev) => {
    if (next === prev) return;
    openRuns.clear();
    runTick.value++;
    promptExpanded.value = false;
    void fetchTranscript();
  },
  { immediate: true },
);
</script>

<template>
  <div class="agent-panel">
    <div ref="bodyEl" class="agent-transcript" @scroll.passive="onBodyScroll">
      <div class="agent-transcript-inner">
        <section v-if="prompt" class="agent-prompt">
          <div class="agent-prompt-bubble">
            <div class="agent-prompt-wrap" :class="{ 'is-clamped': promptClamped }">
              <div ref="promptTextEl" class="agent-prompt-text">
                <Markdown :text="prompt" :open-file="forwardOpenFile" />
              </div>
              <button
                v-if="promptOverflows"
                type="button"
                class="agent-prompt-toggle"
                :aria-expanded="!promptClamped"
                @click="togglePrompt"
              >
                <span>{{ promptClamped ? t('tasks.expand') : t('tasks.collapse') }}</span>
                <Icon
                  class="agent-prompt-toggle-car"
                  :class="{ open: !promptClamped }"
                  name="chevron-down"
                  size="sm"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </section>

        <!-- Transcript: the subagent's own turns, rendered with the same
             turn/run primitives as the main conversation, in the same template
             shape ChatPane's assistant row uses. -->
        <div v-if="hasTranscript" class="agent-turns">
          <template v-for="turn in transcriptTurns" :key="turn.id">
            <div v-if="turn.role === 'compaction'" class="compact-divider" role="separator">
              <span class="cd-line" aria-hidden="true" />
              <span class="cd-label">{{ t('conversation.compactedPlain') }}</span>
              <span class="cd-line" aria-hidden="true" />
            </div>
            <div v-else-if="turn.role === 'user'" class="u-turn">
              <div class="u-bub turn-anchor" :data-turn-id="turn.id">
                <div class="u-text">{{ turn.text }}</div>
              </div>
            </div>
            <div v-else class="a-msg turn-anchor" :data-turn-id="turn.id">
              <template v-for="(blk, bi) in renderBlocksFor(turn)" :key="renderBlockKeyFor(blk, bi)">
                <ThinkingBlock v-if="blk.kind === 'thinking'" :text="blk.thinking" mobile />
                <div v-else-if="blk.kind === 'text' && blk.text" class="msg"><Markdown :text="blk.text" :open-file="forwardOpenFile" /></div>
                <ToolCallCard
                  v-else-if="blk.kind === 'tool'"
                  :tool="blk.tool"
                  mobile
                  @open-media="emit('openMedia', $event)"
                  @open-file="emit('openFile', $event)"
                  @open-agent="emit('openAgent', $event)"
                />
                <!-- A run of tool calls behind one head row; its rows are inert
                     while it is closed. A thinking block renders on its own,
                     outside the run. -->
                <ActivityRun
                  v-else-if="blk.kind === 'tool-stack' || blk.kind === 'tool-fold'"
                  :items="blk.items"
                  :run-key="runKeyFor(blk)"
                  :expanded="expandedRuns.has(runKeyFor(blk))"
                  @toggle-fold="onRunToggle"
                >
                  <template #default="{ item }">
                    <ToolCallCard
                      :tool="item.tool"
                      mobile
                      @open-media="emit('openMedia', $event)"
                      @open-file="emit('openFile', $event)"
                      @open-agent="emit('openAgent', $event)"
                    />
                  </template>
                </ActivityRun>
              </template>
            </div>
          </template>
        </div>

        <!-- Fallback: nothing readable yet, so show what the run has said so far.
             This pane only ever shows a subagent, so upstream's `prose` variant
             (which switches the output block to the UI font) always applies. -->
        <div v-else-if="showFallback" class="agent-fallback prose">
          <div v-if="transcriptError" class="agent-error">{{ t('tasks.transcriptLoadError') }}</div>
          <div v-if="fallbackLines.length > 0" class="op">
            <div v-for="(line, index) in fallbackLines" :key="index">{{ line }}</div>
          </div>
          <div v-if="transcriptLoading" class="agent-output-state">
            <Spinner size="sm" />
            <span>{{ t('tools.output.waiting') }}</span>
          </div>
        </div>

        <!-- In flight: upstream's trailing working indicator, below whatever the
             transcript already shows. -->
        <div v-if="isWorking" class="working-indicator" role="status">
          <MoonSpinner />
          <span class="wi-label">{{ workingLabel }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--color-bg);
}

.agent-transcript {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: var(--pfc-host-h, 0px);
}
.agent-transcript-inner {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
  max-width: var(--p-content-max);
  margin-inline: auto;
}

/* ---- Prompt bubble ---- */
.agent-prompt {
  flex: none;
  display: flex;
  flex-direction: column;
  padding: 0 var(--space-3) var(--space-2);
}
.agent-prompt-bubble {
  display: flex;
  flex-direction: column;
  align-self: flex-end;
  max-width: 78%;
  padding: 10px 12px;
  background: var(--color-user-bubble-bg);
  border-radius: var(--radius-lg);
}
.agent-prompt-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
}
.agent-prompt-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--content-font-size);
  line-height: var(--leading-normal);
  color: var(--color-text);
}
.agent-prompt-wrap.is-clamped > .agent-prompt-text {
  max-height: 6lh;
  overflow: hidden;
}
.agent-prompt-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  align-self: center;
  margin-top: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-sm);
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--ui-font-size-sm);
  line-height: 1;
  cursor: pointer;
  user-select: none;
  transition: box-shadow var(--duration-base) var(--ease-out);
}
.agent-prompt-toggle:hover { box-shadow: var(--shadow-md); }
.agent-prompt-toggle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.agent-prompt-wrap.is-clamped .agent-prompt-toggle {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 0;
}
.agent-prompt-toggle-car { transition: transform var(--duration-base) var(--ease-out); }
.agent-prompt-toggle-car.open { transform: rotate(180deg); }

/* ---- Fallback block ---- */
.agent-fallback {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}
.agent-error {
  color: var(--color-danger);
  font: var(--text-sm)/var(--leading-normal) var(--font-ui);
}
.agent-output-state {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-faint);
  font-style: italic;
}

/* Upstream's OutputPanel: one row per projected line. */
.op {
  font-family: var(--font-mono);
  font-size: calc(var(--content-font-size) - 2px);
  line-height: 1.6;
  font-feature-settings: 'liga' 0, 'calt' 0;
  font-variant-ligatures: none;
  color: var(--color-text);
  background: var(--color-well);
  border: 0.5px solid var(--color-line);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 12lh;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.agent-fallback.prose .op { font-family: var(--font-ui); }

/* Send → first-token indicator: the main transcript's own `.sending-placeholder`
   layout (moon at its default size, 8px gap), not upstream's larger working
   indicator, so the two read the same. */
.working-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 10px 0;
  font: var(--text-sm)/var(--leading-normal) var(--font-ui);
  color: var(--color-text-muted);
}
.wi-label { animation: wi-breathe 1.6s var(--ease-in-out) infinite; }

@keyframes wi-breathe {
  50% { opacity: 0.55; }
}

/* ---- Transcript turns: the main conversation's own row shape ---- */
.agent-turns {
  flex: none;
  display: flex;
  flex-direction: column;
  padding: var(--space-2) var(--space-3) var(--space-3);
}
.agent-turns > * + * {
  margin-top: var(--space-4);
}

/* Assistant turn — left-aligned plain column, no role label (ChatPane's
   `.a-msg`); its blocks stack in call order with the same gap ChatPane gives
   them. */
.a-msg {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  align-self: flex-start;
  width: 94%;
  max-width: 94%;
}
.a-msg .msg {
  font-size: var(--ui-font-size);
  line-height: 1.6;
  color: var(--color-text);
  font-weight: 500;
}
.a-msg .msg :deep(p) { margin: 0; }
.a-msg .msg :deep(p + p) { margin-top: var(--space-2); }

/* User turn — right-aligned bubble, the shape the main conversation gives the
   same prompt echo. */
.u-turn {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  align-self: flex-start;
  width: 100%;
}
.u-bub {
  align-self: flex-end;
  max-width: 78%;
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent-bd);
  color: var(--color-text);
  border-radius: var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl);
  padding: 11px 15px;
  font-size: var(--content-font-size);
  line-height: var(--leading-normal);
  box-shadow: var(--shadow-xs);
}
.u-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Compaction divider — the separator ChatPane renders for a compaction turn. */
.compact-divider {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  align-self: stretch;
  width: 100%;
}
.cd-line {
  flex: 1;
  height: 1px;
  background: var(--color-line);
}
.cd-label {
  flex: none;
  max-width: 80%;
  font-size: var(--text-base);
  color: var(--color-text-muted);
  white-space: nowrap;
}
</style>
