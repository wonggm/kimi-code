<!-- apps/kimi-web/src/components/chat/QuestionCard.vue -->
<!-- The pending-question card the agent shows when it needs an answer. Markup
     and metrics follow upstream's QuestionCard: a flat raised card (no head
     band, no accent border) whose title line is the question itself, a
     `qh-chip` step number when there is more than one question, a minimize and
     a dismiss icon button on the right, the option list as transparent rows
     with a boxed radio/checkbox glyph and a number chip, and a footer holding
     the buttons plus upstream's keyboard hint (`qhint`). The fork's own
     behaviour is kept: the answer draft persists per (session, question), a
     recommended option is pre-picked, and number keys / Enter / Esc work as
     before — plus upstream's arrow-key highlight and Space toggle, which the
     hint line announces. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UIQuestion } from '../../types';
import type { QuestionAnswer, QuestionResponse } from '../../api/types';
import { clearQuestionDraft, loadQuestionDraft, saveQuestionDraft } from '../../lib/storage';
import Markdown from './Markdown.vue';
import CardButton from '../ui/CardButton.vue';
import IconButton from '../ui/IconButton.vue';
import Icon from '../ui/Icon.vue';

const props = defineProps<{
  question: UIQuestion;
  /** Action kind currently in flight for this question. Drives the
   *  submit/dismiss loading state and blocks duplicate actions while the
   *  daemon processes the response. */
  busyKind?: 'answer' | 'dismiss';
}>();

const { t } = useI18n();

const emit = defineEmits<{
  answer: [questionId: string, response: QuestionResponse];
  dismiss: [questionId: string];
}>();

// ---------------------------------------------------------------------------
// Multi-question navigation
// ---------------------------------------------------------------------------

const step = ref(0);

// Temporarily collapse the card to a thin bar so it stops covering the chat
// while the user reads. State is local — answers/step are kept either way.
const minimized = ref(false);

/** The header row is a collapse/expand target while minimized (upstream's
 *  `.qh.clickable`); expanded it stays inert so a click on the title does
 *  nothing. */
function expandIfMinimized(): void {
  if (minimized.value) minimized.value = false;
}

const current = computed(() => props.question.questions[step.value]!);
const total = computed(() => props.question.questions.length);

function goBack(): void {
  if (step.value > 0) step.value--;
}

function goNext(): void {
  if (step.value < total.value - 1) step.value++;
}

function isQuestionAnswered(qid: string): boolean {
  const a = answers.value[qid];
  if (!a) return false;
  if (a.kind === 'multi') return a.optionIds.length > 0;
  if (a.kind === 'multiWithOther') return a.optionIds.length > 0 || a.otherText.trim().length > 0;
  if (a.kind === 'other') return a.text.trim().length > 0;
  return true;
}

function isCurrentAnswered(): boolean {
  return isQuestionAnswered(current.value.id);
}

// ---------------------------------------------------------------------------
// Per-question answers: Record<questionId, QuestionAnswer>
// ---------------------------------------------------------------------------

const answers = ref<Record<string, QuestionAnswer>>({});

function isRecommendedOption(option: { label: string; description?: string; recommended?: boolean }): boolean {
  if (option.recommended === true) return true;
  return /\b(?:recommended|recommend)\b|推荐/.test(`${option.label} ${option.description ?? ''}`.toLowerCase());
}

function seedRecommendedAnswers(): void {
  const next = { ...answers.value };
  let changed = false;
  for (const q of props.question.questions) {
    if (next[q.id]) continue;
    const recommended = q.options.filter(isRecommendedOption);
    if (recommended.length === 0) continue;
    next[q.id] = q.multiSelect
      ? { kind: 'multi', optionIds: recommended.map((option) => option.id) }
      : { kind: 'single', optionId: recommended[0]!.id };
    changed = true;
  }
  if (changed) answers.value = next;
}

// In-progress state is persisted per (session, question) so switching away and
// back — which unmounts this card — restores what the user had picked/typed.
let restoredKey = '';

watch(
  () => props.question.questionId,
  () => {
    step.value = 0;
    minimized.value = false;
    answers.value = {};
    otherTexts.value = {};
  },
);

watch(
  () => props.question,
  () => {
    // Restore the saved draft once per question identity; the deep re-fires
    // below must not clobber live edits with a stale snapshot. Restore runs
    // before seedRecommendedAnswers so saved picks win and seeding only fills
    // questions the user never touched.
    const identity = `${props.question.sessionId}:${props.question.questionId}`;
    if (identity !== restoredKey) {
      restoredKey = identity;
      const saved = loadQuestionDraft(props.question.sessionId, props.question.questionId);
      if (saved) {
        step.value = saved.step;
        answers.value = saved.answers;
        otherTexts.value = saved.otherTexts;
      }
    }
    if (step.value >= props.question.questions.length) step.value = 0;
    seedRecommendedAnswers();
  },
  { immediate: true, deep: true },
);

// Single-select: pick one optionId
function pickSingle(qid: string, optionId: string): void {
  const cur = answers.value[qid];
  // toggle off if already selected (allow deselect)
  if (cur && cur.kind === 'single' && cur.optionId === optionId) {
    const next = { ...answers.value };
    delete next[qid];
    answers.value = next;
  } else {
    answers.value = { ...answers.value, [qid]: { kind: 'single', optionId } };
  }
}

// Multi-select: toggle an optionId
function toggleMulti(qid: string, optionId: string): void {
  const cur = answers.value[qid];
  const ids: string[] = cur && (cur.kind === 'multi' || cur.kind === 'multiWithOther')
    ? (cur.kind === 'multi' ? [...cur.optionIds] : [...cur.optionIds])
    : [];
  const idx = ids.indexOf(optionId);
  if (idx >= 0) { ids.splice(idx, 1); } else { ids.push(optionId); }

  const existing = answers.value[qid];
  const otherText = existing && existing.kind === 'multiWithOther' ? existing.otherText : '';
  if (otherText) {
    answers.value = { ...answers.value, [qid]: { kind: 'multiWithOther', optionIds: ids, otherText } };
  } else {
    answers.value = { ...answers.value, [qid]: { kind: 'multi', optionIds: ids } };
  }
}

// "Other" text input (single)
const otherTexts = ref<Record<string, string>>({});

// Persist the in-progress state on every change so a session switch (which
// unmounts this card) never loses what the user had picked/typed.
watch([step, answers, otherTexts], () => {
  saveQuestionDraft(props.question.sessionId, props.question.questionId, {
    step: step.value,
    answers: answers.value,
    otherTexts: otherTexts.value,
  });
}, { deep: true });

// Ref to the current question's "Other" input so clicking the option row can
// focus it. Only the visible step's input is rendered at a time, so a single
// ref suffices.
const otherInputEl = ref<HTMLInputElement | null>(null);

function pickOther(qid: string): void {
  const q = props.question.questions.find((qi) => qi.id === qid)!;
  const text = otherTexts.value[qid] ?? '';
  if (q.multiSelect) {
    const cur = answers.value[qid];
    const ids: string[] = cur && (cur.kind === 'multi' || cur.kind === 'multiWithOther')
      ? (cur.kind === 'multi' ? [...cur.optionIds] : [...cur.optionIds])
      : [];
    answers.value = { ...answers.value, [qid]: { kind: 'multiWithOther', optionIds: ids, otherText: text } };
  } else {
    answers.value = { ...answers.value, [qid]: { kind: 'other', text } };
  }
}

// Select the "Other" option (so its radio/checkbox turns on) and focus the
// text input so the user can type immediately. Triggered by clicking anywhere
// on the option row, not just the input.
function selectOther(qid: string): void {
  pickOther(qid);
  nextTick(() => otherInputEl.value?.focus());
}

function isSelected(qid: string, optionId: string): boolean {
  const cur = answers.value[qid];
  if (!cur) return false;
  if (cur.kind === 'single') return cur.optionId === optionId;
  if (cur.kind === 'multi') return cur.optionIds.includes(optionId);
  if (cur.kind === 'multiWithOther') return cur.optionIds.includes(optionId);
  return false;
}

function isOtherSelected(qid: string): boolean {
  const cur = answers.value[qid];
  return !!(cur && (cur.kind === 'other' || cur.kind === 'multiWithOther'));
}

function canSubmit(): boolean {
  // All questions must have an answer
  return props.question.questions.every((qi) => isQuestionAnswered(qi.id));
}

// ---------------------------------------------------------------------------
// Keyboard highlight (upstream): the row the arrow keys act on. Only a
// multi-select list paints it (`highlighted`), but the index also tracks the
// single-select list so an arrow key selects what it moves to.
// ---------------------------------------------------------------------------

const cardEl = ref<HTMLElement | null>(null);
const highlighted = ref(0);

/** Bring the highlighted row into view inside the scrolling body (and the card
 *  itself, which scrolls too once its content outgrows the viewport). */
function scrollToHighlighted(): void {
  const card = cardEl.value;
  const body = card?.querySelector<HTMLElement>('.qbody');
  const target = body?.querySelectorAll<HTMLElement>('.qopt')[highlighted.value];
  if (!card || !body || !target) return;
  scrollIntoView(body, target);
  scrollIntoView(card, target);
}

/** Minimal `scrollIntoView({block: 'nearest'})`: only the request's own scroll
 *  container moves, so the transcript behind the card never shifts. */
function scrollIntoView(container: HTMLElement, target: HTMLElement): void {
  const cr = container.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  const top = tr.top - cr.top + container.scrollTop;
  const bottom = top + tr.height;
  if (tr.height >= container.clientHeight || top < container.scrollTop) {
    container.scrollTop = top;
  } else if (bottom > container.scrollTop + container.clientHeight) {
    container.scrollTop = bottom - container.clientHeight;
  }
}

// Moving to another question resets the highlight; the reset must not scroll
// (nothing is highlighted yet), so the follow-up scroll is suppressed.
let suppressScroll = false;
watch([step, () => props.question.questionId], () => {
  if (highlighted.value !== 0) suppressScroll = true;
  highlighted.value = 0;
});
watch(highlighted, () => {
  if (suppressScroll) { suppressScroll = false; return; }
  nextTick(() => scrollToHighlighted());
});
// A fresh question starts at the top of its own body.
watch(step, () => {
  nextTick(() => {
    const card = cardEl.value;
    const body = card?.querySelector<HTMLElement>('.qbody');
    if (body) body.scrollTop = 0;
    if (card) card.scrollTop = 0;
  });
});

// ---------------------------------------------------------------------------
// Submit / dismiss
// ---------------------------------------------------------------------------

// An action is in flight for this card (the daemon is processing our answer or
// dismiss). While busy, the triggered button shows a spinner and the rest are
// disabled so a second click can't fire a duplicate request.
const submitting = computed(() => props.busyKind === 'answer');
const dismissing = computed(() => props.busyKind === 'dismiss');
const busy = computed(() => !!props.busyKind);

function submit(): void {
  if (busy.value || !canSubmit()) return;
  // Clear the persisted draft synchronously before emitting — like
  // useComposerDraft.clearDraft, we can't rely on the save watcher because the
  // card unmounts once the daemon accepts the response.
  clearQuestionDraft(props.question.sessionId, props.question.questionId);
  const response: QuestionResponse = {
    answers: answers.value,
    method: 'click',
  };
  emit('answer', props.question.questionId, response);
}

function dismiss(): void {
  if (busy.value) return;
  clearQuestionDraft(props.question.sessionId, props.question.questionId);
  emit('dismiss', props.question.questionId);
}

// ---------------------------------------------------------------------------
// Keyboard: arrows/space move the highlight, number keys pick options for the
// current question, Enter submits, Esc dismisses.
// ---------------------------------------------------------------------------

function handleKeydown(e: KeyboardEvent): void {
  const tag = (document.activeElement?.tagName ?? '').toLowerCase();
  const inField = tag === 'input' || tag === 'textarea';
  // While an answer/dismiss is in flight, ignore shortcuts so a stray Enter
  // can't fire a duplicate submit.
  if (busy.value) return;

  // Enter advances to the next question (or submits when all are answered).
  // Allowed even while focus is in the "Other" text input, but not while the
  // card is minimized — the options aren't visible, so don't submit blindly.
  if (e.key === 'Enter') {
    e.preventDefault();
    if (minimized.value) return;
    if (step.value < total.value - 1 && isCurrentAnswered()) {
      goNext();
    } else if (canSubmit()) {
      submit();
    }
    return;
  }

  // Everything below acts on the option list: suppressed while typing in a
  // field so the keystrokes go to the input instead, and while minimized so
  // nothing picks an unseen answer.
  if (inField) return;
  if (e.key === 'Escape') { e.preventDefault(); dismiss(); return; }
  if (minimized.value) return;

  const q = current.value;
  // The "Other" row is the last stop of the list when the question allows one.
  const count = q.options.length + (q.allowOther ? 1 : 0);

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (count === 0) return;
    e.preventDefault();
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const next = Math.min(count - 1, Math.max(0, highlighted.value + delta));
    if (next === highlighted.value) { nextTick(() => scrollToHighlighted()); return; }
    highlighted.value = next;
    const opt = q.options[highlighted.value];
    if (opt) {
      if (!q.multiSelect) pickSingle(q.id, opt.id);
    } else if (q.allowOther && !q.multiSelect) {
      pickOther(q.id);
    }
    return;
  }

  if (e.key === ' ' && q.multiSelect) {
    e.preventDefault();
    const opt = q.options[highlighted.value];
    if (opt) {
      toggleMulti(q.id, opt.id);
      nextTick(() => scrollToHighlighted());
    } else if (q.allowOther) {
      pickOther(q.id);
      nextTick(() => scrollToHighlighted());
    }
    return;
  }

  const num = parseInt(e.key, 10);
  if (!isNaN(num) && num >= 1 && num <= 9) {
    e.preventDefault();
    // The "Other" row carries the next number after the options (upstream
    // numbers it the same way and shows the digit on the row).
    if (q.allowOther && num === q.options.length + 1) {
      highlighted.value = q.options.length;
      pickOther(q.id);
      nextTick(() => {
        scrollToHighlighted();
        otherInputEl.value?.focus();
      });
      return;
    }
    const optIdx = num - 1;
    const opt = q.options[optIdx];
    if (opt) {
      highlighted.value = optIdx;
      if (q.multiSelect) {
        toggleMulti(q.id, opt.id);
      } else {
        pickSingle(q.id, opt.id);
      }
      nextTick(() => scrollToHighlighted());
    }
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div ref="cardEl" class="qcard" :class="{ minimized }">
    <!-- Header: the question itself, the step number when there is more than
         one, and the minimize/dismiss controls. -->
    <div class="qh" :class="{ clickable: minimized }" @click="expandIfMinimized">
      <span class="qh-ic" aria-hidden="true">
        <Icon name="message" size="lg" />
      </span>
      <span v-if="total > 1" class="qh-chip">{{ step + 1 }}</span>
      <span class="qtitle">{{ current.question }}</span>
      <IconButton
        class="qmin"
        size="sm"
        :label="minimized ? t('question.expand') : t('question.minimize')"
        @click.stop="minimized = !minimized"
      >
        <Icon v-if="minimized" name="chevron-up" size="md" />
        <Icon v-else name="minus" size="md" />
      </IconButton>
      <IconButton
        class="qclose"
        size="sm"
        :label="t('question.dismiss')"
        :disabled="busy"
        @click.stop="dismiss"
      >
        <Icon name="close" size="md" />
      </IconButton>
    </div>

    <div v-if="!minimized" class="qpane">
      <div class="qpane-inner">
        <div class="qbody">
          <!-- Body markdown -->
          <Markdown v-if="current.body" :text="current.body" class="qmdbody" />

          <!-- Options -->
          <div class="qopts" :class="{ multi: current.multiSelect }">
            <label
              v-for="(opt, oi) in current.options"
              :key="opt.id"
              class="qopt"
              :class="{ selected: isSelected(current.id, opt.id), highlighted: current.multiSelect && oi === highlighted }"
              @click.prevent="highlighted = oi; current.multiSelect ? toggleMulti(current.id, opt.id) : pickSingle(current.id, opt.id)"
            >
              <span v-if="current.multiSelect" class="qopt-glyph">
                <Icon class="qopt-check" name="check" size="lg" />
              </span>
              <span class="qopt-text">
                <span class="qopt-label">{{ opt.label }}</span>
                <span v-if="opt.description" class="qopt-desc">{{ opt.description }}</span>
              </span>
              <span v-if="oi < 9" class="qopt-key">{{ oi + 1 }}</span>
            </label>

            <!-- Other option: the free-text input sits outside the label column
                 (upstream's `.qopt-text-other`), so the row reads as one line. -->
            <label
              v-if="current.allowOther"
              class="qopt"
              :class="{ selected: isOtherSelected(current.id), highlighted: current.multiSelect && highlighted === current.options.length }"
              @click.prevent="highlighted = current.options.length; selectOther(current.id)"
            >
              <span v-if="current.multiSelect" class="qopt-glyph">
                <Icon class="qopt-check" name="check" size="lg" />
              </span>
              <span class="qopt-text qopt-text-other">
                <span class="qopt-label">{{ current.otherLabel ?? t('question.otherDefault') }}</span>
                <span v-if="current.otherDescription" class="qopt-desc">{{ current.otherDescription }}</span>
              </span>
              <input
                ref="otherInputEl"
                v-model="otherTexts[current.id]"
                class="other-input"
                type="text"
                :placeholder="current.otherLabel ?? t('question.otherDefault')"
                @input="pickOther(current.id)"
                @focus="pickOther(current.id)"
              />
              <span v-if="current.options.length < 9" class="qopt-key">{{ current.options.length + 1 }}</span>
            </label>
          </div>
        </div>

        <!-- Footer: the buttons on the left, the keyboard hint on the right. -->
        <div class="qfoot">
          <div class="qbtns">
            <CardButton
              v-if="step < total - 1"
              class="qmain"
              variant="primary"
              :disabled="!isCurrentAnswered()"
              :hint-icons="['enter']"
              @click="goNext"
            >{{ t('question.nextQuestion') }}</CardButton>
            <CardButton
              v-else
              class="qmain"
              variant="primary"
              :disabled="!canSubmit()"
              :loading="submitting"
              :hint-icons="['enter']"
              @click="submit"
            >{{ t('question.submit') }}</CardButton>
            <CardButton
              v-if="total > 1"
              :disabled="step === 0 || busy"
              @click="goBack"
            >{{ t('question.back') }}</CardButton>
            <CardButton hint="Esc" :loading="dismissing" :disabled="busy" @click="dismiss">{{ t('question.dismiss') }}</CardButton>
          </div>
          <span class="qhint">{{ t('question.hint') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Card chrome: a raised surface that scrolls internally instead of growing
   past the viewport (upstream's `--dock-card-top-clearance` is the space the
   header leaves above the card). */
.qcard {
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
.qcard > .qh { flex: none; }
.qpane-inner > .qfoot { flex: none; }
.qpane {
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  min-height: 0;
  overflow: hidden;
}
.qpane-inner {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.qpane-inner > .qbody { flex: 0 1 auto; }
.qpane-inner > .qfoot { flex: none; }
.qcard.minimized { transition: background var(--duration-fast) var(--ease-out); }
.qcard.minimized:hover { background: var(--color-hover); }

/* Header — the question in the title, controls pinned to the right. */
.qh {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4) 0;
}
.qcard.minimized .qh {
  padding-bottom: var(--space-3);
  align-items: center;
}
.qcard.minimized .qh.clickable { cursor: pointer; }
/* The card's own mark, ahead of the step chip: 20px, aligned with the title's
   first line like the two controls on the right. */
.qh-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--p-ic-lg);
  height: var(--p-ic-lg);
  margin-top: calc((var(--text-lg) * var(--leading-tight) - var(--p-ic-lg)) / 2);
  color: var(--color-text);
}
.qcard.minimized .qh-ic { margin-top: 0; }
/* Step number chip — replaces a separate stepper; shown only when the request
   carries more than one question. */
.qh-chip {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  background: var(--color-inline-code-bg);
  color: var(--color-text);
  font: var(--weight-medium) var(--text-xs)/20px var(--font-ui);
  text-align: center;
  flex: none;
}
.qtitle {
  flex: 1;
  min-width: 0;
  color: var(--color-text);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  overflow-wrap: anywhere;
}
.qcard.minimized .qtitle {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* The two header controls align with the title's first line. */
.qmin,
.qclose { flex: none; margin-top: calc((var(--text-lg) * var(--leading-tight) - var(--icon-button-sm)) / 2); }
.qmin { margin-left: auto; }
.qcard.minimized .qmin,
.qcard.minimized .qclose { margin-top: 0; }

/* Body — scrolls on its own so a long option list never grows the card past
   the viewport. */
.qbody {
  min-height: min(120px, 25dvh);
  overflow-y: auto;
  padding: var(--space-3) var(--space-4) 0;
  color: var(--color-text);
  font: var(--text-base)/var(--leading-normal) var(--font-ui);
}
.qmdbody { margin-bottom: var(--space-2); }

/* Options — transparent rows; the selected (single) or highlighted (multi) row
   carries the background, and a multi-select row's box carries the check. */
.qopts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--space-2);
}
.qopt {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  font: var(--text-sm)/var(--leading-normal) var(--font-ui);
  color: var(--color-text);
  transition: background var(--duration-fast) var(--ease-out);
  user-select: none;
}
.qopt:hover,
.qopts:not(.multi) .qopt.selected,
.qopts.multi .qopt.highlighted { background: var(--color-hover); }

/* The number chip closes the row, so a number key is discoverable; upstream
   leaves the tenth and later options unnumbered. */
.qopt-key {
  width: var(--p-ic-lg);
  height: var(--p-ic-lg);
  margin-left: auto;
  border-radius: var(--radius-sm);
  background: var(--color-inline-code-bg);
  color: var(--color-text);
  font: var(--weight-medium) var(--text-xs)/var(--p-ic-lg) var(--font-ui);
  text-align: center;
  flex: none;
}

/* Multi-select rows carry a box; the check mark fills it while selected. A
   single-select row's choice is the row background alone. */
.qopt-glyph {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--p-ic-lg);
  height: var(--p-ic-lg);
  flex: none;
  color: var(--color-text);
}
.qopt-glyph::before {
  content: "";
  position: absolute;
  inset: 16.67%;
  border: var(--p-hairline) solid var(--color-line-strong);
  border-radius: var(--radius-xs);
  transition: opacity var(--duration-fast) var(--ease-out);
}
.qopt-check {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.qopt.selected .qopt-glyph::before { opacity: 0; }
.qopt.selected .qopt-check { opacity: 1; }

/* Label + description stack vertically (top-to-bottom) so a long description
   never squeezes the label sideways into a thin, many-line column. */
.qopt-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.qopt-label {
  color: var(--color-text);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
}
.qopt-desc {
  color: var(--color-text-muted);
  font: var(--text-xs)/var(--leading-normal) var(--font-ui);
}
/* The "Other" row's label column shrinks to its text so the input takes the
   rest of the line. */
.qopt-text-other { flex: 0 1 auto; }

.other-input {
  flex: 1;
  font: var(--text-base) var(--font-ui);
  border: none;
  border-bottom: var(--p-hairline) solid var(--color-line);
  outline: none;
  padding: 2px var(--space-1);
  color: var(--color-text);
  background: transparent;
  min-width: 12ch;
}
.other-input:focus-visible {
  border-bottom-color: var(--color-accent);
  box-shadow: 0 1px 0 0 var(--color-accent);
}

/* Footer */
.qfoot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-top: var(--p-hairline) solid var(--color-line);
}
.qbtns { display: flex; align-items: center; gap: var(--space-1); }
.qhint {
  margin-left: auto;
  color: var(--color-text-faint);
  font: var(--text-xs) var(--font-ui);
  user-select: none;
}

/* =========================================================================
   MOBILE (≤640px): bigger option taps and full-width stacked footer buttons
   that are ≥44px tall so Submit/Dismiss are easy to hit.
   ========================================================================= */
@media (max-width: 640px) {
  .qopt {
    min-height: 44px;
    padding: var(--space-3);
  }
  .other-input { flex-basis: 100%; min-height: 28px; }

  /* The keyboard hint is desktop-only. */
  .qfoot {
    flex-direction: column;
    align-items: stretch;
  }
  .qhint { display: none; }
  .qbtns {
    flex-direction: column;
    gap: var(--space-2);
  }
  .qbtns > .cbtn {
    justify-content: center;
    width: 100%;
    min-height: 46px;
  }
}
</style>
