<!-- ChatDock.vue -->
<!-- Bottom dock that belongs to the chat tab: the work bar and the floating
     panels its pills open, running-task chips, pending question/approval cards,
     and the composer. Only rendered inside a chat-pane group so it never leaks
     into files/tasks/preview/btw panes. -->
<!-- Workbar (above the composer) is upstream's labelled pill row; each pill
     toggles the floating panel for its kind (DockWorkPanel), which carries the
     kind's body, its filter control and its own actions. The right-side
     multi-tab panel keeps its own strip and is reached from a panel's
     "Open in the side panel" action. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ActivationBadges, ApprovalBlock, ConversationStatus, FilePreviewRequest, PermissionMode, QueuedPromptView, TaskItem, TodoView, UIQuestion } from '../../types';
import type { AppGoal, AppModel, AppPlanEntry, AppSkill, QuestionResponse, ThinkingLevel } from '../../api/types';
import type { FileItem } from './MentionMenu.vue';
import type { PromptAttachment } from '../../composables/useKimiWebClient';
import type { DetachTaskTarget } from '../../lib/detachTarget';
import Composer from './Composer.vue';
import GoalPanel from './GoalPanel.vue';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import QuestionCard from './QuestionCard.vue';
import ApprovalCard from './ApprovalCard.vue';
import PlanPanel from './PlanPanel.vue';
import DockTaskList from './DockTaskList.vue';
import DockAgentGrid from './DockAgentGrid.vue';
import TodoCard from './TodoCard.vue';
import DockWorkPanel, { type DockPanelKind } from './DockWorkPanel.vue';
import Icon from '../ui/Icon.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import IconButton from '../ui/IconButton.vue';
import { bareDuration } from '../../lib/bareDuration';
import { BASH_FILTERS, type BashFilter } from '../../lib/bashTaskFilter';
import { SUBAGENT_FILTERS, type SubagentFilter } from '../../lib/subagentFilter';

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
  /** Reveal the right panel on whatever it is already showing (the Plan panel's
   *  "open in the side panel" — those two lists have no tab of their own). */
  'show-panel': [];
  /** A task row was clicked — open that task's own pane in the side panel. */
  openAgent: [taskId: string];
}>();

const { t } = useI18n();
const { confirm } = useConfirmDialog();

/** Work-bar plan pill meta: the latest plan's review outcome label, e.g.
 *  "Approved" — empty while the review is still pending. */
const planReviewLabel = computed<string>(() => {
  const state = props.planEntry?.review?.state;
  return state ? t(`tools.plan.review.${state}`) : '';
});

/** The goal's status word ("Active", "Paused", …) — the text the pill carries
 *  beside its "Goal" label, coloured by the state. */
const goalStatus = computed<string>(() => {
  switch (props.goal?.status) {
    case 'active': return t('status.goalStatusActive');
    case 'paused': return t('status.goalStatusPaused');
    case 'blocked': return t('status.goalStatusBlocked');
    case 'complete': return t('status.goalStatusComplete');
    default: return '';
  }
});

/** Panel head meta: the goal's wall-clock time in upstream's bare units
 *  ("12m34s"), straight off the snapshot — upstream does not tick it. */
const goalElapsed = computed<string>(() =>
  props.goal ? bareDuration(props.goal.wallClockMs / 1000) : '',
);

/** The goal pill's full label ("Goal Active") — upstream repeats this string in
 *  the aria-label, where the visible status word is the accessible name. */
const goalPillLabel = computed<string>(() =>
  `${t('status.goalLabel')} ${goalStatus.value}`.trim(),
);
const composerRef = ref<{
  loadForEdit: (value: string) => boolean;
  loadAttachmentsForEdit: (atts: { fileId?: string; kind: 'image' | 'video' | 'file'; url: string; name?: string }[]) => void;
  focus: () => void;
  openModelMenu: () => void;
  openPermissionMenu: () => void;
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

function openModelMenu(): void {
  composerRef.value?.openModelMenu();
}

function openPermissionMenu(): void {
  composerRef.value?.openPermissionMenu();
}

// Plan is the one entry that has no matching right-panel tab today. Keep the
// popover panel for it; the rest of the chips have a corresponding right-panel
// tab and toggle it open via `open-right-panel`.
const openPanel = ref<DockPanelKind | null>(null);
const panelOriginX = ref(0);
const panelRef = ref<InstanceType<typeof DockWorkPanel> | null>(null);
// The panel's root node: a component ref resolves to the instance, and the
// outside-mousedown test below needs the element.
const panelEl = computed<HTMLElement | null>(() => {
  const el = panelRef.value?.$el;
  return el instanceof HTMLElement ? el : null;
});
// Upstream's `has-popup` marks the dock while any of its popups is up, the
// composer's own menus included.
const composerPopup = ref(false);

/** The same pill toggles its panel shut; another pill swaps the body. The panel
 *  grows from the clicked pill, so its centre is read off the button here —
 *  upstream's `transform-origin`. */
function togglePanel(kind: DockPanelKind, event?: MouseEvent): void {
  if (openPanel.value === kind) {
    openPanel.value = null;
    return;
  }
  const pill = (event?.currentTarget ?? null) as HTMLElement | null;
  if (pill) panelOriginX.value = pill.offsetLeft + pill.offsetWidth / 2;
  openPanel.value = kind;
}

/** The composer's Goal row on an active goal — upstream's `focusGoal`, which
 *  reveals the goal panel rather than the user's own click. */
function openGoalPanel(): void {
  if (props.goal) openPanel.value = 'goal';
}

// A goal that ends (or is cancelled) while its panel is up leaves the panel
// with nothing to show; upstream drops the dock panel with the goal.
watch(
  () => props.goal,
  (goal) => {
    if (!goal && openPanel.value === 'goal') openPanel.value = null;
  },
);

/** Cancel asks first, as upstream's does: the engine cannot resume it after. */
async function cancelGoal(): Promise<void> {
  const confirmed = await confirm({
    title: t('status.goalCancel'),
    message: t('status.goalCancelConfirm'),
    confirmLabel: t('status.goalCancelConfirmYes'),
    cancelLabel: t('status.goalCancelConfirmNo'),
    variant: 'danger',
  });
  if (confirmed) emit('controlGoal', 'cancel');
}

function onDocumentMouseDown(event: MouseEvent): void {
  const target = event.target as Node | null;
  if (!target) return;
  if (panelEl.value?.contains(target)) return;
  if (workbarRef.value?.contains(target)) return;
  openPanel.value = null;
}

watch(
  () => openPanel.value,
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

defineExpose({ loadForEdit, loadAttachmentsForEdit, focus, openModelMenu, openPermissionMenu });

interface WorkbarEntry {
  id: DockPanelKind;
  /** Upstream's own glyphs: the target mark for Goal, a filled pencil for Plan,
      a terminal-in-a-box for Bash, its agent mark for Background Agent, and the
      shared list-lines for Progress. */
  icon: 'target' | 'pencil-filled' | 'terminal-filled' | 'agent-filled' | 'list-lines';
  /** Visible pill text. Upstream spells the pill out and repeats the string in
      its aria-label with the chip appended ("Bash 1 running"), so the label is
      the accessible name rather than an "Open …" verb. */
  label: string;
  ariaLabel: string;
  visible: boolean;
  active: boolean;
  /** `running` renders the accent dot beside the count; `count` is plain text
      (todo progress, "1/3"). A pill with neither shows only its label. */
  chip?: { kind: 'running' | 'count'; text: string };
  /** The goal pill's status word, in its own span so the word carries the
      state's colour (`dw-goal-status--<state>`) rather than the whole pill. */
  status?: { state: AppGoal['status']; word: string };
  /** The panel head's state text ("1 running", "1/3", "Pending review"); the
      pill carries the same state as its numeric chip. */
  meta?: string;
}

const workbarEntries = computed<WorkbarEntry[]>(() => [
  {
    id: 'goal',
    icon: 'target',
    label: t('status.goalLabel'),
    ariaLabel: goalPillLabel.value,
    visible: !!props.goal,
    active: openPanel.value === 'goal',
    status: props.goal ? { state: props.goal.status, word: goalStatus.value } : undefined,
    meta: goalElapsed.value,
  },
  {
    id: 'plan',
    icon: 'pencil-filled',
    label: t('tasks.dockPlan'),
    ariaLabel: t('tasks.dockPlan'),
    visible: props.planMode || !!props.planEntry,
    active: openPanel.value === 'plan',
    meta: planReviewLabel.value || undefined,
  },
  {
    id: 'bash',
    icon: 'terminal-filled',
    label: t('tasks.dockBash'),
    ariaLabel: props.bashRunning > 0
      ? `${t('tasks.dockBash')} ${t('tasks.dockRunning', { n: props.bashRunning })}`
      : t('tasks.dockBash'),
    visible: props.bashTasks.length > 0,
    active: openPanel.value === 'bash',
    chip: props.bashRunning > 0 ? { kind: 'running', text: `${props.bashRunning}` } : undefined,
    meta: props.bashRunning > 0 ? t('tasks.dockRunning', { n: props.bashRunning }) : undefined,
  },
  {
    id: 'subagents',
    icon: 'agent-filled',
    label: t('tasks.dockSubagent'),
    ariaLabel: props.subagentRunning > 0
      ? `${t('tasks.dockSubagent')} ${t('tasks.dockRunning', { n: props.subagentRunning })}`
      : t('tasks.dockSubagent'),
    visible: props.subagentTasks.length > 0,
    active: openPanel.value === 'subagents',
    chip: props.subagentRunning > 0 ? { kind: 'running', text: `${props.subagentRunning}` } : undefined,
    meta: props.subagentRunning > 0 ? t('tasks.dockRunning', { n: props.subagentRunning }) : undefined,
  },
  {
    id: 'todos',
    icon: 'list-lines',
    label: t('tasks.dockProgress'),
    ariaLabel: `${t('tasks.dockProgress')} ${props.todoDoneCount}/${props.todos?.length ?? 0}`,
    visible: (props.todos?.length ?? 0) > 0,
    active: openPanel.value === 'todos',
    chip: { kind: 'count', text: `${props.todoDoneCount}/${props.todos?.length ?? 0}` },
    meta: `${props.todoDoneCount}/${props.todos?.length ?? 0}`,
  },
]);

const panelEntry = computed(() => workbarEntries.value.find((entry) => entry.id === openPanel.value));

// The head's Recent / Running / Done / All control — upstream keeps it in the
// panel head and hides the pane's own copy.
const bashFilter = ref<BashFilter>('recent');const bashFilterOptions = computed(() =>
  BASH_FILTERS.map((filter) => ({ value: filter.value, label: t(filter.labelKey), icon: filter.icon })),
);

// Both kinds carry the same control upstream; only its shape changes, and that
// follows the space the panel has, not the kind: a segmented control while the
// panel is wide, the same options behind a dropdown trigger when it is compact.
const subagentFilter = ref<SubagentFilter>('active');
const subagentFilterOptions = computed(() =>
  SUBAGENT_FILTERS.map((filter) => ({ value: filter.value, label: t(filter.labelKey), icon: filter.icon })),
);

const filterCompact = computed(() => props.mobile === true);
const panelFilter = computed(() => {
  if (!filterCompact.value) return undefined;
  if (openPanel.value === 'bash') return { value: bashFilter.value, options: bashFilterOptions.value };
  if (openPanel.value === 'subagents') return { value: subagentFilter.value, options: subagentFilterOptions.value };
  return undefined;
});

function setPanelFilter(value: string): void {
  if (openPanel.value === 'bash') bashFilter.value = value as BashFilter;
  else if (openPanel.value === 'subagents') subagentFilter.value = value as SubagentFilter;
}

/** Upstream keeps no bash/todos tab in the right panel — those lists live in the
 *  dock — so their "open in the side panel" action simply reveals the panel. */
function showPanel(): void {
  emit('show-panel');
}

/** A task row hands its task to the side panel and dismisses the dock panel, as
 *  upstream's row does (`closeDockPanel()` before `openAgentPanel(id)`). */
function openDockTask(taskId: string): void {
  openPanel.value = null;
  emit('openAgent', taskId);
}

function clickWorkbar(id: DockPanelKind, event?: MouseEvent): void {
  togglePanel(id, event);
}
</script>

<template>
  <div
    ref="dockRef"
    class="chat-dock"
    :class="[
      mobile ? ['align-mobile', 'pills-compact'] : 'align-center',
      {
        'has-popup': openPanel !== null || composerPopup,
        'has-approval': pendingApproval !== undefined && pendingQuestion === undefined,
        'has-question': pendingQuestion !== undefined,
      },
    ]"
    @click.stop
  >
    <div v-if="hasDockWork" ref="workbarRef" class="dock-workbar">
      <button
        v-for="entry in workbarEntries"
        v-show="entry.visible"
        :key="entry.id"
        type="button"
        class="ui-pill"
        :class="{ 'is-active': entry.active }"
        :data-dock-panel="entry.id"
        :aria-label="entry.ariaLabel"
        :aria-pressed="entry.active"
        @click="clickWorkbar(entry.id, $event)"
      >
        <Icon :name="entry.icon" size="md" />
        <span>{{ entry.label }} </span>
        <span
          v-if="entry.status"
          class="dw-goal-status"
          :class="`dw-goal-status--${entry.status.state}`"
        >{{ entry.status.word }}</span>
        <span v-if="entry.chip" :class="entry.chip.kind === 'running' ? 'dw-running' : 'dw-count'">
          <span v-if="entry.chip.kind === 'running'" class="kw-dot kw-dot--running" aria-hidden="true" />
          {{ entry.chip.text }}
        </span>
      </button>
      <Transition name="dock-panel">
        <DockWorkPanel
          v-if="openPanel && panelEntry"
          ref="panelRef"
          :kind="openPanel"
          :title="panelEntry.label"
          :icon="panelEntry.icon"
          :meta="panelEntry.meta"
          :origin-x="panelOriginX"
          :dropdown="panelFilter"
          @update:dropdown="setPanelFilter"
          @click.stop
        >
          <template v-if="openPanel === 'bash' && !filterCompact" #filter>
            <SegmentedControl v-model="bashFilter" :options="bashFilterOptions" size="md" />
          </template>
          <template v-else-if="openPanel === 'subagents' && !filterCompact" #filter>
            <SegmentedControl v-model="subagentFilter" :options="subagentFilterOptions" size="md" />
          </template>
          <template v-else-if="openPanel === 'plan'" #actions>
            <IconButton size="sm" :label="t('tasks.openPanel')" @click="showPanel()">
              <Icon name="panel-right" size="sm" />
            </IconButton>
            <IconButton size="sm" :label="t('tasks.closePanel')" @click="openPanel = null">
              <Icon name="close" size="sm" />
            </IconButton>
          </template>

          <template v-else-if="openPanel === 'goal' && goal" #actions>
            <IconButton
              v-if="goal.status === 'active'"
              size="sm"
              :label="t('status.goalPause')"
              @click="emit('controlGoal', 'pause')"
            >
              <Icon name="pause" size="sm" />
            </IconButton>
            <IconButton
              v-if="goal.status === 'paused' || goal.status === 'blocked'"
              size="sm"
              :label="t('status.goalResume')"
              @click="emit('controlGoal', 'resume')"
            >
              <Icon name="play" size="sm" />
            </IconButton>
            <IconButton size="sm" :label="t('status.goalCancel')" @click="cancelGoal()">
              <Icon name="stop" size="sm" />
            </IconButton>
            <IconButton size="sm" :label="t('tasks.closePanel')" @click="openPanel = null">
              <Icon name="close" size="sm" />
            </IconButton>
          </template>

          <DockTaskList
            v-if="openPanel === 'bash'"
            :tasks="bashTasks"
            :filter="bashFilter"
            @open="openDockTask($event)"
            @stop="emit('cancelTask', $event)"
          />
          <DockAgentGrid
            v-else-if="openPanel === 'subagents'"
            :tasks="subagentTasks"
            :filter="subagentFilter"
            @cancel="emit('cancelTask', $event)"
            @open="emit('openAgent', $event)"
          />
          <TodoCard v-else-if="openPanel === 'todos'" :todos="todos ?? []" />
          <GoalPanel
            v-else-if="openPanel === 'goal' && goal"
            :goal="goal"
            :open-file="openFile"
          />
          <PlanPanel
            v-else
            :plan="planEntry ?? null"
            :plan-mode="planMode"
            :open-file="openFile"
          />
        </DockWorkPanel>
      </Transition>
    </div>

    <QuestionCard
      v-if="pendingQuestion"
      :key="pendingQuestion.questionId"
      class="dock-question"
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
      :open-file="openFile"
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
      @focus-goal="openGoalPanel()"
      @focus-swarm="emit('focusSwarm')"
      @compact="emit('compact')"
      @pick-model="emit('pickModel')"
      @select-model="emit('selectModel', $event)"
      @popup="composerPopup = $event"
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
/* The transcript's foot fade lives on the pane in `ConversationPane.vue`, not
   here: it is a mask on the scroller, so it is anchored to the pane's foot
   rather than to this dock's box. This dock paints no vignette of its own. */
.chat-dock.align-center { margin-left: auto; margin-right: auto; }
.chat-dock.align-left { margin-left: 0; margin-right: auto; }
.chat-dock.align-mobile { max-width: none; }

/* Icon-only workbar squares above the composer. Each square is a small
   pill replacing the old labeled work pills. Upstream class `ptb-` is kept
   for parity with the screenshot evidence. */
.dock-workbar {
  position: relative;
  display: flex;
  align-items: center;
  /* Upstream's own geometry for this row: its chips start 16px inside the
     composer card's left edge (`--space-4` on top of the dock's own inset),
     rather than flush with it, and the row wraps (its declaration, without
     which the labelled chips spill past the card's right edge between 641px
     and 920px). */
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px calc(var(--dock-inline-right) + var(--space-4)) 2px calc(var(--dock-inline-left) + var(--space-4));
}

/* Dock pills. Upstream's container is the same `dock-workbar`, but its children
   are labelled `button.ui-pill`s, not icon squares: the label is visible text and
   the state is a chip beside it (`dw-running` with the accent dot for a running
   count, `dw-count` for plain text such as "1/3"). Geometry, typography and
   material are upstream's own: radius `--radius-dock-pill`, padding
   `--space-1` / `--space-2`, base font size on upstream's 1.42 line box, the
   icon at `--p-ic-dock`, and a `--color-hover` fill that also carries hover and
   the active pill through the `::after` overlay. */
.dock-workbar .ui-pill {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  padding: var(--space-1) var(--space-2);
  border: none;
  border-radius: var(--radius-dock-pill);
  background: var(--color-hover);
  -webkit-backdrop-filter: var(--p-menu-backdrop);
  backdrop-filter: var(--p-menu-backdrop);
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: var(--weight-regular);
  line-height: round(calc(var(--text-base) * 1.42), 1px);
  white-space: nowrap;
  cursor: pointer;
  transition:
    color var(--duration-base) var(--ease-out),
    transform var(--duration-spring-responsive) var(--spring-responsive);
}
.dock-workbar .ui-pill > svg {
  width: var(--p-ic-dock);
  height: var(--p-ic-dock);
  color: inherit;
}
/* Phone: upstream keeps the same pills and hides the text, leaving a 37px icon
   button whose label survives in the aria-label. */
.chat-dock.pills-compact .dock-workbar .ui-pill {
  padding: var(--space-2);
}
.chat-dock.pills-compact .dock-workbar .ui-pill > span {
  display: none;
}
.dock-workbar .ui-pill::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius-dock-pill);
  background: var(--color-hover);
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
  pointer-events: none;
}
.dock-workbar .ui-pill:hover:not(:disabled)::after,
.dock-workbar .ui-pill.is-active::after {
  opacity: 1;
}
.dock-workbar .ui-pill:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
.dock-workbar .ui-pill .dw-running {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  color: var(--color-text);
}
.dock-workbar .ui-pill .dw-count {
  color: var(--color-text-muted);
}
.dock-workbar .ui-pill.is-active .dw-running,
.dock-workbar .ui-pill.is-active .dw-count {
  color: inherit;
}
/* The goal pill's status word carries the state's colour — the pill itself
   stays upstream-neutral. */
.dock-workbar .dw-goal-status--active {
  color: var(--color-success);
}
.dock-workbar .dw-goal-status--paused {
  color: var(--color-warning);
}
.dock-workbar .dw-goal-status--blocked {
  color: var(--color-danger);
}
.kw-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--color-text-faint);
}
.kw-dot--running {
  position: relative;
  background: var(--color-accent);
}
.kw-dot--running::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 40%, transparent);
  animation: kw-dot-pulse 1.4s var(--ease-out) infinite;
}
@keyframes kw-dot-pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }

  to {
    transform: scale(2.7);
    opacity: 0;
  }
}

/* The dock panel animates in from its pill: upstream names the transition
   `dock-panel` and captures it mid-flight as `dock-panel-enter-from`. */
.dock-panel-enter-active,
.dock-panel-leave-active {
  transition:
    opacity var(--duration-spring-gentle) var(--spring-gentle),
    transform var(--duration-spring-responsive) var(--spring-responsive);
}
.dock-panel-enter-from,
.dock-panel-leave-to {
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
</style>
