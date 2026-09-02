<!-- ChatDock.vue -->
<!-- Bottom dock that belongs to the chat tab: goal strip, running-task chips,
     pending question/approval cards, and the composer. Only rendered inside a
     chat-pane group so it never leaks into files/tasks/preview/btw panes. -->
<!-- Workbar (above the composer) is now an icon-only square row that opens a
     tab in the right-side multi-tab panel (RightPanelTabs). Tabs that have no
     matching panel (e.g. plan) still pop over a dock-style inline panel. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ActivationBadges, ApprovalBlock, ConversationStatus, FilePreviewRequest, PermissionMode, QueuedPromptView, TaskItem, TodoView, UIQuestion } from '../../types';
import type { AppGoal, AppModel, AppPlanEntry, AppSkill, QuestionResponse, ThinkingLevel } from '../../api/types';
import type { FileItem } from './MentionMenu.vue';
import type { PromptAttachment } from '../../composables/useKimiWebClient';
import type { DetachTaskTarget } from '../../lib/detachTarget';
import type { RightPanelTab } from '../../lib/rightPanelTabs';
import Composer from './Composer.vue';
import GoalStrip from './GoalStrip.vue';
import { useGlassRefraction } from '../../composables/useGlassRefraction';
import QuestionCard from './QuestionCard.vue';
import ApprovalCard from './ApprovalCard.vue';
import PlanPanel from './PlanPanel.vue';
import Icon from '../ui/Icon.vue';
import Tooltip from '../ui/Tooltip.vue';

const props = defineProps<{
  sessionId?: string;
  running?: boolean;
  /** True while the empty-composer first prompt is being created + submitted.
   *  Covers the gap where draft-session creation already selected the new
   *  session (empty state → dock) before the first prompt is submitted. */
  starting?: boolean;
  queued?: QueuedPromptView[];
  searchFiles?: (q: string) => Promise<FileItem[]>;
  uploadImage?: (file: Blob, name?: string) => Promise<{ fileId: string; name: string; mediaType: string } | null>;
  status: ConversationStatus;
  thinking?: ThinkingLevel;
  planMode?: boolean;
  planArmed?: boolean;
  swarmMode?: boolean;
  goalMode?: boolean;
  activationBadges?: ActivationBadges;
  models?: AppModel[];
  starredIds?: string[];
  skills?: AppSkill[];
  goal?: AppGoal | null;
  goalLive?: { elapsedMs: number; turnsUsed: number; tokensTotal: number } | null;
  goalExpandSignal?: number;
  /** Active right-panel tab (when the panel is open); the workbar mirrors it
   *  for its `is-active` styling. */
  activePanelTab?: RightPanelTab | null;
  bashTasks: TaskItem[];
  subagentTasks: TaskItem[];
  /** Latest ExitPlanMode plan entry of the active session — the plan viewer
   *  panel renders it; the work-bar plan pill appears while plan mode is on or
   *  a plan exists. */
  planEntry?: AppPlanEntry | null;
  openFile?: (target: FilePreviewRequest) => void;
  bashRunning: number;
  subagentRunning: number;
  todoDoneCount: number;
  hasDockWork: boolean;
  changedFiles: string[];
  todos?: TodoView[];
  pendingQuestion?: UIQuestion;
  /** Action kind in flight for the visible question (drives loading state). */
  questionBusyKind?: 'answer' | 'dismiss';
  pendingApproval?: { approvalId: string; block: ApprovalBlock; agentName?: string };
  /** True while the visible approval has a respond in flight. */
  approvalBusy?: boolean;
  mobile?: boolean;
}>();

const emit = defineEmits<{
  submit: [payload: { text: string; attachments: PromptAttachment[] }];
  steer: [payload: { text: string; attachments: PromptAttachment[] }];
  command: [cmd: string, attachments?: PromptAttachment[]];
  interrupt: [];
  setPermission: [mode: PermissionMode];
  setThinking: [level: ThinkingLevel];
  togglePlan: [];
  togglePlanArmed: [];
  toggleSwarm: [];
  toggleGoal: [];
  openBtw: [];
  createGoal: [objective: string];
  controlGoal: [action: 'pause' | 'resume' | 'cancel'];
  focusGoal: [];
  focusSwarm: [];
  compact: [];
  pickModel: [];
  selectModel: [modelId: string];
  answer: [questionId: string, response: QuestionResponse];
  dismiss: [questionId: string];
  approval: [approvalId: string, response: { decision: 'approved' | 'rejected' | 'cancelled'; scope?: 'session'; feedback?: string; selectedLabel?: string }];
  cancelTask: [taskId: string];
  /** Send a running foreground bash task row to the background. */
  detachTask: [target: DetachTaskTarget];
  /** Open the right panel on the given tab. When the tab is the same as the
   *  active tab, the caller treats this as a toggle (close the panel). */
  'open-right-panel': [tab: RightPanelTab];
  /** A background subagent chip was clicked — open its live detail panel. */
  openAgent: [taskId: string];
}>();

const { t } = useI18n();

/** Work-bar plan pill meta: the latest plan's review outcome label, e.g.
 *  "Approved" — empty while the review is still pending. */
const planReviewLabel = computed<string>(() => {
  const state = props.planEntry?.review?.state;
  return state ? t(`tools.plan.review.${state}`) : '';
});
const composerRef = ref<{
  loadForEdit: (value: string) => boolean;
  loadAttachmentsForEdit: (atts: { fileId?: string; kind: 'image' | 'video' | 'file'; url: string; name?: string }[]) => void;
  focus: () => void;
} | null>(null);
const workbarRef = ref<HTMLElement | null>(null);
const dockRef = ref<HTMLElement | null>(null);

function loadForEdit(value: string): boolean {
  // The nested Composer is only rendered in ChatDock's v-else — when a pending
  // question or approval is shown it is unmounted, so report unavailability so
  // the caller doesn't dequeue a prompt it can't actually load.
  if (!composerRef.value) return false;
  composerRef.value.loadForEdit(value);
  return true;
}

function loadAttachmentsForEdit(atts: { fileId?: string; kind: 'image' | 'video' | 'file'; url: string; name?: string }[]): void {
  composerRef.value?.loadAttachmentsForEdit(atts);
}

function focus(): void {
  composerRef.value?.focus();
}

// Plan is the one entry that has no matching right-panel tab today. Keep the
// popover panel for it; the rest of the chips have a corresponding right-panel
// tab and toggle it open via `open-right-panel`.
const showPlanPopover = ref(false);
const planPopoverRef = ref<HTMLElement | null>(null);
// WebGL rim-refraction fallback (Firefox/Safari). Registered transient (the
// composable's default, like ui/Menu): this pop closes on any outside
// mousedown, so freezing the shared page snapshot while it is up is exactly
// the menu behaviour the flag exists for. The element is v-if'd, so its ref
// appearing/disappearing is the mount signal.
useGlassRefraction(planPopoverRef);

function togglePlanPopover(): void {
  showPlanPopover.value = !showPlanPopover.value;
}


function onDocumentMouseDown(event: MouseEvent): void {
  const target = event.target as Node | null;
  if (!target) return;
  if (planPopoverRef.value?.contains(target)) return;
  if (workbarRef.value?.contains(target)) return;
  showPlanPopover.value = false;
}

watch(
  () => showPlanPopover.value,
  (open) => {
    if (typeof document === 'undefined') return;
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    if (open) document.addEventListener('mousedown', onDocumentMouseDown, true);
  },
);

let dockResizeObserver: ResizeObserver | null = null;

function publishDockHeight(): void {
  // Border-box height of the dock, exposed so fixed overlays (e.g. toasts) can
  // anchor just above the composer. offsetHeight includes the dock's own
  // safe-area padding, so consumers don't need to add safe-bottom again.
  const height = dockRef.value?.offsetHeight ?? 0;
  document.documentElement.style.setProperty('--dock-h', `${height}px`);
}

onMounted(() => {
  if (typeof ResizeObserver !== 'function' || !dockRef.value) return;
  dockResizeObserver = new ResizeObserver(publishDockHeight);
  dockResizeObserver.observe(dockRef.value);
  publishDockHeight();
});

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
  }
  dockResizeObserver?.disconnect();
  dockResizeObserver = null;
});

defineExpose({ loadForEdit, loadAttachmentsForEdit, focus });

interface WorkbarEntry {
  id: RightPanelTab | 'plan';
  icon: 'clock' | 'sparkles' | 'check-list' | 'file-edit' | 'file-text' | 'target';
  labelKey: string;
  ariaLabel: string;
  visible: boolean;
  active: boolean;
  badge?: string;
}

const workbarEntries = computed<WorkbarEntry[]>(() => [
  {
    id: 'bash',
    icon: 'clock',
    labelKey: 'panel.tabs.bash',
    ariaLabel: t('panel.workbarLabel', { name: t('panel.tabs.bash') }),
    visible: props.bashTasks.length > 0,
    active: props.activePanelTab === 'bash',
    badge: props.bashTasks.length > 0 ? `${props.bashTasks.length}` : undefined,
  },
  {
    id: 'subagents',
    icon: 'sparkles',
    labelKey: 'panel.tabs.subagents',
    ariaLabel: t('panel.workbarLabel', { name: t('panel.tabs.subagents') }),
    visible: props.subagentTasks.length > 0,
    active: props.activePanelTab === 'subagents',
    badge: props.subagentTasks.length > 0 ? `${props.subagentTasks.length}` : undefined,
  },
  {
    id: 'todos',
    icon: 'check-list',
    labelKey: 'panel.tabs.todos',
    ariaLabel: t('panel.workbarLabel', { name: t('panel.tabs.todos') }),
    visible: (props.todos?.length ?? 0) > 0,
    active: props.activePanelTab === 'todos',
    badge: (props.todos?.length ?? 0) > 0 ? `${props.todoDoneCount}/${props.todos?.length ?? 0}` : undefined,
  },
  {
    id: 'plan',
    icon: 'target',
    labelKey: 'panel.tabs.todos',
    ariaLabel: t('panel.workbarLabel', { name: t('tasks.dockPlan') }),
    visible: props.planMode || !!props.planEntry,
    active: false,
    badge: planReviewLabel.value ? `· ${planReviewLabel.value}` : undefined,
  },
  {
    id: 'changes',
    icon: 'file-text',
    labelKey: 'panel.tabs.changes',
    ariaLabel: t('panel.workbarLabel', { name: t('panel.tabs.changes') }),
    visible: props.changedFiles.length > 0,
    active: props.activePanelTab === 'changes',
    badge: props.changedFiles.length > 0 ? `${props.changedFiles.length}` : undefined,
  },
]);

function clickWorkbar(id: RightPanelTab | 'plan'): void {
  if (id === 'plan') {
    togglePlanPopover();
    return;
  }
  emit('open-right-panel', id);
}
</script>

<template>
  <div ref="dockRef" class="chat-dock" :class="[mobile ? 'align-mobile' : 'align-center']" @click.stop>
    <GoalStrip
      v-if="goal"
      :goal="goal"
      :live="goalLive"
      :force-expanded="goalExpandSignal"
      @control-goal="emit('controlGoal', $event)"
    />
    <div v-if="hasDockWork" ref="workbarRef" class="dock-workbar">
      <Tooltip
        v-for="entry in workbarEntries"
        v-show="entry.visible"
        :key="entry.id"
        :text="entry.ariaLabel"
      >
        <button
          type="button"
          class="ptb- dock-square lg-band"
          :class="{ 'is-on': entry.active }"
          :aria-label="entry.ariaLabel"
          :aria-pressed="entry.active"
          @click="clickWorkbar(entry.id)"
        >
          <Icon :name="entry.icon" size="md" />
          <span v-if="entry.badge" class="dw-count">{{ entry.badge }}</span>
        </button>
      </Tooltip>
      <Transition name="dock-popover">
        <div
          v-if="showPlanPopover"
          ref="planPopoverRef"
          class="dock-plan-pop lg-glass lg-lens"
          @click.stop
        >
          <div class="dock-plan-head">
            <span class="dock-plan-title">{{ t('tasks.dockPlan') }}<template v-if="planReviewLabel"> · {{ planReviewLabel }}</template></span>
          </div>
          <div class="dock-plan-body">
            <PlanPanel
              :plan="planEntry ?? null"
              :plan-mode="planMode"
              :open-file="openFile"
            />
          </div>
        </div>
      </Transition>
    </div>

    <QuestionCard
      v-if="pendingQuestion"
      :key="pendingQuestion.questionId"
      :question="pendingQuestion"
      :busy-kind="questionBusyKind"
      @answer="(qid, resp) => emit('answer', qid, resp)"
      @dismiss="emit('dismiss', $event)"
    />
    <ApprovalCard
      v-else-if="pendingApproval"
      :key="pendingApproval.approvalId"
      class="dock-approval"
      :class="{ 'plan-approval': pendingApproval.block.kind === 'plan_review' }"
      :block="pendingApproval.block"
      :agent-name="pendingApproval.agentName"
      :busy="approvalBusy"
      @decide="emit('approval', pendingApproval.approvalId, $event)"
    />
    <Composer
      v-else
      ref="composerRef"
      :session-id="sessionId"
      :running="running"
      :queued="queued"
      :search-files="searchFiles"
      :upload-image="uploadImage"
      :status="status"
      :thinking="thinking"
      :plan-mode="planMode"
      :plan-armed="planArmed"
      :swarm-mode="swarmMode"
      :goal-mode="goalMode"
      :goal="goal"
      :activation-badges="activationBadges"
      :models="models"
      :starred-ids="starredIds"
      :skills="skills"
      :starting="starting"
      @submit="emit('submit', $event)"
      @steer="emit('steer', $event)"
      @command="(cmd, attachments) => emit('command', cmd, attachments)"
      @interrupt="emit('interrupt')"
      @set-permission="emit('setPermission', $event)"
      @set-thinking="emit('setThinking', $event)"
      @toggle-plan="emit('togglePlan')"
      @toggle-plan-armed="emit('togglePlanArmed')"
      @toggle-swarm="emit('toggleSwarm')"
      @toggle-goal="emit('toggleGoal')"
      @open-btw="emit('openBtw')"
      @create-goal="emit('createGoal', $event)"
      @control-goal="emit('controlGoal', $event)"
      @focus-goal="emit('focusGoal')"
      @focus-swarm="emit('focusSwarm')"
      @compact="emit('compact')"
      @pick-model="emit('pickModel')"
      @select-model="emit('selectModel', $event)"
    />
  </div>
</template>

<style scoped>
.chat-dock {
  --dock-inline-left: 16px;
  --dock-inline-right: 16px;
  box-sizing: border-box;
  width: 100%;
  max-width: calc(var(--read-max) + var(--panes-scrollbar-width, 0px));
  padding-right: var(--panes-scrollbar-width, 0px);
  flex: none;
  position: relative;
  background: var(--color-bg);
  z-index: var(--z-sticky);
}
.chat-dock.align-center { margin-left: auto; margin-right: auto; }
.chat-dock.align-left { margin-left: 0; margin-right: auto; }
.chat-dock.align-mobile { max-width: none; }

/* Liquid glass: drop the opaque background so the frost layer behind the
   dock (ConversationPane's .chat-main::after) shows through and the chips
   and composer read as embedded in one glass slab. Cards in the dock
   (question / approval / todo panel) carry their own backgrounds. */
html[data-liquid-glass="on"] .chat-dock.chat-dock {
  background: transparent;
}

/* Icon-only workbar squares above the composer. Each square is a small
   band-tier glass pill (.lg-band — 14px blur, embedded look) replacing the
   old labeled work pills. Upstream class `ptb-` is kept for parity with the
   screenshot evidence. */
.dock-workbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px var(--dock-inline-right) 2px var(--dock-inline-left);
}

.dock-square {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-surface) 55%, transparent);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    background var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-spring-responsive) var(--spring-responsive),
    transform var(--duration-spring-responsive) var(--spring-responsive);
}

/* Liquid-glass material for the squares — they carry .lg-band, so the shared
   band tier (14px blur + faint tint, no rim / dispersion / drop — they ride
   embedded in the chat-main::after frost slab) is painted by the consuming
   rule in style.css. These blocks only retarget the tint parameters per
   state; the solid look above still applies when the toggle is off. */
html[data-liquid-glass="on"] .dock-square.lg-band {
  --lg-tint-a: 10%;
  border-color: color-mix(in srgb, var(--color-line) 72%, transparent);
}
html[data-liquid-glass="on"] .dock-square.lg-band:hover:not(.is-on) {
  --lg-tint-a: 22%;
  /* re-assert the glass background over the solid :hover fallback below */
  background: var(--lg-bg);
  color: var(--color-text);
  transform: translateY(-1px);
}
.dock-square:hover:not(.is-on) {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}
.dock-square.is-on {
  background: color-mix(in srgb, var(--color-accent) 20%, transparent);
  color: var(--color-accent);
  border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-line));
}
html[data-liquid-glass="on"] .dock-square.lg-band.is-on {
  --lg-tint: color-mix(in srgb, var(--color-accent) 22%, transparent);
  --lg-tint-top: color-mix(in srgb, var(--color-accent) 16%, transparent);
  /* Re-assert the glass background: the solid .is-on rule above is a
     specificity tie against the shared consuming rule and would otherwise
     mask it. */
  background: var(--lg-bg);
  color: var(--color-accent);
  border-color: color-mix(in srgb, var(--color-accent) 50%, transparent);
}
.dock-square:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
.dock-square .dw-count {
  position: absolute;
  bottom: -3px;
  right: -3px;
  font-size: 9px;
  line-height: 1;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  padding: 2px 4px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  border: 1px solid var(--color-line);
  border-radius: 7px;
}
.dock-square.is-on .dw-count {
  color: var(--color-accent);
  border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-line));
}

/* Plan popover: only the plan chip lacks a matching right-panel tab today,
   so it pops a small glass card over the workbar instead of toggling a tab. */
.dock-plan-pop {
  position: absolute;
  left: var(--dock-inline-left);
  right: var(--dock-inline-right);
  bottom: calc(100% + 6px);
  z-index: var(--z-overlay);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 8px 10px;
  max-height: min(280px, 50vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dock-plan-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 6px 0;
  border-bottom: 1px solid var(--color-line);
}
.dock-plan-title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}
.dock-plan-body {
  padding-top: 6px;
  overflow-y: auto;
  min-height: 0;
}

.dock-popover-enter-active,
.dock-popover-leave-active {
  transition:
    opacity var(--duration-spring-gentle) var(--spring-gentle),
    transform var(--duration-spring-responsive) var(--spring-responsive);
}
.dock-popover-enter-from,
.dock-popover-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.dock-approval {
  margin-top: 8px;
}

/* Plan review expands above the bottom dock without changing its height, so
   work pills and the composer remain anchored to the window edge. */
.dock-approval.plan-approval {
  position: absolute;
  left: var(--dock-inline-left);
  right: var(--dock-inline-right);
  bottom: calc(100% + var(--space-2));
  z-index: var(--z-overlay);
  max-height: min(70vh, calc(100vh - var(--dock-h, 0px) - var(--space-4)));
  overflow-y: auto;
  margin: 0;
}

@media (max-width: 640px) {
  .chat-dock {
    /* Inline (landscape) safe-area lives here only; the inner composer /
       workbar read --dock-inline-* so the inset is applied exactly once. */
    --dock-inline-left: max(12px, var(--safe-left));
    --dock-inline-right: max(12px, var(--safe-right));
  }
}

.chat-dock:not(.align-mobile) :deep(.composer) {
  padding-bottom: 14px;
}

/* The plan chip's popover sits above the workbar like the old dock-work-panel,
   so on mobile we let it span the full dock width. */
@media (max-width: 640px) {
  .dock-plan-pop {
    left: 10px;
    right: calc(10px + var(--panes-scrollbar-width, 0px));
  }
}
</style>
