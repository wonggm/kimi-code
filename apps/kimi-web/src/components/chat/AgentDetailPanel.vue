<!-- apps/kimi-web/src/components/chat/AgentDetailPanel.vue -->
<!-- A subagent's detail in the right panel. Element structure, class names and
     the prompt-bubble clamp follow upstream's own AgentDetailPanel:
       - meta line: subagent type · model · effort;
       - prompt bubble: the task text, collapsed to a few lines until expanded;
       - body: either the subagent's transcript (the fork reads it over REST —
         `GET /sessions/{id}/transcript?agent_id=…`) or, when there is none
         yet, upstream's fallback block: the suspended reason / output /
         summary lines plus the "waiting for output" rows.
     Upstream feeds a ChatPane from panel-held turns; the fork's engine has no
     turn store for a subagent, so the REST transcript keeps its own renderer
     inside upstream's transcript containers. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getKimiWebApi } from '../../api';
import type { AppTask, TranscriptItem } from '../../api/types';
import type { AgentMember, FilePreviewRequest, ToolMedia } from '../../types';
import { normalizeToolName, toolLabel, toolSummary } from '../../lib/toolMeta';
import Icon from '../ui/Icon.vue';
import Markdown from './Markdown.vue';
import MoonSpinner from '../ui/MoonSpinner.vue';
import Spinner from '../ui/Spinner.vue';

const props = defineProps<{
  member: AgentMember;
  /** Active session id — the transcript REST read is per-session. */
  sessionId?: string;
  /** Live session tasks: resolve the member's wire agent id (`task.agentId`,
   *  else the task id) for the transcript fetch. */
  tasks?: AppTask[];
}>();

const emit = defineEmits<{
  /** Open a file referenced by a transcript tool frame (edit/write/read). */
  openFile: [target: FilePreviewRequest];
  /** Open a media frame (read_media) whose input carries a file-store id. */
  openMedia: [media: ToolMedia];
  /** Open a nested subagent spawned by an agent tool frame. */
  openAgent: [toolCallId: string];
}>();

const { t } = useI18n();

// ---------------------------------------------------------------------------
// Meta line + prompt bubble
// ---------------------------------------------------------------------------

/** Trim a `provider/alias` model alias down to its short name (e.g.
 *  `opencode-go/deepseek-v4-flash` → `deepseek-v4-flash`). */
const displayModel = computed(() => {
  const model = props.member.model;
  if (typeof model !== 'string' || model.length === 0) return undefined;
  const lastSlash = model.lastIndexOf('/');
  return lastSlash >= 0 && lastSlash < model.length - 1 ? model.slice(lastSlash + 1) : model;
});

/** `Subagent · model · effort`, each part dropped when the daemon did not
 *  report it — upstream joins the same three fields with ` · `. */
const metaLine = computed(() => {
  const type = props.member.subagentType?.trim();
  const named = type ? type.charAt(0).toUpperCase() + type.slice(1) : '';
  const binding = [displayModel.value, props.member.thinkingEffort].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return [named, binding.join(' · ')].filter((part) => part.length > 0).join(' · ');
});

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
  fallbackLines.value.length > 0 ? t('conversation.working') : t('conversation.requesting'),
);

// ---------------------------------------------------------------------------
// Transcript view model — built from the static fetch result, so it never
// recomputes while the subagent streams.
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
// unmounting: reset the transcript + collapse state and fetch the new agent.
watch(
  () => `${props.member.id}|${props.sessionId ?? ''}`,
  (next, prev) => {
    if (next === prev) return;
    thinkingOverride.value = new Map();
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
        <div v-if="metaLine" class="agent-meta">
          <span class="agent-meta-text">{{ metaLine }}</span>
        </div>

        <section v-if="prompt" class="agent-prompt">
          <div class="agent-prompt-bubble">
            <div class="agent-prompt-wrap" :class="{ 'is-clamped': promptClamped }">
              <div ref="promptTextEl" class="agent-prompt-text">
                <Markdown :text="prompt" :open-file="(target) => emit('openFile', target)" />
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

        <!-- Transcript: the subagent's own turns, thinking blocks collapsible -->
        <template v-if="hasTranscript">
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
          <div v-if="isWorking" class="working-indicator" role="status">
            <span class="wi-mascot" aria-hidden="true"><MoonSpinner size="lg" /></span>
            <span class="wi-label">{{ workingLabel }}</span>
          </div>
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

/* ---- Meta line (rules either side of the type · model · effort text) ---- */
.agent-meta {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-2);
  user-select: none;
}
.agent-meta::before,
.agent-meta::after {
  content: '';
  flex: 1;
  height: 0.5px;
  background: var(--color-line);
}
.agent-meta-text {
  font-size: var(--text-xs);
  line-height: 1;
  color: var(--color-text-muted);
  white-space: nowrap;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
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

/* Send → first-token indicator, upstream's WorkingIndicator layout. */
.working-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  font: var(--text-sm)/var(--leading-normal) var(--font-ui);
  color: var(--color-text-muted);
}
.wi-mascot {
  flex: none;
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wi-label { animation: wi-breathe 1.6s var(--ease-in-out) infinite; }

@keyframes wi-breathe {
  50% { opacity: 0.55; }
}

/* ---- Transcript section ---- */
.ap-turn {
  min-width: 0;
  padding: 0 var(--space-3);
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
.ap-tool.clickable { cursor: pointer; }
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
