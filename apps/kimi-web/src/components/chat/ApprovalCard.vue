<!-- apps/kimi-web/src/components/chat/ApprovalCard.vue -->
<!-- The card the agent shows when a tool call needs a decision. Markup and
     metrics follow upstream's ApprovalCard: a flat raised card whose header is
     the kind's title plus the sub-agent badge, an optional peek line that
     replaces the body while minimized, an expand control for the scrollable
     kinds (diff / file / plan review) and the minimize control; a body per
     block kind (code well, shell command, chip, todo list, plan with its
     option rows, plain summary) and a footer whose buttons carry their number
     key. The fork's own behaviour is kept: inline feedback, the number-key
     shortcuts, plan options and the minimize state. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ApprovalBlock, FilePreviewRequest } from '../../types';
import type { ApprovalDecision } from '../../api/types';
import Markdown from './Markdown.vue';
import DiffLines from './DiffLines.vue';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import IconButton from '../ui/IconButton.vue';
import Icon from '../ui/Icon.vue';
import Spinner from '../ui/Spinner.vue';
import Textarea from '../ui/Textarea.vue';

const props = defineProps<{
  block: ApprovalBlock;
  agentName?: string;
  /** True while a decision for this approval is in flight. Drives the action
   *  buttons' loading/disabled state and blocks duplicate decisions. */
  busy?: boolean;
  /** Open a path in the right panel's file tab — the plan path's own action. */
  openFile?: (target: FilePreviewRequest) => void;
}>();

const emit = defineEmits<{
  decide: [response: { decision: ApprovalDecision; scope?: 'session'; feedback?: string; selectedLabel?: string }];
}>();

const { t } = useI18n();

interface PlanReviewView {
  plan: string;
  path?: string;
  options: { label: string; description?: string }[];
}

const planReview = computed<PlanReviewView | null>(() => {
  const b = props.block;
  if (b.kind !== 'plan_review') return null;
  return { plan: b.plan, path: b.path, options: b.options ?? [] };
});

// Temporarily collapse to a thin bar so the approval stops covering the chat
// while the user reads. The decision buttons + body return on expand.
const minimized = ref(false);

/** The header row collapses/expands the card while minimized (upstream's
 *  `.ah.clickable`). */
function expandIfMinimized(): void {
  if (minimized.value) minimized.value = false;
}

// Kinds whose body scrolls on its own get the expand toggle: expanded, the
// plan / code body takes the card's full height instead of its own cap.
const expandable = computed(() => {
  const kind = props.block.kind;
  return kind === 'plan_review' || kind === 'diff' || kind === 'file';
});
const expanded = ref(false);

// ---------------------------------------------------------------------------
// Title by kind
// ---------------------------------------------------------------------------

const titleKinds = ['shell', 'diff', 'file', 'fileop', 'url', 'search', 'invocation', 'todo', 'plan_review', 'generic'];

function title(): string {
  const kind = titleKinds.includes(props.block.kind) ? props.block.kind : 'generic';
  return t(`approval.title.${kind}`);
}

/** The one-line subject, shown in the header while minimized so the thin bar
 *  still says what it is about. */
const peek = computed<string>(() => {
  const b = props.block;
  switch (b.kind) {
    case 'diff':
    case 'file':
    case 'fileop':
      return b.path;
    case 'shell':
      return b.command;
    case 'url':
      return b.url;
    case 'search':
      return b.query;
    case 'invocation':
      return b.name;
    case 'generic':
      return b.summary;
    default:
      return '';
  }
});

// ---------------------------------------------------------------------------
// Scroll state: the card's top edge gets the fork's scroll fade once its own
// content has moved under it.
// ---------------------------------------------------------------------------

const cardEl = ref<HTMLElement | null>(null);
const scrolled = ref(false);
const planScrolled = ref(false);

function onScroll(): void {
  scrolled.value = (cardEl.value?.scrollTop ?? 0) > 0;
}
function onPlanScroll(): void {
  const wrap = cardEl.value?.querySelector<HTMLElement>('.body-plan-wrap');
  const body = cardEl.value?.querySelector<HTMLElement>('.body-plan');
  planScrolled.value = (wrap?.scrollTop ?? 0) > 0 || (body?.scrollTop ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Inline feedback
// ---------------------------------------------------------------------------

const feedbackOpen = ref(false);
const feedbackText = ref('');
const feedbackRef = ref<InstanceType<typeof Textarea> | null>(null);

/** Fit the feedback box to its content height. The resting height comes from
 *  `rows`, the upper bound from CSS `max-height`; once content outgrows the cap
 *  `overflow-y: auto` scrolls internally. */
function autosizeFeedback(): void {
  const el = feedbackRef.value?.$el;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function openFeedback(): void {
  if (props.busy) return;
  feedbackOpen.value = true;
  feedbackText.value = '';
  // Focus textarea next tick
  setTimeout(() => feedbackRef.value?.$el?.focus(), 0);
}

// The textarea mounts via v-if; whenever it appears (open, or re-expand after
// minimize) fit its height to the current text right away.
watch(feedbackOpen, (open) => {
  if (open) setTimeout(() => autosizeFeedback(), 0);
});

function submitFeedback(): void {
  if (props.busy) return;
  const fb = feedbackText.value.trim();
  if (planReview.value) {
    // Revise: keep plan mode active and pass optional feedback to the agent.
    act('feedback', { decision: 'rejected', selectedLabel: 'Revise', feedback: fb || undefined });
  } else {
    act('feedback', { decision: 'rejected', feedback: fb || undefined });
  }
  feedbackOpen.value = false;
  feedbackText.value = '';
}

function cancelFeedback(): void {
  feedbackOpen.value = false;
  feedbackText.value = '';
}

function onFeedbackKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitFeedback();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelFeedback();
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

// The action the user just triggered, kept locally so its button can show a
// spinner. The card unmounts on a successful decide; on failure `busy` flips
// back to false and we clear this so the buttons re-enable for retry.
const pendingAction = ref<string | null>(null);
watch(
  () => props.busy,
  (b) => {
    if (!b) pendingAction.value = null;
  },
);

function act(
  action: string,
  response: { decision: ApprovalDecision; scope?: 'session'; feedback?: string; selectedLabel?: string },
): void {
  // A second click (or number key) while the first decide is in flight must
  // not fire a duplicate request.
  if (props.busy) return;
  pendingAction.value = action;
  emit('decide', response);
}

function approve(): void { act('approve', { decision: 'approved' }); }
function approveSession(): void { act('approveSession', { decision: 'approved', scope: 'session' }); }
function reject(): void { act('reject', { decision: 'rejected' }); }

// plan_review actions
function approvePlan(): void { act('approvePlan', { decision: 'approved' }); }
function approveOption(label: string): void { act(`option:${label}`, { decision: 'approved', selectedLabel: label }); }
function revisePlan(): void {
  if (props.busy) return;
  openFeedback();
}
function rejectAndExitPlan(): void { act('rejectAndExit', { decision: 'rejected', selectedLabel: 'Reject and Exit' }); }

/** Open the plan file in the right panel's file tab. */
function openPlanPath(): void {
  const pr = planReview.value;
  if (pr?.path) props.openFile?.({ path: pr.path });
}

// ---------------------------------------------------------------------------
// Number key shortcuts. Generic cards: 1=approve, 2=session, 3=reject,
// 4=feedback. Plan review cards: 1/2/3 map to the offered approaches (or
// approve / revise / reject-and-exit when no approaches are offered).
// Guard: do not fire when a textarea/input is focused
// ---------------------------------------------------------------------------

function handleKeydown(e: KeyboardEvent): void {
  const tag = (document.activeElement?.tagName ?? '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  // While a decision is in flight, ignore number-key shortcuts so a stray key
  // can't fire a duplicate decide.
  if (props.busy) return;
  // Hidden actions shouldn't fire from number keys while minimized.
  if (minimized.value) return;
  const pr = planReview.value;
  if (pr) {
    if (pr.options.length === 0) {
      if (e.key === '1') { e.preventDefault(); approvePlan(); }
      else if (e.key === '2') { e.preventDefault(); revisePlan(); }
      else if (e.key === '3') { e.preventDefault(); rejectAndExitPlan(); }
      return;
    }
    if (e.key === '1' && pr.options[0]) { e.preventDefault(); approveOption(pr.options[0].label); }
    else if (e.key === '2' && pr.options[1]) { e.preventDefault(); approveOption(pr.options[1].label); }
    else if (e.key === '3' && pr.options[2]) { e.preventDefault(); approveOption(pr.options[2].label); }
    return;
  }
  if (e.key === '1') { e.preventDefault(); approve(); }
  else if (e.key === '2') { e.preventDefault(); approveSession(); }
  else if (e.key === '3') { e.preventDefault(); reject(); }
  else if (e.key === '4') { e.preventDefault(); openFeedback(); }
}

// The shortcut listener lives on the document for as long as the card is
// mounted, so a number key decides the approval wherever focus sits.
onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div ref="cardEl" class="appr" :class="{ minimized, scrolled }" @scroll="onScroll">
    <!-- Header: title + sub-agent badge, the peek line while minimized, and
         the expand / minimize controls. -->
    <div class="ah" :class="{ clickable: minimized }" @click="expandIfMinimized">
      <span class="akind">{{ title() }}</span>
      <Badge v-if="agentName && !minimized" variant="neutral" size="sm">{{ t('approval.subagentBadge', { name: agentName }) }}</Badge>
      <span v-if="minimized && peek" class="apeek">{{ peek }}</span>
      <IconButton
        v-if="expandable && !minimized"
        class="aexpand"
        size="sm"
        :label="expanded ? t('approval.collapsePlan') : t('approval.expandPlan')"
        @click="expanded = !expanded"
      >
        <Icon :name="expanded ? 'collapse' : 'expand'" size="md" />
      </IconButton>
      <IconButton
        class="amin"
        size="sm"
        :label="minimized ? t('question.expand') : t('question.minimize')"
        @click.stop="minimized = !minimized"
      >
        <Icon v-if="minimized" name="chevron-up" size="md" />
        <Icon v-else name="minus" size="md" />
      </IconButton>
    </div>

    <!-- Body + actions collapse when minimized -->
    <template v-if="!minimized">
      <div class="ab">
        <!-- plan_review: plan file path on the body's first line -->
        <button
          v-if="block.kind === 'plan_review' && block.path"
          type="button"
          class="plan-path"
          :title="block.path"
          @click="openPlanPath"
        >{{ block.path }}</button>

        <!-- Body by kind -->

        <!-- diff — the fork's own DiffLine shape ({kind, gutter, text}) is the
             daemon's packed gutter columns, which upstream's line shape
             ({type, oldNo, newNo}) cannot carry, so the rows keep the fork's
             renderer; the frame and the path line are upstream's. -->
        <div v-if="block.kind === 'diff'" class="body-code" :class="{ expanded }">
          <div class="code-path">{{ block.path }}</div>
          <div class="diff">
            <div v-for="(line, i) in block.diff" :key="i" class="dl" :class="line.kind === 'add' ? 'add' : line.kind === 'rem' ? 'del' : ''">
              <span class="dg">{{ line.gutter }}</span><span class="dc">{{ line.text }}</span>
            </div>
          </div>
        </div>

        <!-- shell -->
        <div v-else-if="block.kind === 'shell'" class="body-shell">
          <div class="shell-cmd"><span class="shell-dollar">$</span> {{ block.command }}</div>
          <div v-if="block.cwd" class="shell-cwd">cwd: {{ block.cwd }}</div>
          <div v-if="block.danger" class="shell-danger">
            <Icon class="shell-danger-ic" name="alert-triangle" size="sm" />
            <span>{{ t('approval.danger', { detail: block.danger }) }}</span>
          </div>
        </div>

        <!-- file -->
        <div v-else-if="block.kind === 'file'" class="body-code" :class="{ expanded }">
          <div class="code-path">{{ block.path }}</div>
          <DiffLines :code="block.content" />
        </div>

        <!-- fileop -->
        <div v-else-if="block.kind === 'fileop'" class="body-chip">
          <span class="chip-label">{{ block.op }}</span>
          <span class="chip-value">{{ block.path }}</span>
          <span v-if="block.detail" class="chip-detail">{{ block.detail }}</span>
        </div>

        <!-- url -->
        <div v-else-if="block.kind === 'url'" class="body-chip">
          <span v-if="block.method" class="chip-label">{{ block.method }}</span>
          <span class="chip-value">{{ block.url }}</span>
        </div>

        <!-- search -->
        <div v-else-if="block.kind === 'search'" class="body-chip">
          <span class="chip-label">{{ t('approval.searchQueryLabel') }}</span>
          <span class="chip-value">{{ block.query }}</span>
          <span v-if="block.scope" class="chip-detail">{{ t('approval.searchScope', { scope: block.scope }) }}</span>
        </div>

        <!-- invocation -->
        <div v-else-if="block.kind === 'invocation'" class="body-chip">
          <span class="chip-label">{{ block.kind2 }}</span>
          <span class="chip-value">{{ block.name }}</span>
          <span v-if="block.description" class="chip-detail">{{ block.description }}</span>
        </div>

        <!-- todo -->
        <div v-else-if="block.kind === 'todo'" class="body-todo">
          <div v-for="(item, i) in block.items" :key="i" class="todo-item">
            <span class="todo-glyph">{{ item.status === 'done' || item.status === 'completed' ? '✓' : '○' }}</span>
            <span class="todo-title" :class="{ 'todo-done': item.status === 'done' || item.status === 'completed' }">{{ item.title }}</span>
          </div>
        </div>

        <!-- plan_review -->
        <div
          v-else-if="block.kind === 'plan_review'"
          class="body-plan-wrap"
          :class="{ scrolled: planScrolled }"
          @scroll="onPlanScroll"
        >
          <div class="body-plan" :class="{ expanded }" @scroll="onPlanScroll">
            <Markdown :text="block.plan" :open-file="openFile" />
          </div>
          <div v-if="planReview && planReview.options.length > 0" class="plan-opts">
            <button
              v-for="(opt, i) in planReview.options"
              :key="i"
              type="button"
              class="popt"
              :disabled="busy"
              @click="approveOption(opt.label)"
            >
              <span class="popt-key">{{ i + 1 }}</span>
              <span class="popt-text">
                <span class="popt-label">{{ opt.label }}</span>
                <span v-if="opt.description" class="popt-desc">{{ opt.description }}</span>
              </span>
              <Spinner v-if="pendingAction === `option:${opt.label}`" size="sm" class="popt-spin" />
            </button>
          </div>
        </div>

        <!-- generic -->
        <div v-else class="body-generic">
          <span class="gen-text">{{ block.summary }}</span>
        </div>

        <!-- Inline feedback textarea -->
        <div v-if="feedbackOpen" class="feedback-wrap">
          <Textarea
            ref="feedbackRef"
            v-model="feedbackText"
            :placeholder="t('approval.feedbackPlaceholder')"
            :rows="3"
            :resize="false"
            @input="autosizeFeedback"
            @keydown="onFeedbackKeydown"
          />
          <div class="feedback-hint">{{ t('approval.feedbackHint') }}</div>
        </div>
      </div>

      <!-- Actions -->
      <div class="af">
        <div class="abtns">
          <!-- Feedback open: submit / cancel replace the decision buttons -->
          <template v-if="feedbackOpen">
            <Button
              size="md"
              variant="danger-soft"
              :loading="pendingAction === 'feedback'"
              :disabled="busy"
              @click="submitFeedback"
            >{{ t('approval.feedbackSubmit') }}</Button>
            <Button size="md" variant="ghost" :disabled="busy" @click="cancelFeedback">{{ t('approval.feedbackCancel') }}</Button>
          </template>

          <!-- plan_review: the offered approaches are body rows, so the footer
               keeps approve / revise / reject-and-exit -->
          <template v-else-if="planReview">
            <Button
              v-if="planReview.options.length === 0"
              class="amain"
              size="md"
              variant="primary"
              :loading="pendingAction === 'approvePlan'"
              :disabled="busy"
              @click="approvePlan"
            ><span class="knum">1</span>{{ t('approval.approvePlan') }}</Button>
            <Button size="md" variant="ghost" :disabled="busy" @click="revisePlan">
              <span v-if="planReview.options.length === 0" class="knum">2</span>{{ t('approval.revise') }}
            </Button>
            <Button
              size="md"
              variant="ghost"
              :loading="pendingAction === 'rejectAndExit'"
              :disabled="busy"
              @click="rejectAndExitPlan"
            >
              <span v-if="planReview.options.length === 0" class="knum">3</span>{{ t('approval.rejectAndExit') }}
            </Button>
          </template>

          <!-- default actions row -->
          <template v-else>
            <Button class="amain" size="md" variant="primary" :loading="pendingAction === 'approve'" :disabled="busy" @click="approve"><span class="knum">1</span>{{ t('approval.approve') }}</Button>
            <Button size="md" variant="ghost" :loading="pendingAction === 'approveSession'" :disabled="busy" @click="approveSession"><span class="knum">2</span>{{ t('approval.approveSession') }}</Button>
            <Button size="md" variant="ghost" :loading="pendingAction === 'reject'" :disabled="busy" @click="reject"><span class="knum">3</span>{{ t('approval.reject') }}</Button>
            <Button size="md" variant="ghost" :disabled="busy" @click="openFeedback"><span class="knum">4</span>{{ t('approval.feedback') }}</Button>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Card chrome: same raised surface as the question card, scrolling internally
   once its content outgrows the viewport. The top edge fades while scrolled so
   the header reads as a seam over the body (the fork's scroll-fade token). */
.appr {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 72px);
  margin: var(--space-2) 0;
  background: var(--color-surface-raised);
  border: var(--p-hairline) solid var(--color-line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-menu);
  overflow: hidden auto;
  animation: kimi-card-in var(--duration-base) var(--ease-out);
}
.appr > .ah,
.appr > .af { flex: none; }
.appr.minimized { transition: background var(--duration-fast) var(--ease-out); }
.appr.minimized:hover { background: var(--color-hover); }
.appr.scrolled { mask-image: var(--menu-scroll-fade-mask-top); }

/* Header — title, sub-agent badge, then the expand / minimize controls. */
.ah {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4) 0;
  flex-wrap: nowrap;
}
.appr.minimized .ah { padding-bottom: var(--space-3); }
.appr.minimized .ah.clickable { cursor: pointer; }
.akind {
  color: var(--color-text);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  flex: none;
}
/* While minimized, the header carries the one-line subject instead of the
   body; the title keeps its place and this truncates. */
.apeek {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
  font: var(--text-xs) var(--font-mono);
}
.amin,
.aexpand {
  margin-left: auto;
  flex: none;
}
.aexpand + .amin { margin-left: 0; }

/* Body — the card's own scrolling region. */
.ab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: var(--space-3) var(--space-4) 0;
}
.ab > * { flex: 0 1 auto; min-height: 0; }
.ab > .plan-path { flex: none; }
.ab > .body-plan-wrap { flex: 1; }

/* plan_review — the plan file path is its own control, above the plan itself. */
.plan-path {
  display: block;
  width: 100%;
  margin-bottom: var(--space-2);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-accent);
  font: var(--text-xs) var(--font-mono);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.plan-path:hover { text-decoration: underline; }
.plan-path:focus-visible {
  outline: none;
  text-decoration: underline;
  border-radius: var(--radius-xs);
  box-shadow: var(--p-focus-ring);
}

/* Code bodies (diff / file): the path line, then the framed code well. */
.body-code { display: flex; flex-direction: column; }
.body-code.expanded { flex: 1; }
.code-path {
  flex: none;
  color: var(--color-text-muted);
  font: var(--text-xs) var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The shared diff renderer owns only its rows; the card gives it upstream's
   framed well (border, sunken fill, its own scroll and height cap). */
.body-code :deep(.hl-code) {
  border: var(--p-hairline) solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
  overflow: auto;
  max-height: 36em;
  overscroll-behavior: contain;
  margin-top: var(--space-1);
}
.body-code.expanded :deep(.hl-code) { max-height: none; }

/* Diff — sunken code panel (the fork's own row shape). */
.diff {
  margin-top: var(--space-1);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
  overflow: auto;
  max-height: 36em;
  font: var(--text-sm)/1.85 var(--font-mono);
}
.body-code.expanded .diff { max-height: none; }
.dl { display: flex; padding: 0 var(--space-3); }
.dg { width: 30px; color: var(--color-text-muted); text-align: right; padding-right: var(--space-3); user-select: none; }
.dc { white-space: pre; font: inherit; }
.del { background: var(--color-danger-soft); }
.del .dc { color: var(--color-danger); }
.add { background: var(--color-success-soft); }
.add .dc { color: var(--color-success); }

/* Shell */
.body-shell { overflow-y: auto; }
.shell-cmd {
  font: var(--text-sm) var(--font-mono);
  background: var(--color-surface-sunken);
  border: var(--p-hairline) solid var(--color-line);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
  color: var(--color-text);
}
.shell-dollar { color: var(--color-accent-hover); font-weight: var(--weight-medium); margin-right: var(--space-2); }
.shell-cwd { font: var(--text-xs) var(--font-mono); color: var(--color-text-muted); margin-top: var(--space-1); }
.shell-danger {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font: var(--text-sm)/var(--leading-normal) var(--font-ui);
  background: var(--color-danger-soft);
}
.shell-danger-ic { flex: none; }

/* Chip (fileop/url/search/invocation) */
.body-chip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  font: var(--text-base)/var(--leading-normal) var(--font-ui);
  color: var(--color-text);
  overflow-y: auto;
}
.chip-label {
  background: var(--color-inline-code-bg);
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
  font: var(--weight-semibold) var(--text-xs) var(--font-mono);
  color: var(--color-text-muted);
  white-space: nowrap;
}
.chip-value {
  font: var(--text-sm) var(--font-mono);
  color: var(--color-text);
  word-break: break-all;
}
.chip-detail { font: var(--text-xs) var(--font-ui); color: var(--color-text-muted); }

/* Todo */
.body-todo { overflow-y: auto; }
.todo-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  font: var(--text-base)/var(--leading-normal) var(--font-ui);
  color: var(--color-text);
}
.todo-glyph { color: var(--color-accent); font-size: var(--text-sm); flex: none; width: 14px; }
.todo-title { color: var(--color-text); }
.todo-done { color: var(--color-text-muted); text-decoration: line-through; }

/* Generic */
.body-generic {
  font: var(--text-base)/var(--leading-normal) var(--font-ui);
  color: var(--color-text);
  word-break: break-word;
  overflow-y: auto;
}

/* plan_review — the plan body scrolls; its option rows sit under it inside the
   same scroll region, separated by a rule. */
.body-plan-wrap {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.body-plan-wrap.scrolled { mask-image: var(--menu-scroll-fade-mask-top); }
.body-plan-wrap > .plan-opts { flex: none; }
.body-plan { max-height: 50vh; overflow-y: auto; min-height: 0; }
.body-plan.expanded { max-height: none; flex: 1; }

.plan-opts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: var(--p-hairline) solid var(--color-line);
}
.popt {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font: var(--text-sm)/var(--leading-normal) var(--font-ui);
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}
.popt:hover:not(:disabled) { background: var(--color-hover); }
.popt:focus-visible { outline: none; background: var(--color-hover); box-shadow: var(--p-focus-ring); }
.popt:disabled { cursor: default; opacity: .6; }
.popt-key {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  background: var(--color-inline-code-bg);
  color: var(--color-text);
  font: var(--weight-medium) var(--text-xs)/20px var(--font-ui);
  text-align: center;
  flex: none;
}
.popt-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.popt-label { color: var(--color-text); font-size: var(--text-base); font-weight: var(--weight-medium); }
.popt-desc { color: var(--color-text-muted); font: var(--text-xs)/var(--leading-normal) var(--font-ui); }
.popt-spin { flex: none; color: var(--color-text-muted); }

/* Feedback */
.feedback-wrap {
  margin-top: var(--space-3);
  overflow-y: auto;
}
.feedback-wrap :deep(.ui-textarea) { max-height: 11rem; }
.feedback-hint { font: var(--text-xs) var(--font-ui); color: var(--color-text-muted); margin-top: var(--space-1); }

/* Footer — buttons left, each carrying its number key. */
.af {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-top: var(--p-hairline) solid var(--color-line);
}
.abtns { display: flex; align-items: center; gap: var(--space-1); }
/* The number-key chip inside each button; on the primary fill it takes the
   inverse tint so it stays readable. */
.knum {
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: var(--radius-xs);
  background: var(--color-inline-code-bg);
  color: var(--color-text);
  font: var(--weight-medium) var(--text-xs)/16px var(--font-ui);
  text-align: center;
}
.abtns :deep(.ui-button--primary) .knum {
  background: color-mix(in srgb, var(--color-text-on-accent) 28%, transparent);
  color: var(--color-text-on-accent);
}

/* =========================================================================
   MOBILE (≤640px): plan options and the action buttons become full-width
   stacked rows, each a ≥44px tap target, with the primary action on top.
   ========================================================================= */
@media (max-width: 640px) {
  .popt {
    min-height: 44px;
    padding: var(--space-3);
  }
  .af {
    flex-direction: column;
    align-items: stretch;
  }
  .abtns {
    flex-direction: column;
    margin-left: 0;
    gap: var(--space-2);
  }
  .abtns :deep(.ui-button) {
    width: 100%;
    min-height: 46px;
  }
  .abtns .amain { order: -1; }
}
</style>
