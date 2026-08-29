<!-- apps/kimi-web/src/components/chat/ChatPane.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatTurn, ApprovalBlock, FilePreviewRequest, ToolMedia, QueuedPromptView, TurnAttachment } from '../../types';
import type { DetachTaskTarget } from '../../lib/detachTarget';
import type { AppSkill } from '../../api/types';
import ToolCall from './ToolCall.vue';
import ToolGroup from './ToolGroup.vue';
import ToolFoldRow from './ToolFoldRow.vue';
import Markdown from './Markdown.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import ActivityNotice from './ActivityNotice.vue';
import CronNotice from './CronNotice.vue';
import TaskNotice from './TaskNotice.vue';
import MessageTime from './MessageTime.vue';
import AuthMedia from './AuthMedia.vue';
import AttachmentChip from './AttachmentChip.vue';
import MentionText from './MentionText.vue';
import MoonSpinner from '../ui/MoonSpinner.vue';
import Spinner from '../ui/Spinner.vue';
import Icon from '../ui/Icon.vue';
import Tooltip from '../ui/Tooltip.vue';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import { copyTextToClipboard } from '../../lib/clipboard';
import { openFileAttachment } from '../../lib/openFileAttachment';
import { getKimiWebApi } from '../../api';
import {
  assistantRenderBlocks,
  formatTokens,
  renderBlockKey,
  toolFoldBlockKey,
  turnBlocks,
  turnFinalText,
  turnToMarkdown,
} from '../chatTurnRendering';
import { foldRenderBlocks, TOOL_FOLD_KEY_PREFIX } from '../../lib/toolFold';

const { t, locale } = useI18n();
const { confirm } = useConfirmDialog();
// Silence noUnusedLocals: `locale` is referenced only inside the turn v-memo
// dependency array (template-only, which vue-tsc does not scan) so a language
// switch re-renders the transcript.
void locale;

onUnmounted(() => {
  if (copiedTimer !== null) {
    clearTimeout(copiedTimer);
    copiedTimer = null;
  }
  if (copiedConversationTimer !== null) {
    clearTimeout(copiedConversationTimer);
    copiedConversationTimer = null;
  }
  if (undoFallbackTimer !== null) {
    clearTimeout(undoFallbackTimer);
    undoFallbackTimer = null;
  }
  if (unsupportedOpenTimer !== null) {
    clearTimeout(unsupportedOpenTimer);
    unsupportedOpenTimer = null;
  }
  if (justUndoneTimer !== null) {
    clearTimeout(justUndoneTimer);
    justUndoneTimer = null;
  }
});

const props = withDefaults(
  defineProps<{
    turns: ChatTurn[];
    approvals?: { approvalId: string; block: ApprovalBlock; agentName?: string }[];
    /**
     * True while the MAIN agent has a turn in flight (not merely "session
     * busy" — background subagents and BTW side chats don't set this). Marks
     * the last assistant turn as actively streaming so its Markdown animates
     * the smooth typewriter/fade reveal; all other turns render statically.
     */
    turnActive?: boolean;
    /**
     * The main conversation has an unfinished prompt (submitted, or a main
     * turn in flight). Renders the moon-spinner placeholder at the end of the
     * transcript and gates "edit & resend" on the last user message.
     */
    working?: boolean;
    /** Switches the CSS-only working moon to the faster visual cadence. */
    fastMoon?: boolean;
    /**
     * True while the session turns are being fetched (e.g. after switching to
     * a historical session). Shows a lightweight loading placeholder instead of
     * the empty-conversation state.
     */
    sessionLoading?: boolean;
    /**
     * Live compaction state of the session: non-null while the daemon rewrites
     * history, rendered as a body-sized "Compacting context…" activity notice.
     * Completion is a persistent divider turn (role 'compaction') in `turns`.
     */
    compaction?: { status: 'running' } | null;
    /**
     * True when there are older messages available above the current viewport.
     */
    hasMoreMessages?: boolean;
    /**
     * True while older messages are being fetched (rendered at the top of the pane).
     */
    loadingMore?: boolean;
    /**
     * True when the last older-message fetch failed; blocks automatic sentinel retries.
     */
    loadingMoreError?: boolean;
    /**
     * True when the conversation pane is currently following the bottom (auto-scroll).
     * Used to prevent the top sentinel from eagerly loading older messages on open.
     */
    isFollowing?: boolean;
    /**
     * When true, clicking an Edit/Write tool card opens the right-side diff
     * panel. Off in contexts that don't wire the panel (e.g. the side chat), so
     * cards there expand inline instead.
     */
    toolDiffPanel?: boolean;
    /**
     * Pending user messages queued while the session is busy. Rendered inline
     * at the tail of the transcript (after the running turn) — click to edit,
     * × to remove, drag the grip to reorder.
     */
    queued?: QueuedPromptView[];
    /**
     * Session skills resolved by MentionText's skill pills — enables their
     * hover tip "open skill file" button and click-to-open.
     */
    skills?: AppSkill[];
    /** Frontend-only retry progress from turn.step.retrying. */
    retryProgress?: { attempt: number; maxAttempts: number } | null;
    /** Persistent failed-turn state, including failures restored from a snapshot. */
    failure?: { message?: string; promptId?: string } | null;
    /**
     * @deprecated No longer used — Composer is rendered by ConversationPane.
     */
  }>(),
  {
    approvals: () => [],
    turnActive: false,
    working: false,
    fastMoon: false,
    compaction: null,
    hasMoreMessages: false,
    loadingMore: false,
    loadingMoreError: false,
    isFollowing: false,
    toolDiffPanel: false,
    queued: () => [],
    skills: () => [],
    retryProgress: null,
    failure: null,
  },
);

// Top sentinel for lazy-loading older messages. Visible when there are older
// messages or while a page is loading; the IntersectionObserver fires as soon
// as the user scrolls (or pans) near the top of the transcript.
const topSentinelRef = ref<HTMLElement | null>(null);
let topSentinelObserver: IntersectionObserver | null = null;

function observeTopSentinel(): void {
  if (!topSentinelRef.value || typeof IntersectionObserver === 'undefined') return;
  topSentinelObserver?.disconnect();
  topSentinelObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      // Only trigger when the user has intentionally scrolled away from the
      // bottom (isFollowing=false) and the initial snapshot is no longer loading.
      if (
        entry?.isIntersecting &&
        props.hasMoreMessages &&
        !props.loadingMore &&
        !props.loadingMoreError &&
        !props.sessionLoading &&
        !props.isFollowing
      ) {
        emit('loadOlderMessages');
      }
    },
    { root: null, rootMargin: '200px 0px 0px 0px', threshold: 0 },
  );
  topSentinelObserver.observe(topSentinelRef.value);
}

onMounted(observeTopSentinel);
onUnmounted(() => {
  topSentinelObserver?.disconnect();
  topSentinelObserver = null;
});

// Tool-card expand/collapse persistence. Tool cards keep their open/closed
// state in component-local refs, which are lost when an evicted row unmounts
// them — a re-mounted row would re-render every card in its default state
// (tool groups open, Edit cards closed), changing the row's height by 60-70%
// and shifting the document. The plain Map (not reactive: it is only read at
// card mount and written on toggle) survives eviction and is consumed via
// inject('toolExpandState') by ToolGroup and the tool-call cards.
//
// The Map is also keyed for TOOL-CALL SUMMARY FOLDS (`fold:<id>`), which the
// render layer folds into one row when ≥ 3 tool calls land in a row inside a
// single assistant message. That fold is distinct from TurnFold (rejected):
// it only collapses tool cards within ONE turn and never hides message text.
const toolExpandState = new Map<string, boolean>();
provide('toolExpandState', toolExpandState);

// foldTick: bumps whenever a fold toggle lands. The fold-state Map is plain
// (not reactive) and is mutated in place by ToolFoldRow's click handler; we
// don't want the fold-state Map reactive either (the eviction survival story
// would break — see toolExpandState comment), so we instead invalidate the
// computed `expandedFolds` by touching this counter on every change.
const foldTick = ref(0);

const expandedFolds = computed<Set<string>>(() => {
  // Touch the tick so this computed re-evaluates when a fold toggles.
  void foldTick.value;
  const set = new Set<string>();
  for (const [key, value] of toolExpandState) {
    if (value === true && key.startsWith(TOOL_FOLD_KEY_PREFIX)) set.add(key);
  }
  return set;
});

function onFoldToggle(foldKey: string): void {
  const next = !toolExpandState.get(foldKey);
  toolExpandState.set(foldKey, next);
  foldTick.value++;
}

function foldKeyForBlock(block: { tools: { tool: { id?: string }; sourceIndex: number }[]; sourceIndex: number }): string {
  const first = block.tools[0];
  return `${TOOL_FOLD_KEY_PREFIX}${first?.tool.id ?? `idx-${first?.sourceIndex ?? block.sourceIndex}`}`;
}

/** Fold a turn's render blocks at the render layer. Pure pass-through to
 *  the lib helper; lives here so the row template can call it inline without
 *  re-importing. */
function renderBlocksFor(turn: ChatTurn) {
  return foldRenderBlocks(assistantRenderBlocks(turn), expandedFolds.value);
}

function renderBlockKeyFor(block: ReturnType<typeof renderBlocksFor>[number], index: number): string {
  if (block.kind === 'tool-fold') return toolFoldBlockKey(block);
  return renderBlockKey(block, index);
}

// Keep the transcript's expensive assistant children (Markdown, syntax
// highlighting, and tool cards) mounted only near the reading viewport. The
// outer row remains in the DOM, so scroll anchors and the height estimate stay
// stable while long sessions release component memory.
const evictedTurnIds = ref(new Set<string>());
const measuredTurnHeights = new Map<string, number>();
const turnAnchors = new Map<string, HTMLElement>();

function isTurnHeavyContentMounted(turn: ChatTurn): boolean {
  return turn.role !== 'assistant' || turn.id === streamingTurnId.value || !evictedTurnIds.value.has(turn.id);
}

function placeholderStyle(turnId: string): Record<string, string> | undefined {
  const height = measuredTurnHeights.get(turnId);
  return height === undefined ? undefined : { minHeight: `${height}px` };
}

function setEvicted(turnId: string, evicted: boolean): void {
  const currentlyEvicted = evictedTurnIds.value.has(turnId);
  if (currentlyEvicted === evicted) return;
  const next = new Set(evictedTurnIds.value);
  if (evicted) next.add(turnId);
  else next.delete(turnId);
  evictedTurnIds.value = next;
}

// Shared row ref. Reads the turn id from the rendered `data-turn-id` attribute
// instead of closing over it, so the function reference is stable across
// renders (a fresh closure per render would defeat v-memo's subtree skipping).
// The anchor element is registered with both observers exactly once on first
// appearance; IntersectionObserver.observe() on an already-observed element is
// a no-op, so a replaced element re-adding itself causes no re-observation
// churn. Vue calls the ref with null on unmount, which carries no element (and
// therefore no turn id) — stale map entries for removed turns are pruned by
// the turns watcher and onUnmounted instead.
function observeTurnAnchor(value: unknown): void {
  if (!(value instanceof HTMLElement)) return;
  const turnId = value.dataset.turnId;
  if (!turnId) return;
  turnAnchors.set(turnId, value);
  mountObserver?.observe(value);
  evictObserver?.observe(value);
}

// Two observers with overlapping margins provide the mount/evict hysteresis: a
// row is mounted when it enters the 800px margin but only evicted after it
// leaves the 1600px margin. The 800px gap keeps a row hovering near a single
// boundary from oscillating between mounted and evicted during slow scrolling.
const MOUNT_MARGIN = '800px 0px';
const EVICT_MARGIN = '1600px 0px';
let mountObserver: IntersectionObserver | null = null;
let evictObserver: IntersectionObserver | null = null;

function handleMountEntries(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const node = entry.target as HTMLElement;
    const turnId = node.dataset.turnId;
    if (!turnId) continue;
    // A row re-entering the mount window is no longer pending eviction.
    pendingHeights.delete(turnId);
    if (!evictedTurnIds.value.has(turnId)) continue;
    // Re-mounting after eviction: hold the row's height at its eviction-time
    // value while the content re-renders (KaTeX/shiki can commit at a
    // transient height), so the document scrollHeight doesn't move under the
    // user. Released once the content reaches the measured height or the
    // bounded window elapses — see startHeightLock.
    const measured = measuredTurnHeights.get(turnId);
    if (measured !== undefined) startHeightLock(turnId, node, measured);
    setEvicted(turnId, false);
  }
}

function handleEvictEntries(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    if (entry.isIntersecting) continue; // back inside the 1600px window — mounting is the mount observer's job
    const node = entry.target as HTMLElement;
    const turnId = node.dataset.turnId;
    if (!turnId) continue;
    const turn = props.turns.find((candidate) => candidate.id === turnId);
    // Never evict the active stream or non-assistant rows.
    if (!turn || turn.role !== 'assistant' || turn.id === streamingTurnId.value) continue;
    if (evictedTurnIds.value.has(turnId)) continue;
    // Settle-gated eviction: evict only once two measurements ~100ms apart
    // agree (within 1px), so a transient height while KaTeX/shiki is
    // mid-commit is never recorded as the row's locked height.
    const height = node.getBoundingClientRect().height;
    const previous = pendingHeights.get(turnId);
    if (previous !== undefined && Math.abs(height - previous) <= 1) {
      pendingHeights.delete(turnId);
      // Evict only when a real height is known: a heightless placeholder
      // (min-height: 1px) would collapse the row's scrollHeight contribution
      // and yank the scrollbar while content is streaming in.
      if (height > 0) {
        measuredTurnHeights.set(turnId, height);
        setEvicted(turnId, true);
      }
      continue;
    }
    pendingHeights.set(turnId, height);
    scheduleEvictionCheck();
  }
}

const EVICT_SETTLE_MS = 100;
const pendingHeights = new Map<string, number>();
let evictionCheckTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleEvictionCheck(): void {
  if (evictionCheckTimer !== null) return;
  evictionCheckTimer = setTimeout(flushPendingEvictions, EVICT_SETTLE_MS);
}

function flushPendingEvictions(): void {
  evictionCheckTimer = null;
  for (const turnId of pendingHeights.keys()) {
    if (evictedTurnIds.value.has(turnId)) {
      pendingHeights.delete(turnId);
      continue;
    }
    const node = turnAnchors.get(turnId);
    const turn = props.turns.find((candidate) => candidate.id === turnId);
    if (!node || !turn || turn.role !== 'assistant' || turn.id === streamingTurnId.value) {
      pendingHeights.delete(turnId);
      continue;
    }
    // The row scrolled back inside the 1600px window: drop it from the queue —
    // the mount observer will mount it once it reaches the 800px margin.
    if (isWithinEvictWindow(node)) {
      pendingHeights.delete(turnId);
      continue;
    }
    const height = node.getBoundingClientRect().height;
    if (Math.abs(height - (pendingHeights.get(turnId) ?? height)) <= 1) {
      pendingHeights.delete(turnId);
      if (height > 0) {
        measuredTurnHeights.set(turnId, height);
        setEvicted(turnId, true);
      }
    } else {
      pendingHeights.set(turnId, height);
    }
  }
  if (pendingHeights.size > 0) scheduleEvictionCheck();
}

// Mirror the evict observer's rootMargin (root: null = the viewport) so a
// queued row that scrolled back within the window isn't evicted mid-approach.
function isWithinEvictWindow(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  return rect.bottom >= -1600 && rect.top <= window.innerHeight + 1600;
}

// Height-locked re-mount: while a re-mounted row's content re-renders, the row
// is clamped to its measured (eviction-time) height via a min-height style on
// the row element itself. The lock is released when the content outgrows it
// (the ResizeObserver fires — the natural height reached the measured height)
// or after HEIGHT_LOCK_MS, whichever comes first; the Markdown fallback-height
// fix makes the matched height the normal case.
const HEIGHT_LOCK_MS = 1000;
const heightLocks = reactive(new Map<string, number>());
const heightLockWatchers = new Map<
  string,
  { observer: ResizeObserver | null; timer: ReturnType<typeof setTimeout> }
>();

function rowLockStyle(turnId: string): Record<string, string> | undefined {
  const height = heightLocks.get(turnId);
  return height === undefined ? undefined : { minHeight: `${height}px` };
}

function releaseHeightLock(turnId: string): void {
  const watcher = heightLockWatchers.get(turnId);
  if (watcher) {
    watcher.observer?.disconnect();
    clearTimeout(watcher.timer);
    heightLockWatchers.delete(turnId);
  }
  heightLocks.delete(turnId);
}

function startHeightLock(turnId: string, node: HTMLElement, measured: number): void {
  releaseHeightLock(turnId);
  heightLocks.set(turnId, measured);
  const timer = setTimeout(() => releaseHeightLock(turnId), HEIGHT_LOCK_MS);
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      // The min-height clamp pins the row to `measured` until the content
      // naturally exceeds it; a larger rect means the content has settled.
      if (node.getBoundingClientRect().height > measured + 1) releaseHeightLock(turnId);
    });
    observer.observe(node);
  }
  heightLockWatchers.set(turnId, { observer, timer });
}

// Both observers are created once and live for the component's lifetime; rows
// are (re)observed only when a new anchor element first appears.
function setupTurnObservers(): void {
  if (typeof IntersectionObserver === 'undefined') return;
  mountObserver = new IntersectionObserver(handleMountEntries, {
    root: null,
    rootMargin: MOUNT_MARGIN,
    threshold: 0,
  });
  evictObserver = new IntersectionObserver(handleEvictEntries, {
    root: null,
    rootMargin: EVICT_MARGIN,
    threshold: 0,
  });
  for (const node of turnAnchors.values()) {
    mountObserver.observe(node);
    evictObserver.observe(node);
  }
}

onMounted(setupTurnObservers);
onUnmounted(() => {
  if (evictionCheckTimer !== null) clearTimeout(evictionCheckTimer);
  evictionCheckTimer = null;
  pendingHeights.clear();
  mountObserver?.disconnect();
  evictObserver?.disconnect();
  mountObserver = null;
  evictObserver = null;
  for (const { observer, timer } of heightLockWatchers.values()) {
    observer?.disconnect();
    clearTimeout(timer);
  }
  heightLockWatchers.clear();
  heightLocks.clear();
  turnAnchors.clear();
  measuredTurnHeights.clear();
});
watch(
  () => [props.hasMoreMessages, props.loadingMore, props.loadingMoreError],
  () => {
    // Re-attach the observer after a load so that a still-visible sentinel
    // (e.g. the page was not tall enough to scroll) triggers another page.
    // Wait for the next render tick because the sentinel is rendered by v-if
    // and may not exist when this watcher first fires.
    void nextTick().then(observeTopSentinel);
  },
);

// The id of the turn that is actively streaming: the last assistant turn while
// the main turn is in flight. Its Markdown renders with `streaming`
// (final=false); every other turn renders statically.
const streamingTurnId = computed<string | null>(() => {
  if (!props.turnActive || props.turns.length === 0) return null;
  const last = props.turns.at(-1)!;
  return last.role === 'assistant' ? last.id : null;
});

watch(
  [streamingTurnId, () => props.turns],
  () => {
    // Bookkeeping only: prune state for turns that left the transcript. The
    // observers themselves are never rebuilt — rows removed from the DOM are
    // unobserved here, and replaced anchors re-register via the stable row ref.
    const currentIds = new Set(props.turns.map((turn) => turn.id));
    for (const id of evictedTurnIds.value) {
      if (!currentIds.has(id)) measuredTurnHeights.delete(id);
    }
    for (const id of pendingHeights.keys()) {
      if (!currentIds.has(id)) pendingHeights.delete(id);
    }
    for (const id of heightLockWatchers.keys()) {
      if (!currentIds.has(id)) releaseHeightLock(id);
    }
    for (const id of turnAnchors.keys()) {
      if (!currentIds.has(id)) {
        const node = turnAnchors.get(id);
        if (node) {
          mountObserver?.unobserve(node);
          evictObserver?.unobserve(node);
        }
        turnAnchors.delete(id);
      }
    }
    const next = new Set([...evictedTurnIds.value].filter((id) => currentIds.has(id)));
    if (next.size !== evictedTurnIds.value.size) evictedTurnIds.value = next;
  },
  { flush: 'post' },
);

// Trailing "working" moon: shown while the main conversation has an unfinished
// prompt. `working` is the union of the optimistic submit window and the main
// turn's liveness (restored from the snapshot's inFlightTurn after a refresh);
// background agents and BTW side chats never show here — the moon belongs to
// the main conversation only.
const showWorking = computed(() => props.working);

const emit = defineEmits<{
  openFile: [target: FilePreviewRequest];
  openMedia: [media: ToolMedia];
  copyConversationCopied: [];
  /** Show a thinking block's full text in the right-side panel. */
  openThinking: [target: { turnId: string; blockIndex: number }];
  /** Show a compaction divider's summary text in the right-side panel. */
  openCompaction: [target: { turnId: string }];
  /** Show a subagent's live detail in the right-side panel (keyed by the
   *  spawning `Agent` tool-call id). */
  openAgent: [toolCallId: string];
  /** Send a running foreground task (subagent / bash card) to the background. */
  detachTask: [target: DetachTaskTarget];
  /** Show an Edit/Write tool call's diff in the right-side panel. */
  openToolDiff: [id: string];
  /** Edit + resend the last user message (parent undoes, then refills composer). */
  editMessage: [payload: { text: string; attachments?: TurnAttachment[] }];
  /** Fetch the next older page of messages (triggered by top sentinel visibility or click). */
  loadOlderMessages: [];
  /** Remove a queued message by index. */
  unqueue: [index: number];
  /** Load a queued message back into the composer for editing (and dequeue it). */
  editQueued: [index: number];
  /** Drag-to-reorder a queued message within the active session's queue. */
  reorderQueue: [payload: { from: number; to: number }];
  /** Steer one queued message into the running turn (per-row Ctrl+S parity). */
  steerQueued: [index: number];
  /** Send one queued message immediately as its own prompt (per-row flush). */
  sendQueued: [index: number];
  /** Resume the failed prompt through the parent client's normal retry path. */
  resumeFailure: [];
}>();

// ---- Inline queue (pending messages while running) ------------------------
// Edit/remove are one-click; reorder is HTML5 drag-and-drop initiated from the
// grip handle (the body stays a click-to-edit button).
const dragFrom = ref<number | null>(null);
const dragOver = ref<{ index: number; position: 'before' | 'after' } | null>(null);

function hasAttachments(item: QueuedPromptView): boolean {
  return (item.attachments?.length ?? 0) > 0;
}

function onQueueEdit(index: number): void {
  // Image/video attachments round-trip through the composer now (the composer
  // can hold fileIds), so a queued prompt can be loaded back for edit whether or
  // not it carries media.
  emit('editQueued', index);
}

function onQueueDragStart(index: number, event: DragEvent): void {
  dragFrom.value = index;
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(index));
  // Use the whole row as the drag image instead of just the grip handle.
  const row = (event.currentTarget as HTMLElement | null)?.closest<HTMLElement>('.q-turn');
  if (row) event.dataTransfer.setDragImage(row, 24, 24);
}

function onQueueDragOver(index: number, event: DragEvent): void {
  if (dragFrom.value === null) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  dragOver.value = { index, position };
}

function onQueueDrop(index: number, event: DragEvent): void {
  event.preventDefault();
  const from = dragFrom.value;
  const position = dragOver.value?.position ?? 'before';
  dragFrom.value = null;
  dragOver.value = null;
  if (from === null) return;
  // Convert the "before/after target row" into a final insertion index,
  // adjusting for the source row being removed first on downward moves.
  let to = position === 'before' ? index : index + 1;
  if (from < to) to -= 1;
  if (from === to) return;
  emit('reorderQueue', { from, to });
}

function onQueueDragEnd(): void {
  dragFrom.value = null;
  dragOver.value = null;
}

// Id of the most recent user turn — the only one offered an "edit & resend"
// affordance (undo only removes the latest exchange).
const lastUserTurnId = computed<string | null>(() => {
  for (let i = props.turns.length - 1; i >= 0; i--) {
    if (props.turns[i]!.role === 'user') return props.turns[i]!.id;
  }
  return null;
});

/** Whether to offer "edit & resend" on this turn: the latest user message, only
    while the conversation has nothing unfinished and it isn't a plugin command.
    Skill activations are undoable too (the engine treats a user-slash skill turn
    as an undo anchor). */
function canEditTurn(turn: ChatTurn): boolean {
  return (
    turn.role === 'user' &&
    turn.id === lastUserTurnId.value &&
    !props.working &&
    !turn.pluginCommand
  );
}

/** Divider label: "Context compacted"/"auto-compacted" + optional token stats. */
function compactionDividerLabel(turn: ChatTurn): string {
  const c = turn.compaction;
  const base =
    c?.trigger === 'auto' ? t('conversation.compactedAuto') : t('conversation.compactedPlain');
  if (typeof c?.tokensBefore === 'number' && typeof c?.tokensAfter === 'number') {
    return (
      base +
      t('conversation.compactedTokens', {
        before: formatTokens(c.tokensBefore),
        after: formatTokens(c.tokensAfter),
      })
    );
  }
  return base;
}

// Per-turn copy button state (keyed by turn id)
const copiedTurn = ref<string | null>(null);

// Undo in-flight guard (keyed by turn id) — set while the server undoes the
// turn so a second undo can't fire until the first one settles.
const undoingTurnId = ref<string | null>(null);
// Fallback that releases the undoing state if the server undo never removes
// the turn (e.g. the undo failed). Without it the guard in confirmEditMessage
// would block any further undo.
let undoFallbackTimer: ReturnType<typeof setTimeout> | null = null;
const UNDO_FALLBACK_MS = 2500;

async function onUndo(turn: ChatTurn): Promise<void> {
  if (
    await confirm({
      title: t('conversation.undo'),
      message: t('conversation.undoConfirm'),
      variant: 'primary',
    })
  ) {
    confirmEditMessage(turn);
  }
}

function confirmEditMessage(turn: ChatTurn): void {
  if (undoingTurnId.value !== null) return;
  undoingTurnId.value = turn.id;
  emit('editMessage', { text: turn.text, attachments: turn.attachments });
  // Fallback: if the server undo never removes the turn (e.g. it failed),
  // release the guard so the user can retry.
  undoFallbackTimer = setTimeout(() => {
    undoFallbackTimer = null;
    undoingTurnId.value = null;
  }, UNDO_FALLBACK_MS);
}

// Release the undoing guard once the server undo has actually removed the turn
// from the list (post-render, so the element is already gone). That removal is
// the success signal, so it also shows the transient "Undone" toast.
const justUndone = ref(false);
let justUndoneTimer: ReturnType<typeof setTimeout> | null = null;
const UNDONE_TOAST_MS = 2500;

watch(
  () => props.turns,
  (turns) => {
    if (undoingTurnId.value === null) return;
    if (turns.some((t) => t.id === undoingTurnId.value)) return;
    undoingTurnId.value = null;
    if (undoFallbackTimer !== null) {
      clearTimeout(undoFallbackTimer);
      undoFallbackTimer = null;
    }
    justUndone.value = true;
    if (justUndoneTimer !== null) clearTimeout(justUndoneTimer);
    justUndoneTimer = setTimeout(() => {
      justUndoneTimer = null;
      justUndone.value = false;
    }, UNDONE_TOAST_MS);
  },
  { flush: 'post' },
);

// Copy-whole-conversation state
const copiedConversation = ref(false);
let copiedConversationTimer: ReturnType<typeof setTimeout> | null = null;

/** Convert the entire conversation to Markdown and copy to clipboard. */
function copyConversation(): void {
  if (props.turns.length === 0) return;
  const lines: string[] = [];
  for (const turn of props.turns) {
    if (turn.role === 'compaction' || turn.role === 'cron' || turn.role === 'task') continue; // dividers / notices don't copy
    const roleLabel = turn.role === 'user' ? 'User' : 'Assistant';
    const content = turnToMarkdown(turn);
    if (content.trim()) {
      lines.push(`**${roleLabel}**\n\n${content}`);
    }
  }
  const markdown = lines.join('\n\n---\n\n');
  void copyTextToClipboard(markdown).then((ok) => {
    if (!ok) return;
    copiedConversation.value = true;
    emit('copyConversationCopied');
    if (copiedConversationTimer !== null) clearTimeout(copiedConversationTimer);
    copiedConversationTimer = setTimeout(() => {
      copiedConversationTimer = null;
      copiedConversation.value = false;
    }, 2000);
  }).catch(() => {/* ignore */});
}

function assistantRunEndingAt(index: number): ChatTurn[] {
  const run: ChatTurn[] = [];
  for (let i = index; i >= 0; i--) {
    const turn = props.turns[i];
    if (!turn || turn.role !== 'assistant') break;
    run.unshift(turn);
  }
  return run;
}

function assistantRunFinalText(index: number): string {
  return assistantRunEndingAt(index)
    .map((t) => turnFinalText(t))
    .filter(Boolean)
    .join('\n\n');
}

function finalSummaryText(): string {
  for (let i = props.turns.length - 1; i >= 0; i -= 1) {
    if (props.turns[i]?.role === 'assistant') return assistantRunFinalText(i);
  }
  return '';
}

function copyFinalSummary(): void {
  const text = finalSummaryText();
  if (!text.trim()) return;
  void copyTextToClipboard(text).then((ok) => {
    if (!ok) return;
    copiedConversation.value = true;
    emit('copyConversationCopied');
    if (copiedConversationTimer !== null) clearTimeout(copiedConversationTimer);
    copiedConversationTimer = setTimeout(() => {
      copiedConversationTimer = null;
      copiedConversation.value = false;
    }, 2000);
  }).catch(() => {/* ignore */});
}

defineExpose({ copyConversation, copyFinalSummary });

function isAssistantRunEnd(index: number): boolean {
  const turn = props.turns[index];
  if (!turn || turn.role !== 'assistant') return false;
  const next = props.turns[index + 1];
  return !next || next.role !== 'assistant';
}

// One shared timer: copying B within 1.4s of copying A must not let A's stale
// timer hide B's checkmark early. Cleared on unmount.
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
function copyAssistantRun(index: number): void {
  const turn = props.turns[index];
  if (!turn) return;
  const text = assistantRunFinalText(index);
  if (!text.trim()) return;
  void copyTextToClipboard(text).then((ok) => {
    if (!ok) return;
    copiedTurn.value = turn.id;
    if (copiedTimer !== null) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedTimer = null;
      copiedTurn.value = null;
    }, 1400);
  }).catch(() => {/* ignore */});
}

function copyUserMessage(turn: ChatTurn): void {
  const text = turn.text;
  if (!text.trim()) return;
  void copyTextToClipboard(text).then((ok) => {
    if (!ok) return;
    copiedTurn.value = turn.id;
    if (copiedTimer !== null) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedTimer = null;
      copiedTurn.value = null;
    }, 1400);
  }).catch(() => {/* ignore */});
}

function userAttachmentMedia(att: TurnAttachment): ToolMedia {
  // User-uploaded media carries no path/mime metadata; the preview panel falls
  // back to a generic label and sniffs the mime from the URL when needed. When
  // a fileId is present the preview fetches the bytes with auth (a bare
  // getFileUrl src 401s under daemon auth).
  return { kind: att.kind === 'video' ? 'video' : 'image', url: att.url, path: att.name, fileId: att.fileId, sessionMedia: att.sessionMedia };
}

// Transient "can't open this type" hint after clicking a file chip of a
// non-previewable type. Mirrors the copiedTurn timer pattern; cleared on unmount.
const unsupportedOpenName = ref<string | null>(null);
let unsupportedOpenTimer: ReturnType<typeof setTimeout> | null = null;

function onAttachmentClick(att: TurnAttachment): void {
  if (att.kind === 'image' || att.kind === 'video') {
    emit('openMedia', userAttachmentMedia(att));
    return;
  }
  // Generic files open in a new tab, but only whitelisted inert types —
  // anything else gets the unsupported hint instead of an active-document
  // preview (see openFileAttachment).
  if (att.fileId === undefined) return;
  void openFileAttachment(att.fileId, att.name, att.mediaType).then((result) => {
    if (result !== 'unsupported') return;
    unsupportedOpenName.value = att.name ?? att.fileId ?? '';
    if (unsupportedOpenTimer !== null) clearTimeout(unsupportedOpenTimer);
    unsupportedOpenTimer = setTimeout(() => {
      unsupportedOpenTimer = null;
      unsupportedOpenName.value = null;
    }, 2400);
  });
}

// The trailing "streaming" block is the LAST block of the actively-streaming
// turn. Cached per turn object: turns are rebuilt on every store update (see
// messagesToTurns), so the cache recomputes once per turn render instead of
// once per block — turnBlocks() is O(blocks), so per-block calls would make
// rendering a turn O(blocks²).
const streamingLastBlockCache = new WeakMap<ChatTurn, number>();

function isStreamingRenderBlock(turn: ChatTurn, block: { sourceIndex: number }): boolean {
  if (turn.id !== streamingTurnId.value) return false;
  let lastBlockIndex = streamingLastBlockCache.get(turn);
  if (lastBlockIndex === undefined) {
    lastBlockIndex = turnBlocks(turn).length - 1;
    streamingLastBlockCache.set(turn, lastBlockIndex);
  }
  return block.sourceIndex === lastBlockIndex;
}

// Stable handler for Markdown's `open-file` event — a per-render closure would
// churn Markdown's props on every re-render of the row.
function forwardOpenFile(target: FilePreviewRequest): void {
  emit('openFile', target);
}

// Stable resolver for MentionText's skill pills (same per-render churn concern):
// finds the skill by name in the `skills` prop so the hover tip can show its
// description and an "open skill file" button (clicking the pill goes through
// the same `openFile` flow, since a skill resolves to its SKILL.md path).
function resolveSkillMention(name: string): { description?: string; path?: string } | null {
  const skill = props.skills?.find((s) => s.name === name);
  return skill ? { description: skill.description, path: skill.path } : null;
}

// Mention-pill existence probe: hover-only, cheap. The daemon folder picker
// (fs:browse) is the only session-free stat-like endpoint in the web API, and
// it requires an absolute path — so absolute folder mentions get real
// missing-detection (struck through), while workspace-relative paths and file
// mentions stay "unknown" (fs:read / download are bound to a session, which
// ChatPane does not have). If ChatPane ever gains a session-id prop, switch
// the file probe to readFileContent, mirroring the file-preview flow.
function probeMentionPath(kind: 'file' | 'folder', path: string): Promise<boolean> {
  const isAbsolute = path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path);
  if (kind !== 'folder' || !isAbsolute) return Promise.resolve(true);
  return getKimiWebApi().browseFs(path).then((result) => result.path !== '');
}

// NOTE: the turn-summary line ("已调用 N 个工具…") was removed in f9417af. If it
// comes back, rebuild it from turnBlocks() with i18n strings — the old
// implementation lives in git history at f9417af^.
</script>

<template>
  <!-- Chat bubbles: user turns are right-aligned soft-blue bubbles; assistant
       turns are left-aligned plain text with no role/name label, in order:
       thinking → message text → tool cards. -->
  <div class="chat">
    <div v-if="sessionLoading" class="chat-loading">
      <Spinner size="sm" />
      <span class="chat-loading-text">{{ t('conversation.loading') }}</span>
    </div>
    <div v-else-if="turns.length === 0 && (!approvals || approvals.length === 0)" class="chat-empty" />

    <div
      v-if="hasMoreMessages || loadingMore"
      ref="topSentinelRef"
      class="top-sentinel"
      :class="{ 'top-sentinel-loading': loadingMore }"
    >
      <button
        v-if="!loadingMore"
        type="button"
        class="top-sentinel-btn"
        @click="emit('loadOlderMessages')"
      >
        {{ t('conversation.loadOlder') }}
      </button>
      <span v-else class="top-sentinel-text">
        <Spinner size="sm" />
        {{ t('conversation.loadingOlder') }}
      </span>
    </div>

    <!-- v-memo on the turn list: a turn's whole subtree is re-rendered only
         when one of the row-level inputs below changed. `ti` is REQUIRED
         because isAssistantRunEnd(ti) / copyAssistantRun(ti) capture the
         index — older-history prepends shift every index, costing one full
         re-render of the transcript per prepend (acceptable). -->
    <template
      v-for="(turn, ti) in turns"
      :key="turn.id"
      v-memo="[
        turn,
        ti,
        turn.id === streamingTurnId,
        evictedTurnIds.has(turn.id),
        heightLocks.has(turn.id),
        copiedTurn === turn.id,
        undoingTurnId === turn.id,
        turn.id === lastUserTurnId,
        working,
        locale,
      ]"
    >
      <!-- User turn → right-aligned soft-blue bubble (undo affordance lives
           outside the bubble with an inline confirm step). -->
      <template v-if="turn.role === 'user'">
        <div class="u-turn">
          <div class="u-bub turn-anchor" :class="{ undoing: undoingTurnId === turn.id }" :data-turn-id="turn.id">
            <!-- Unified attachment chips: files, images and videos -->
            <div v-if="turn.attachments && turn.attachments.length > 0" class="u-atts">
              <AttachmentChip
                v-for="(att, ai) in turn.attachments"
                :key="ai"
                :kind="att.kind"
                :name="att.name"
                :url="att.url"
                :file-id="att.fileId"
                :media-type="att.mediaType"
                :size="att.size"
                @activate="onAttachmentClick(att)"
              />
            </div>
            <!-- Plugin command card (replaces expanded body) -->
            <div v-else-if="turn.pluginCommand" class="skill-act">
              <div class="skill-act-head">
                <span class="skill-act-arrow">▶</span>
                <span>/{{ turn.pluginCommand.pluginId }}:{{ turn.pluginCommand.commandName }}</span>
              </div>
              <div v-if="turn.pluginCommand.args" class="skill-act-args">{{ turn.pluginCommand.args }}</div>
            </div>
            <!-- User input renders verbatim (pre-wrap), never through Markdown;
                 @-mentioned files/folders/skills render as icon pills. Shown
                 alongside attachments (the chips above are not exclusive). -->
            <div v-if="!turn.pluginCommand && turn.text" class="u-text">
              <MentionText
                :text="turn.text"
                :open-file="forwardOpenFile"
                :probe-path="probeMentionPath"
                :resolve-skill="resolveSkillMention"
              />
            </div>
          </div>
          <div v-if="turn.createdAt || canEditTurn(turn)" class="u-meta">
            <div v-if="canEditTurn(turn)" class="u-edit-wrap" :class="{ undoing: undoingTurnId === turn.id }">
              <button
                type="button"
                class="u-edit"
                :aria-label="t('conversation.undoTooltip')"
                @click="onUndo(turn)"
              >
                <Icon name="undo" size="sm" />
              </button>
            </div>
            <button
              v-if="turn.text.trim().length > 0"
              type="button"
              class="u-copy"
              :aria-label="t('filePreview.copy')"
              @click.stop="copyUserMessage(turn)"
            >
              <Icon v-if="copiedTurn !== turn.id" name="copy" size="sm" />
              <Icon v-else name="check" size="sm" />
            </button>
            <MessageTime v-if="turn.createdAt" :time="turn.createdAt" />
          </div>
        </div>
      </template>

      <!-- Compaction divider — prior turns stay untouched; summary opens in
           the right-side panel on click. -->
      <div v-else-if="turn.role === 'compaction'" class="compact-divider turn-anchor" :data-turn-id="turn.id" role="separator">
        <span class="cd-line" aria-hidden="true" />
        <button
          v-if="turn.text"
          type="button"
          class="cd-label cd-btn"
          @click="emit('openCompaction', { turnId: turn.id })"
        >
          <span>{{ compactionDividerLabel(turn) }}</span>
          <span class="cd-view">{{ t('conversation.viewSummary') }}</span>
        </button>
        <span v-else class="cd-label">{{ compactionDividerLabel(turn) }}</span>
        <span class="cd-line" aria-hidden="true" />
      </div>

      <!-- Cron notice — a turn triggered by a scheduled reminder, rendered as
           a lightweight in-transcript notice rather than a user bubble. -->
      <CronNotice v-else-if="turn.role === 'cron'" :text="turn.text" :cron="turn.cron" :turn-id="turn.id" :created-at="turn.createdAt" />

      <!-- Task notice — a background task completion, rendered as a light
           notice (summary + output file/preview) rather than a user bubble. -->
      <TaskNotice v-else-if="turn.role === 'task'" :text="turn.text" :turn-id="turn.id" :created-at="turn.createdAt" />

      <!-- Assistant turn → left-aligned, no name/role label. -->
      <div
        v-else
        :ref="observeTurnAnchor"
        class="a-msg turn-anchor"
        :class="{ 'is-streaming': turn.id === streamingTurnId }"
        :style="rowLockStyle(turn.id)"
        :data-turn-id="turn.id"
      >
        <template v-if="isTurnHeavyContentMounted(turn)">
          <template v-for="(blk, bi) in renderBlocksFor(turn)" :key="renderBlockKeyFor(blk, bi)">
            <ThinkingBlock v-if="blk.kind === 'thinking'" :text="blk.thinking" mobile :streaming="isStreamingRenderBlock(turn, blk)" @open="emit('openThinking', { turnId: turn.id, blockIndex: blk.sourceIndex })" />
            <div v-else-if="blk.kind === 'text' && blk.text" class="msg"><Markdown :text="blk.text" :streaming="isStreamingRenderBlock(turn, blk)" :open-file="forwardOpenFile" /></div>
            <ToolGroup
              v-else-if="blk.kind === 'tool-stack'"
              :tools="blk.tools"
              mobile
              :tool-diff-panel="toolDiffPanel"
              @open-media="emit('openMedia', $event)"
              @open-file="emit('openFile', $event)"
              @open-tool-diff="emit('openToolDiff', $event)"
              @open-agent="emit('openAgent', $event)"
              @detach-task="emit('detachTask', $event)"
            />
            <ToolCall v-else-if="blk.kind === 'tool'" :tool="blk.tool" mobile :tool-diff-panel="toolDiffPanel" @open-media="emit('openMedia', $event)" @open-file="emit('openFile', $event)" @open-tool-diff="emit('openToolDiff', $event)" @open-agent="emit('openAgent', $event)" @detach-task="emit('detachTask', $event)" />
            <ToolFoldRow
              v-else-if="blk.kind === 'tool-fold'"
              :tools="blk.tools"
              :source-index="blk.sourceIndex"
              :expanded="expandedFolds.has(foldKeyForBlock(blk))"
              @toggle="onFoldToggle(foldKeyForBlock(blk))"
            />
          </template>
        </template>
        <div v-else class="turn-content-placeholder" :style="placeholderStyle(turn.id)" aria-hidden="true" />
        <div v-if="turn.id !== streamingTurnId && isAssistantRunEnd(ti) && assistantRunFinalText(ti).trim().length > 0" class="a-msg-ft">
          <MessageTime v-if="turn.createdAt" :time="turn.createdAt" />
          <button
            v-if="assistantRunFinalText(ti).trim().length > 0"
            class="a-cpbtn"
            :aria-label="t('filePreview.copy')"
            @click="copyAssistantRun(ti)"
          >
            <Icon v-if="copiedTurn !== turn.id" name="copy" size="sm" />
            <Icon v-else name="check" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <!-- Transient "Undone" toast after a successful undo of the last message
         (incl. skill-activation turns): solid pill, auto-dismisses. -->
    <Transition name="undo-toast">
      <div v-if="justUndone" class="undo-toast" role="status" aria-live="polite">
        <span class="undo-toast-text">{{ t('conversation.undone') }}</span>
      </div>
    </Transition>

    <!-- Pending approvals are rendered in the bottom dock (ConversationPane),
         alongside questions, so both blocking prompts share one position. -->

    <!-- Compaction in progress — body-sized moon activity notice -->
    <ActivityNotice v-if="compaction" :label="t('conversation.compacting')" />

    <!-- Persistent failed-turn card; unlike a toast it remains after the turn
         and can be restored from a session snapshot. -->
    <div v-if="failure && !showWorking" class="failure-card lg-glass" role="alert">
      <div class="failure-title">{{ t('conversation.modelRequestFailed') }}</div>
      <div v-if="failure.message" class="failure-message">{{ failure.message }}</div>
      <button type="button" class="failure-resume" @click="emit('resumeFailure')">
        {{ t('conversation.resumeRetry') }}
      </button>
    </div>

    <!-- Retry progress stays inside the existing working-status rendering path. -->
    <div v-if="showWorking" class="sending-placeholder">
      <MoonSpinner :fast="fastMoon" />
      <span v-if="retryProgress" class="retry-progress">
        {{ t('conversation.retryAttempt', { attempt: retryProgress.attempt, max: retryProgress.maxAttempts }) }}
      </span>
    </div>

    <!-- Inline queue — pending user messages shown after the running turn.
         Click to edit, × to remove, drag the grip to reorder. -->
    <div v-if="queued.length > 0" class="q-stack">
      <div class="q-head">
        <span class="q-title">
          <Icon name="mail" size="sm" />
          {{ t('composer.queueLabel') }} · <b>{{ queued.length }}</b>
        </span>
        <span class="q-hint">{{ t('composer.queueAutoDrain') }}</span>
      </div>
      <div
        v-for="(item, qi) in queued"
        :key="qi"
        class="u-turn q-turn"
        :class="{
          'q-dragging': dragFrom === qi,
          'drop-before': dragOver?.index === qi && dragOver.position === 'before',
          'drop-after': dragOver?.index === qi && dragOver.position === 'after',
        }"
        @dragover="onQueueDragOver(qi, $event)"
        @drop="onQueueDrop(qi, $event)"
      >
        <div class="u-bub q-bub">
          <span
            class="q-grip"
            :title="t('composer.queueDragTitle')"
            draggable="true"
            @dragstart="onQueueDragStart(qi, $event)"
            @dragend="onQueueDragEnd"
          >
            <Icon name="grip" size="sm" />
          </span>
          <button
            type="button"
            class="q-body"
            :title="t('composer.editQueued')"
            @click="onQueueEdit(qi)"
          >
            <span v-if="item.text" class="u-text q-text">{{ item.text }}</span>
            <span v-else class="q-text q-text-placeholder">
              <Icon name="file" size="sm" />
              {{ t('composer.queuedAttachments', { n: item.attachments?.length ?? 0 }) }}
            </span>
          </button>
          <div v-if="hasAttachments(item)" class="q-imgs">
            <template v-for="(att, ai) in item.attachments" :key="ai">
              <span v-if="att.kind === 'file'" class="q-file">
                <Icon name="file" size="sm" />
                {{ att.name ?? att.fileId }}
              </span>
              <AuthMedia
                v-else
                :url="att.url"
                :kind="att.kind"
                :file-id="att.fileId"
                media-class="q-img"
                :controls="false"
                muted
              />
            </template>
          </div>
          <span v-if="qi === 0" class="q-tag q-tag-next">{{ t('composer.queueNext') }}</span>
          <span v-else class="q-tag q-tag-idx">#{{ qi + 1 }}</span>
          <span class="q-actions">
            <Tooltip :text="t('composer.queueSteerTitle')">
              <button
                type="button"
                class="q-act"
                :aria-label="t('composer.queueSteer')"
                @click.stop="emit('steerQueued', qi)"
              >
                <Icon name="bolt" size="sm" />
                <span>{{ t('composer.queueSteer') }}</span>
              </button>
            </Tooltip>
            <Tooltip :text="t('composer.queueSendNowTitle')">
              <button
                type="button"
                class="q-act"
                :aria-label="t('composer.queueSendNow')"
                @click.stop="emit('sendQueued', qi)"
              >
                <Icon name="send" size="sm" />
                <span>{{ t('composer.queueSendNow') }}</span>
              </button>
            </Tooltip>
          </span>
          <button
            type="button"
            class="q-rm"
            :aria-label="t('composer.remove')"
            @click.stop="emit('unqueue', qi)"
          >
            <Icon name="close" size="sm" />
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Transient hint after clicking a file chip whose type can't be opened. -->
  <div v-if="unsupportedOpenName !== null" class="open-unsupported" role="status">
    {{ t('composer.attachmentOpenUnsupported', { name: unsupportedOpenName }) }}
  </div>
</template>

<style scoped>
.chat-empty {
  /* Fills the chat area and centers the hint vertically (parent grows via flex). */
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 16px;
  color: var(--faint);
  text-align: center;
}
.chat-empty-text { font-size: var(--ui-font-size-sm); }

.chat-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  color: var(--muted);
}
.chat-loading-text { font-size: var(--ui-font-size-sm); }

/* ===================== Bubble layout ===================== */
.chat {
  --chat-turn-gap: 16px;
  --chat-block-gap: 10px;
  --chat-section-gap: 18px;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 16px 14px 20px;
  flex: 1;
  min-height: 0;
  position: relative;
}
.chat .chat-empty { align-self: stretch; }

/* Bottom-center pill for the "can't open this file type" hint. */
.open-unsupported {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(90%, 480px);
  padding: 6px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-line);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  font-size: var(--ui-font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}
.chat > .u-turn,
.chat > .a-msg,
.chat > .compact-divider,
.chat > .cron-notice,
.chat > .sending-placeholder,
.chat > :deep(.activity-notice) {
  margin-top: var(--chat-turn-gap);
}

/* Transient "Undone" toast: top-center solid pill, inverse of the surface so
   it reads as a status flash; auto-dismisses (see justUndone). */
.undo-toast {
  position: absolute;
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
  padding: 7px 14px;
  border-radius: var(--radius-md);
  background: var(--color-text);
  color: var(--color-bg);
  font-size: var(--text-sm);
  box-shadow: var(--shadow-sm);
  z-index: var(--z-sticky);
  white-space: nowrap;
  pointer-events: none;
}
.undo-toast-text {
  display: flex;
  align-items: center;
  gap: 8px;
}
.undo-toast-enter-active,
.undo-toast-leave-active {
  transition: opacity var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
}
.undo-toast-enter-from,
.undo-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
}
.chat > .a-msg {
  margin-top: 10px;
}
.chat > .u-turn:first-child,
.chat > .a-msg:first-child,
.chat > .compact-divider:first-child,
.chat > .cron-notice:first-child,
.chat > .sending-placeholder:first-child,
.chat > :deep(.activity-notice:first-child) {
  margin-top: 0;
}

/* User turn — wraps the bubble + meta row so they lay out as one right-aligned group. */
.u-turn {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  align-self: flex-start;
  width: 100%;
}

/* User message → right-aligned soft-blue bubble (redesign .p-bubble-user). */
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
.u-meta {
  align-self: flex-end;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  max-width: 78%;
  margin-top: 2px;
  margin-right: 4px;
}
.u-meta .u-edit {
  min-height: 22px;
  box-sizing: border-box;
}
/* User input is shown verbatim — preserve newlines, break long tokens. */
.u-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Undo/edit-and-resend affordance on the most recent user message. The trigger
   button sits outside the user bubble; clicking it swaps in an inline confirm
   row with Confirm/Cancel actions. */
.u-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 5px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--muted);
  font: inherit;
  font-size: var(--text-base);
  line-height: 1;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.12s, color 0.12s, background-color 0.12s;
}
.u-edit svg {
  display: block;
  flex: none;
}
.u-edit:hover { opacity: 1; color: var(--color-accent); background: var(--hover); }
/* Copy button — icon-only, shares the undo button's muted→hover style. */
.u-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 5px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--muted);
  font: inherit;
  font-size: var(--text-base);
  line-height: 1;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.12s, color 0.12s, background-color 0.12s;
  min-height: 22px;
  box-sizing: border-box;
}
.u-copy svg { display: block; flex: none; }
.u-copy:hover { opacity: 1; color: var(--color-accent); background: var(--hover); }
/* Mobile bubble layout: right-align the undo button below the bubble. */
.u-edit-wrap { display: flex; justify-content: flex-end; }
.chat > .u-edit-wrap { margin-top: 4px; }
.chat > .u-edit-wrap + .a-msg { margin-top: 8px; }

/* Compaction divider — a full-width separator marking where the daemon
   compacted the context. Prior turns above it are untouched; clicking the
   label opens the summary in the right-side panel. */
.compact-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  align-self: stretch;
  width: 100%;
  margin: var(--chat-section-gap) 0 0;
}
.chat > .compact-divider:first-child {
  margin-top: 0;
}
.cd-line {
  flex: 1;
  height: 1px;
  background: var(--line);
}
.cd-label {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 80%;
  font-size: var(--text-base);
  color: var(--muted);
  white-space: nowrap;
}
.cd-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  font-size: var(--text-base);
  color: var(--muted);
}
.cd-view { color: var(--color-accent); }
.cd-btn:hover .cd-view { text-decoration: underline; }

/* Assistant message → left-aligned plain column, no role label */
.a-msg {
  align-self: flex-start;
  max-width: 94%;
  width: 94%;
}
.a-msg-ft {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 8px;
  height: auto;
  margin-top: var(--chat-block-gap);
  overflow: visible;
}

/* Copy button — icon-only, shares the undo button's muted→hover style so the
   message-stream action buttons (copy / undo) all read as one family. */
.a-cpbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 5px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--muted);
  font: inherit;
  font-size: var(--text-base);
  line-height: 1;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.12s, color 0.12s, background-color 0.12s;
  min-height: 22px;
  box-sizing: border-box;
}
.a-cpbtn:hover {
  opacity: 1;
  color: var(--color-accent);
  background: var(--hover);
}
.a-cpbtn svg {
  display: block;
  flex: none;
}
/* Touch devices: always show the copy buttons (no hover to reveal them) and
   give the bubble-layout button a comfortable tap size. */
@media (hover: none) {
  .a-msg-ft {
    height: auto;
    margin-top: var(--chat-block-gap);
    opacity: 1;
    pointer-events: auto;
  }
  .a-cpbtn {
    font-size: var(--ui-font-size-sm);
    padding: 8px 10px;
    margin: -4px -6px;
  }
}
.a-msg .msg {
  font-size: var(--ui-font-size);
  line-height: 1.6;
  color: var(--color-text);
  font-weight: 500;
}
.a-msg .msg :deep(p) { margin: 0; }
.a-msg .msg :deep(p + p) { margin-top: 8px; }
/* ChatPane owns block spacing; child components own only their internal layout. */
.a-msg > .msg,
.a-msg > :deep(.think),
.a-msg > :deep(.tool-group),
.a-msg > :deep(.agent-card),
.a-msg > :deep(.agent-group),
.a-msg > :deep(.box),
.a-msg > :deep(.swarm-card),
.a-msg > :deep(.media-tool) {
  margin-top: var(--chat-block-gap);
}
.a-msg > .msg:first-child,
.a-msg > :deep(.think:first-child),
.a-msg > :deep(.tool-group:first-child),
.a-msg > :deep(.agent-card:first-child),
.a-msg > :deep(.agent-group:first-child),
.a-msg > :deep(.box:first-child),
.a-msg > :deep(.swarm-card:first-child),
.a-msg > :deep(.media-tool:first-child) {
  margin-top: 0;
}
.a-msg :deep(code) {
  font: .9em var(--font-mono);
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  color: var(--color-accent-hover);
}

/* ===================== Wide tables (desktop) ===================== */
/* 760px corresponds to --p-content-max. Container-query conditions cannot
   reference CSS custom properties directly. */
@container (min-width: 760px) {
  /* markstream's content-visibility:auto implies paint containment, which can
     clip a table that breaks out of the normal Markdown width. Disable it only
     for renderers that actually contain a table. Keep contain:layout intact. */
  .a-msg .msg :deep(.markstream-vue.markdown-renderer:has(.table-node-wrapper)) {
    content-visibility: visible;
  }

  /* Let a table grow naturally beyond the reading column, centred within the
     conversation pane. The first-stage overflow-x:auto continues to handle
     content wider than this wrapper. */
  .a-msg .msg :deep(.table-node-wrapper) {
    position: relative;
    left: 50%;
    width: max-content;
    min-width: 100%;
    max-width: min(
      var(--p-table-max),
      calc(100cqi - var(--space-5) - var(--space-5))
    ) !important;
    transform: translateX(-50%);
  }
}

/* Unified attachment chips (files / images / videos) above the bubble text —
   the chip itself is AttachmentChip; this is only the row layout. */
.u-atts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

/* NOTE: Chat/bubble styles live in src/style.css (global). Scoped `.u-bub`
   rules here did NOT win the cascade, so they were moved to the global sheet. */

/* Persistent provider failure and its one-click continuation. */
.failure-card {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: var(--chat-turn-gap);
  padding: 12px 14px;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  color: var(--color-text);
}
.failure-title { font-weight: var(--weight-medium); color: var(--color-danger); }
.failure-message { color: var(--color-text-muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.failure-resume {
  align-self: flex-start;
  padding: 5px 10px;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-danger);
  font: inherit;
  cursor: pointer;
}
.failure-resume:hover { background: var(--color-danger-soft); }

/* Sending placeholder */
.sending-placeholder {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
}
.retry-progress { color: var(--color-text-muted); font-size: var(--text-sm); }

/* Plugin command card (replaces expanded body; the shared style is reused by
   the plugin-command branch of the user bubble). */
.skill-act {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.skill-act-head {
  font-size: var(--ui-font-size-sm);
  font-weight: 500;
  color: var(--color-accent-hover);
  display: flex;
  align-items: center;
  gap: 6px;
}
.skill-act-arrow {
  color: var(--color-accent);
  font-size: var(--text-base);
}
.skill-act-args {
  font-size: var(--text-base);
  color: var(--muted);
  padding-left: 17px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Mobile font bump (+2px) */
@media (max-width: 640px) {
  .chat {
    box-sizing: border-box;
    width: 100%;
    padding: 14px max(12px, var(--safe-right)) 18px max(12px, var(--safe-left));
  }
  .u-bub {
    max-width: min(88%, calc(100vw - 52px));
  }
  .a-msg {
    width: 100%;
    max-width: 100%;
  }
  .u-bub .u-text,
  .a-msg .msg {
    font-size: var(--ui-font-size-xl);
  }
  .a-msg :deep(.md),
  .a-msg :deep(.markdown-renderer),
  .a-msg :deep(.code-block-container),
  .a-msg :deep(.diff-wrap),
  .a-msg :deep(pre) {
    max-width: 100%;
  }
  .a-msg :deep(.code-block-container pre),
  .a-msg :deep(.diff-pre) {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .a-msg :deep(.media-tool.mob) {
    width: min(44vw, 160px);
  }
  .cd-label {
    min-width: 0;
    max-width: calc(100% - 48px);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .u-edit-confirm {
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: calc(100vw - 28px);
  }
  .ts {
    font-size: var(--ui-font-size-sm);
  }
  .chat-empty-text,
  .chat-loading-text {
    font-size: var(--ui-font-size-lg);
  }
  .cd-label,
  .cd-btn {
    font-size: var(--ui-font-size);
  }
}

/* Top sentinel for lazy-loading older messages */
.top-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0;
  min-height: 28px;
}
.top-sentinel-loading {
  opacity: 0.8;
}
.top-sentinel-btn {
  appearance: none;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  font-size: var(--ui-font-size-sm);
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.top-sentinel-btn:hover {
  color: var(--fg);
  border-color: var(--fg);
}
.top-sentinel-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: var(--ui-font-size-sm);
}

.chat { background: transparent; }
.chat {
  gap: 0;
  padding: 22px 20px 26px;
}
.u-bub {
  background: var(--color-accent-soft);
  border-color: var(--color-accent-bd);
  border-radius: var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl);
  padding: 11px 15px;
  box-shadow: var(--shc);
}
.a-msg {
  max-width: 100%;
  width: 100%;
}

/* ---- Inline queue: pending user messages at the tail of the transcript ----
   Reuses .u-turn / .u-bub so the pending bubbles sit in the same right-aligned
   column as real user turns; the .q-bub modifier swaps in a lower-emphasis
   "not yet sent" treatment (surface fill + dashed border). */
.chat > .q-stack {
  margin-top: var(--chat-turn-gap);
}
.chat > .q-stack:first-child {
  margin-top: 0;
}
.q-stack {
  align-self: flex-end;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.q-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 6px;
  color: var(--color-text-faint);
  font-size: var(--ui-font-size-xs);
}
.q-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.q-title b {
  color: var(--color-accent-hover);
  font-weight: var(--weight-medium);
}
.q-hint {
  color: var(--color-text-faint);
}
.q-turn {
  position: relative;
}
.q-bub {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  background: var(--color-surface-raised);
  border: 1px dashed var(--color-accent-bd);
  padding: 8px 8px 8px 6px;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.q-bub:hover {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.q-grip {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: 2px;
  color: var(--color-text-faint);
  cursor: grab;
  opacity: 0.7;
}
.q-grip:hover {
  opacity: 1;
}
.q-grip:active {
  cursor: grabbing;
}
.q-body {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  opacity: 0.82;
}
.q-bub:hover .q-body {
  opacity: 1;
}
.q-body:disabled {
  cursor: default;
}
.q-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.q-text-placeholder {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-muted);
}
.q-imgs {
  display: flex;
  gap: 4px;
  flex: none;
}
.q-img {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-line);
}
.q-file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-line);
  color: var(--color-text-muted);
  font-size: calc(var(--ui-font-size) - 3px);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.q-tag {
  flex: none;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-size: var(--ui-font-size-xs);
  font-weight: var(--weight-medium);
  line-height: 1.4;
  white-space: nowrap;
}
.q-tag-next {
  color: var(--color-accent-hover);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent-bd);
}
.q-tag-idx {
  color: var(--color-text-faint);
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-line);
}
.q-rm {
  flex: none;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-faint);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
}
.q-bub:hover .q-rm,
.q-bub:focus-within .q-rm,
.q-rm:focus-visible {
  opacity: 1;
}
.q-rm:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
/* Per-row actions (Steer / Send now) — compact text+icon buttons revealed on
   hover/focus, same reveal rhythm as the remove (×) button. */
.q-actions {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.q-bub:hover .q-actions,
.q-bub:focus-within .q-actions,
.q-actions:focus-within {
  opacity: 1;
}
.q-act {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 7px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--ui-font-size-xs);
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.q-act:hover {
  background: var(--color-accent-soft);
  color: var(--color-accent-hover);
}
/* Drag reorder: dim the row being dragged, show an insertion line on the target. */
.q-turn.q-dragging .q-bub {
  opacity: 0.45;
}
.q-turn.drop-before::before,
.q-turn.drop-after::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--color-accent);
  border-radius: var(--radius-full);
  z-index: 1;
}
.q-turn.drop-before::before {
  top: -5px;
}
.q-turn.drop-after::after {
  bottom: -5px;
}

</style>
