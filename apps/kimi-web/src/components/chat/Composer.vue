<!-- apps/kimi-web/src/components/chat/Composer.vue -->
<script setup lang="ts">
import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import SlashMenu from './SlashMenu.vue';
import MentionMenu from './MentionMenu.vue';
import ComposerAddMenu from './ComposerAddMenu.vue';
import ComposerModelMenu from './ComposerModelMenu.vue';
import { buildSlashItems, parseSlash, SKILL_COMMAND_PREFIX } from '../../lib/slashCommands';
import { formatTokens } from '../../lib/formatTokens';
import type { FileItem } from './MentionMenu.vue';
import type { IconName } from '../../lib/icons';
import type { ActivationBadges, ConversationStatus, PermissionMode, QueuedPromptView } from '../../types';
import type { AppGoal, AppModel, AppSkill, ThinkingLevel } from '../../api/types';
import {
  effectiveThinkingLevel,
  isThinkingOn,
} from '../../lib/modelThinking';
import { useInputHistory } from '../../composables/useInputHistory';
import { useSlashMenu } from '../../composables/useSlashMenu';
import { useMentionMenu } from '../../composables/useMentionMenu';
import { useComposerDraft } from '../../composables/useComposerDraft';
import { useAttachmentUpload, type Attachment } from '../../composables/useAttachmentUpload';
import { useIsMobile } from '../../composables/useIsMobile';
import { clampMenuPlacement } from '../../composables/useViewportClamp';
import { trackMenuOpen } from '../../composables/useMenuOpen';
import { useGlassRefraction } from '../../composables/useGlassRefraction';
import { openFileAttachment } from '../../lib/openFileAttachment';
import type { PromptAttachment } from '../../composables/useKimiWebClient';
import Spinner from '../ui/Spinner.vue';
import IconButton from '../ui/IconButton.vue';
import Icon from '../ui/Icon.vue';
import ContextRing from '../ui/ContextRing.vue';
import Tooltip from '../ui/Tooltip.vue';
import BottomSheet from '../dialogs/BottomSheet.vue';
import AttachmentChip from './AttachmentChip.vue';
import MediaRail from './MediaRail.vue';
import type { MediaRailItem } from './MediaRail.vue';

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

const props = withDefaults(defineProps<{
  running?: boolean;
  /** True while the empty-composer first prompt is being created + submitted.
   *  Disables the textarea and swaps the send button for a spinner. */
  starting?: boolean;
  /** Active session id — scopes the persisted unsent draft (per session). */
  sessionId?: string;
  queued?: QueuedPromptView[];
  searchFiles?: (q: string) => Promise<FileItem[]>;
  /** If undefined, the add menu's Files row is hidden and paste/drag are no-ops. */
  uploadImage?: (file: Blob, name?: string) => Promise<{ fileId: string; name: string; mediaType: string } | null>;
  /** Status data (model, context, permission) — drives the bottom toolbar. */
  status?: ConversationStatus;
  thinking?: ThinkingLevel;
  planMode?: boolean;
  /** Plan mode staged for the next send (from the + menu / `/plan`) — local
   *  only; the send activates plan mode and consumes this flag. */
  planArmed?: boolean;
  swarmMode?: boolean;
  goalMode?: boolean;
  goal?: AppGoal | null;
  activationBadges?: ActivationBadges;
  /** Available models for the quick-switch dropdown. */
  models?: AppModel[];
  /** Starred model ids shown at the top of the quick-switch dropdown. */
  starredIds?: string[];
  /** Session skills shown in the `/` menu (after the built-in commands). */
  skills?: AppSkill[];
  /** Hide the context-usage indicator (used on the empty-session landing page). */
  hideContext?: boolean;
}>(), {
  running: false,
  starting: false,
  queued: () => [],
  searchFiles: undefined,
  uploadImage: undefined,
  models: () => [],
  starredIds: () => [],
  skills: () => [],
});

// Upstream switches the placeholder with the armed work mode, and gives plan its
// own wording ("What should the agent plan for?"); the fork only had the goal
// case, so an armed plan kept the default "Type a message…". Precedence follows
// the work-mode pill below (goal over plan); props are read directly so this
// computed does not depend on declarations further down the file.
const placeholder = computed(() =>
  props.starting
    ? t('composer.starting')
    : props.running
      ? t('composer.placeholderRunning')
      : props.goalMode
        ? t('status.goalPlaceholder')
        : props.planMode || props.planArmed
          ? t('status.planPlaceholder')
          : t('composer.placeholder'),
);

// Hide the overlay placeholder when the textarea has content. Native
// `:placeholder-shown` mirrors this state without an explicit watcher.
const showPlaceholderOverlay = computed(() => !text.value && !props.starting);

const emit = defineEmits<{
  submit: [payload: { text: string; attachments: PromptAttachment[] }];
  /** Steer the composer text (+ any queued prompts, merged by the parent)
      into the RUNNING turn — TUI ctrl+s. */
  steer: [payload: { text: string; attachments: PromptAttachment[] }];
  command: [cmd: string, attachments?: PromptAttachment[]];
  interrupt: [];
  setPermission: [mode: PermissionMode];
  setThinking: [level: ThinkingLevel];
  togglePlan: [];
  /** Arm/disarm plan mode for the next send (deferred — no profile push). */
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
  /** Any dock-anchored popup opened or closed — the dock root carries upstream's
      `has-popup` while one is up. */
  popup: [open: boolean];
}>();

const { t, locale } = useI18n();

// ---------------------------------------------------------------------------
// Textarea + per-session draft persistence — see useComposerDraft.
// ---------------------------------------------------------------------------
const { text, textareaRef, autosize, loadForEdit, clearDraft } = useComposerDraft({
  sessionId: () => props.sessionId,
});

// ---------------------------------------------------------------------------
// Expanded editor — a taller, multi-line composing mode. While expanded, Enter
// inserts a newline instead of sending (send via the button or Cmd/Ctrl+Enter);
// it auto-collapses after a successful send. See handleKeydown / handleSubmit.
// ---------------------------------------------------------------------------
const expanded = ref(false);
function toggleExpand(): void {
  expanded.value = !expanded.value;
  // Re-fit the textarea after the min/max-height swap between modes, then
  // recompute growth against the *post-toggle* resting height. Without this,
  // collapsing would keep the isGrown measured against the expanded 70vh
  // min-height, hiding the toggle even though the collapsed draft is still
  // multi-line. (This does not affect the expanded state itself — once
  // expanded, it stays at 70vh until toggled back or sent.)
  void nextTick(() => {
    autosize();
    recomputeGrown();
    // Return focus to the textarea so the user can keep typing right away;
    // otherwise focus stays on the toggle button and the next Enter would
    // activate it again instead of inserting a newline.
    textareaRef.value?.focus();
  });
}

// Collapse the expanded editor after a successful send/steer and re-fit the
// textarea once the 70vh min-height is gone. On image-only sends the text is
// already empty, so the draft watcher never re-runs autosize — without this,
// the textarea keeps the inline height measured at 70vh and the collapsed cap
// (1/4 viewport) leaves an oversized empty box until the next keystroke.
function collapseAndRefit(): void {
  if (!expanded.value) return;
  expanded.value = false;
  void nextTick(autosize);
}

// The expand toggle is hidden at the resting height and only appears once the
// box has grown past it (multi-line content) — keeps the empty composer
// uncluttered. While expanded it always shows so the user can collapse back.
//
// The resting height equals the textarea's computed `min-height` (set in
// style.css). We read it from the element instead of hard-coding.
const RESTING_HEIGHT_FALLBACK_PX = 36;
function restingHeightPx(el: HTMLTextAreaElement): number {
  if (typeof getComputedStyle === 'undefined') return RESTING_HEIGHT_FALLBACK_PX;
  const min = Number.parseFloat(getComputedStyle(el).minHeight);
  return Number.isFinite(min) && min > 0 ? min : RESTING_HEIGHT_FALLBACK_PX;
}
const isGrown = ref(false);
function recomputeGrown(): void {
  const el = textareaRef.value;
  isGrown.value = !!el && el.scrollHeight > restingHeightPx(el);
}
watch(text, () => {
  // Registered after useComposerDraft's autosize watcher, so the inline height
  // already reflects the latest content when this reads scrollHeight.
  void nextTick(recomputeGrown);
});

// The component instance is reused across session switches (it is not keyed by
// session), so reset the per-session expanded preference when the active
// session changes. Without this, expanding in one chat would leave the next
// session's draft stuck in the tall editor with Enter inserting newlines.
// The popup menus close too: the sessionId watcher swaps the draft text, which
// does not flow through handleInput, so without an explicit close the slash
// panel kept showing the previous session's results.
watch(() => props.sessionId, () => {
  expanded.value = false;
  closeSlashMenu();
  closeMentionMenu();
});

// ---------------------------------------------------------------------------
// Sent-message history recall (shell-style ↑/↓). See useInputHistory for the
// implementation; the composer keeps the keydown orchestration (which also
// juggles the slash and mention menus).
// ---------------------------------------------------------------------------
const history = useInputHistory({ text, textareaRef, autosize, sessionId: () => props.sessionId });

// ---------------------------------------------------------------------------
// Slash-command menu — see useSlashMenu for the implementation. The composer
// keeps the keydown orchestration (arrow keys / Enter / Escape) because it also
// juggles the mention menu and history recall.
// ---------------------------------------------------------------------------
const {
  open: slashOpen,
  items: slashItems,
  ranges: slashRanges,
  query: slashQuery,
  active: slashActive,
  update: updateSlashMenu,
  select: selectSlashCommand,
  close: closeSlashMenu,
} = useSlashMenu({
  text,
  textareaRef,
  autosize,
  skills: () => props.skills,
  emitCommand: (cmd) => emit('command', cmd),
  historyPush: (entry) => history.push(entry),
  clearDraft,
  resolveDesc: (item) => (item.isSkill ? item.desc : t(item.desc)),
});

// ---------------------------------------------------------------------------
// @-mention menu — see useMentionMenu for the implementation. The composer
// keeps the keydown orchestration because it also juggles the slash menu and
// history recall.
// ---------------------------------------------------------------------------
const {
  open: mentionOpen,
  items: mentionItems,
  active: mentionActive,
  loading: mentionLoading,
  query: mentionQuery,
  update: updateMentionMenu,
  select: selectMentionItem,
  close: closeMentionMenu,
  insertMention: insertMentionText,
} = useMentionMenu({
  text,
  textareaRef,
  autosize,
  searchFiles: () => props.searchFiles,
  skills: () => props.skills,
});

// While the field itself has focus (keyboard up on touch) the composer takes
// its comfortable height; see the `focused` class in the mobile block below.
const focused = ref(false);

function onBarFocus(): void {
  focused.value = true;
}

// Close both popup menus when the composer loses focus — the menu items use
// @mousedown.prevent (so clicking them never blurs the textarea), so a blur can
// only come from interacting elsewhere. Without this the slash panel stayed
// open after clicking into the chat.
function onBarBlur(): void {
  focused.value = false;
  closeSlashMenu();
  closeMentionMenu();
}

// ---------------------------------------------------------------------------
// Floating-panel viewport clamping — the model dropdown, slash panel and
// @-mention panel all open upward from the composer, which sits at the bottom
// of the dock; the empty-session composer renders mid-pane, so each panel is
// measured against its anchor and flips below (or clamps into the viewport)
// when the space above is too small. Slash / Mention keep their wrap-relative
// absolute positioning (only the flip + edge insets are injected); the model
// dropdown is clamped through the shared placement helper.
// ---------------------------------------------------------------------------

const cinWrapRef = ref<HTMLElement | null>(null);
const slashMenuRef = ref<InstanceType<typeof SlashMenu> | null>(null);
const mentionMenuRef = ref<InstanceType<typeof MentionMenu> | null>(null);
const slashClamp = ref<Record<string, string>>({});
const mentionClamp = ref<Record<string, string>>({});

// Mobile (≤640px): the slash / mention / add / model menus open as grab-handle
// bottom sheets instead of these anchored floating panels, so the whole
// measure-and-clamp machinery below is desktop-only. The sheets render the
// same content (see the template's mobile branches) and the refs here are
// never measured on mobile.
const isMobile = useIsMobile();

function positionAutocompletePanel(kind: 'slash' | 'mention'): void {
  if (isMobile.value) return;
  const wrap = cinWrapRef.value;
  const el = kind === 'slash' ? slashMenuRef.value?.$el : mentionMenuRef.value?.$el;
  if (!wrap || !(el instanceof HTMLElement)) return;
  const wrapRect = wrap.getBoundingClientRect();
  const { left, placement } = clampMenuPlacement(
    wrapRect,
    el.offsetWidth,
    el.offsetHeight,
    'above',
    { gap: 4, margin: 8 },
  );
  const style: Record<string, string> = {};
  if (placement === 'below') {
    style.top = 'calc(100% + 4px)';
    style.bottom = 'auto';
  }
  if (left > wrapRect.left + 0.5) {
    // The panel normally spans the wrap (left:0 / right:0); nudge it in only
    // when the clamp pushed it away from the left viewport edge.
    style.left = `${Math.round(left - wrapRect.left)}px`;
  }
  (kind === 'slash' ? slashClamp : mentionClamp).value = style;
}

// Re-fit while open: the list height changes as rows arrive / filter, and the
// window size can change under a docked composer.
const menuResizeObservers = new Map<'slash' | 'mention', ResizeObserver>();
function syncAutocompleteViewport(kind: 'slash' | 'mention'): void {
  if (isMobile.value) return;
  const open = kind === 'slash' ? slashOpen.value : mentionOpen.value;
  const el = kind === 'slash' ? slashMenuRef.value?.$el : mentionMenuRef.value?.$el;
  const observer = menuResizeObservers.get(kind);
  if (!open || !(el instanceof HTMLElement)) {
    observer?.disconnect();
    menuResizeObservers.delete(kind);
    return;
  }
  if (!observer) {
    const next = new ResizeObserver(() => positionAutocompletePanel(kind));
    menuResizeObservers.set(kind, next);
    next.observe(el);
  }
  positionAutocompletePanel(kind);
}

watch(
  [slashOpen, mentionOpen, () => slashItems.value.length, () => mentionItems.value.length],
  () => {
    syncAutocompleteViewport('slash');
    syncAutocompleteViewport('mention');
  },
  // The popup elements are v-if'd on those flags — measure only after the DOM
  // has the panel rendered.
  { flush: 'post' },
);

// Model dropdown — right-aligned to the toolbar (the historical `right: 10px`
// placement), clamped into the viewport horizontally and flipped below when the
// space above the toolbar is too small.
const modelDropdownRef = ref<HTMLElement | null>(null);
// The composer card itself is an always-on lens surface: non-transient, so
// the page snapshot keeps refreshing while it refracts.
const cardRef = ref<HTMLElement | null>(null);
useGlassRefraction(cardRef, { transient: false });
const modelDropdownStyle = ref<Record<string, string>>({});

function positionModelDropdown(): void {
  const bar = toolbarRef.value;
  const menu = modelDropdownRef.value;
  if (!bar || !menu) return;
  const barRect = bar.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  // Upstream centres the model dropdown on its trigger pill (measured: pill
  // centre 1072.5, menu centre 1070) and leaves a 14px gap above it. The fork
  // right-aligned the menu to the toolbar, which read as "not aligned".
  const pillRect = bar.querySelector('.model-pill')?.getBoundingClientRect() ?? barRect;
  const anchor = new DOMRect(pillRect.left + pillRect.width / 2 - width / 2, pillRect.top, width, pillRect.height);
  const { top, left, placement } = clampMenuPlacement(anchor, width, height, 'above', { gap: 14, margin: 8 });
  const style: Record<string, string> = {
    top: `${Math.round(top - barRect.top)}px`,
    bottom: 'auto',
    left: `${Math.round(left - barRect.left)}px`,
  };
  if (placement === 'above' && top > pillRect.top - 14 - height + 0.5) {
    // The helper relaxed the top clamp (space above was smaller than the
    // margin) — keep the panel glued to the pill's edge instead of drifting.
    style.top = `${Math.round(pillRect.top - barRect.top - 14 - height)}px`;
  }
  modelDropdownStyle.value = style;
}

let modelDropdownObserver: ResizeObserver | null = null;
function syncModelDropdownViewport(): void {
  const menu = modelDropdownRef.value;
  if (dropdownOpen.value && menu) {
    if (!modelDropdownObserver) {
      modelDropdownObserver = new ResizeObserver(() => positionModelDropdown());
      modelDropdownObserver.observe(menu);
    }
  } else {
    modelDropdownObserver?.disconnect();
    modelDropdownObserver = null;
  }
  positionModelDropdown();
}

// ---------------------------------------------------------------------------
// Model pill icon-only collapse — in very narrow rows the model label gives
// way to a bare chevron pill (hover tooltip still shows model + effort). The
// pill's natural widths are measured while expanded; the collapse flips once
// the row cannot hold them, and re-expands only after the row grows enough to
// hold them again (with slack, so the two never oscillate).
// ---------------------------------------------------------------------------

const MODEL_PILL_COLLAPSE_SLACK = 16;
const modelPillCollapsed = ref(false);
let toolbarNaturalLeft = 0;
let toolbarNaturalRight = 0;
let toolbarAvailable = 0;
let toolbarObserver: ResizeObserver | null = null;

function measureToolbarWidths(): void {
  const toolbar = toolbarRef.value;
  if (!toolbar) return;
  const left = toolbar.querySelector<HTMLElement>('.toolbar-left');
  const right = toolbar.querySelector<HTMLElement>('.toolbar-right');
  toolbarAvailable = toolbar.clientWidth;
  toolbarNaturalLeft = left?.scrollWidth ?? 0;
  toolbarNaturalRight = right?.scrollWidth ?? 0;
}

function updateModelPillCollapse(): void {
  const toolbar = toolbarRef.value;
  if (!toolbar) return;
  toolbarAvailable = toolbar.clientWidth;
  if (modelPillCollapsed.value) {
    // Natural widths were captured while the label was visible (last expanded
    // measurement) — re-expand only once the row can hold them again with
    // slack, so the two states never chase each other.
    if (toolbarNaturalLeft + toolbarNaturalRight <= toolbarAvailable - MODEL_PILL_COLLAPSE_SLACK) {
      modelPillCollapsed.value = false;
      measureToolbarWidths();
    }
    return;
  }
  measureToolbarWidths();
  if (toolbarNaturalLeft + toolbarNaturalRight > toolbarAvailable + MODEL_PILL_COLLAPSE_SLACK) {
    modelPillCollapsed.value = true;
  }
}

/** Label for the collapsed pill's hover tooltip: model + reasoning effort. */
const modelPillLabel = computed(() => {
  const model = props.status?.model ?? '';
  return thinkingSuffix.value ? `${model} ${thinkingSuffix.value}` : model;
});

function onComposerResize(): void {
  updateModelPillCollapse();
  if (slashOpen.value || mentionOpen.value) {
    syncAutocompleteViewport('slash');
    syncAutocompleteViewport('mention');
  }
  if (dropdownOpen.value) void nextTick(positionModelDropdown);
}

// Model changes can lengthen/shorten the pill label — re-fit the collapse
// decision with the next frame.
watch(() => props.status?.model, () => {
  void nextTick(updateModelPillCollapse);
});

// ---------------------------------------------------------------------------
// Input event handler — updates both menus
// ---------------------------------------------------------------------------

function handleInput(): void {
  // Manual typing leaves history-browsing mode — the text is now a fresh draft.
  history.resetBrowsing();
  updateSlashMenu();
  updateMentionMenu();
}

// ---------------------------------------------------------------------------
// Attachments — see useAttachmentUpload. The composer keeps handleSubmit /
// handleSteer (which read the attachments to build the payload) and the
// `hasUpload` toolbar flag.
// ---------------------------------------------------------------------------
const {
  attachments,
  previewAttachment,
  fileInputRef,
  isDragOver,
  removeAttachment,
  reorderMedia,
  openAttachmentPreview,
  closeAttachmentPreview,
  openFilePicker,
  handleFileInputChange,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  clearAfterSubmit,
  loadAttachments,
} = useAttachmentUpload({
  uploadImage: () => props.uploadImage,
  sessionId: () => props.sessionId,
  // A pasted folder is not an upload — its name becomes a folder mention in
  // the composer text through the shared insertMention helper.
  onFolderPath: (name) => {
    insertMentionText({ kind: 'folder', name, path: `${name}/` });
  },
});

// Silence noUnusedLocals: fileInputRef is used as a template ref (ref="fileInputRef").
void fileInputRef;

onMounted(() => {
  // Fit the box to a restored draft on first render, and reflect its grown
  // state so the expand toggle shows for an already-long draft.
  if (text.value) {
    void nextTick(() => {
      autosize();
      recomputeGrown();
    });
  }
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onAddDocClick);
  clearCompositionEndTimer();
});

// ---------------------------------------------------------------------------
// Submit / keydown
// ---------------------------------------------------------------------------

// loadForEdit comes from useComposerDraft (it lives next to the text state).
function focus(): void {
  // preventScroll keeps the pane from jumping if the composer is already in view
  // or if focus is triggered during an animation/transition.
  textareaRef.value?.focus({ preventScroll: true });
}
function loadAttachmentsForEdit(atts: { fileId?: string; kind: 'image' | 'video' | 'file'; url: string; name?: string }[]): void {
  loadAttachments(atts);
}
// Slash-command entry points for the toolbar menus (`/model`, `/effort`,
// `/permission`): same trigger as the pill clicks, idempotent when the menu
// is already open. On mobile the model menu opens as its bottom sheet.
function openModelMenu(): void {
  if (!dropdownOpen.value) toggleDropdown();
}
function openPermissionMenu(): void {
  if (!permDropdownOpen.value) togglePermDropdown();
}
defineExpose({ loadForEdit, loadAttachmentsForEdit, focus, openModelMenu, openPermissionMenu });

// Build the wire-bound attachment payload: images/videos only need the fileId,
// while file parts also carry name/mediaType/size for the daemon's file shape.
function toPromptAttachment(a: Attachment): PromptAttachment {
  return { fileId: a.fileId!, kind: a.kind, name: a.name, mediaType: a.mediaType, size: a.size };
}

// Pending attachments split by presentation: images and videos fill the media
// rail above the input, every other type stays a chip in the strip. The rail is
// also the send order — its media positions are the ordinals the thumbs and the
// mentions in the text are numbered by.
const mediaAttachments = computed(() =>
  attachments.value.filter((a): a is Attachment & { kind: 'image' | 'video' } => a.kind !== 'file'),
);
const fileAttachments = computed(() => attachments.value.filter((a) => a.kind === 'file'));
const mediaRailItems = computed<MediaRailItem[]>(() =>
  mediaAttachments.value.map((a) => ({
    id: a.localId,
    kind: a.kind,
    name: a.name,
    url: a.previewUrl,
    fileId: a.fileId,
    uploading: a.uploading,
    error: a.error,
  })),
);

// Chip primary action: media opens the lightbox preview; a generic file opens
// in a new tab (browser-renderable types) or downloads, once its upload has
// completed and produced a daemon file id.
function onAttachmentActivate(att: Attachment): void {
  if (att.kind === 'file') {
    if (att.fileId !== undefined) void openFileAttachment(att.fileId, att.name, att.mediaType);
    return;
  }
  openAttachmentPreview(att);
}

function onMediaActivate(item: MediaRailItem): void {
  const att = attachments.value.find((a) => a.localId === item.id);
  if (att) onAttachmentActivate(att);
}

/** Rail "mention" tool: insert the thumb's label (its number) into the draft, so
 *  the prompt can point at one image of the rail by name. */
function onMediaMention(item: MediaRailItem, label: string): void {
  insertMentionText({ kind: 'attachment', name: label, id: item.fileId ?? item.id });
}

function onMediaReorder(payload: { id: string; toIndex: number }): void {
  reorderMedia(payload.id, payload.toIndex);
}

function handleSubmit(): void {
  const trimmed = text.value.trim();

  // An upload is still in flight — submitting now would silently send the
  // message WITHOUT the image. Keep the text + chips (the chip shows its
  // uploading spinner); the user submits again in a moment.
  if (attachments.value.some((a) => a.uploading)) return;

  // Allow submission with images even when text is empty
  const readyAttachments = attachments.value.filter((a) => !a.uploading && !a.error && a.fileId);

  if (!trimmed && readyAttachments.length === 0) return;

  // Record for ↑/↓ recall before the slash branch so commands (with or without
  // args) are recallable too, not just plain messages. `push` ignores empty /
  // whitespace, so an image-only send adds nothing.
  history.push(trimmed);

  // If it's a known slash command, keep the optional tail as command input
  // instead of submitting it as normal chat text. This covers `/goal <task>`,
  // `/swarm <task>`, `/btw <question>`, slash skills with args, and bare
  // commands such as `/model`. A hand-typed bare skill name (`/deploy`) also
  // resolves to its prefixed menu entry (`/skill:deploy`), mirroring the TUI.
  if (trimmed) {
    const parsed = parseSlash(trimmed);
    const slashItem = parsed
      ? buildSlashItems(props.skills).find(
          (item) => item.name === parsed.cmd || item.name === `/${SKILL_COMMAND_PREFIX}${parsed.cmd.slice(1)}`,
        )
      : undefined;
    if (parsed && slashItem) {
      // Skill activations forward the composer's attachments into the turn
      // (mirroring a normal submit) — otherwise they were silently dropped.
      // Built-in commands leave any chips untouched.
      const commandAttachments =
        slashItem.isSkill === true && readyAttachments.length > 0
          ? readyAttachments.map((a) => toPromptAttachment(a))
          : undefined;
      if (commandAttachments !== undefined) {
        previewAttachment.value = null;
        clearAfterSubmit();
      }
      text.value = '';
      clearDraft();
      closeSlashMenu();
      collapseAndRefit();
      emit('command', parsed.arg ? `${parsed.cmd} ${parsed.arg}` : parsed.cmd, commandAttachments);
      return;
    }
  }

  const payload = {
    text: trimmed,
    attachments: readyAttachments.map((a) => toPromptAttachment(a)),
  };

  // Revoke object URLs and drop the submitted attachments.
  previewAttachment.value = null;
  clearAfterSubmit();

  text.value = '';
  clearDraft();
  closeSlashMenu();
  closeMentionMenu();
  collapseAndRefit();
  emit('submit', payload);
}

/**
 * Steer (TUI ctrl+s): push the current text — and the parent merges any queued
 * prompts — straight into the running turn. With an empty composer it still
 * fires when something is queued, so "queue a few thoughts, then ctrl+s" works.
 */
function handleSteer(): void {
  if (!props.running) return;
  if (attachments.value.some((a) => a.uploading)) return;

  const trimmed = text.value.trim();
  const readyAttachments = attachments.value.filter((a) => !a.uploading && !a.error && a.fileId);
  if (!trimmed && readyAttachments.length === 0 && props.queued.length === 0) return;

  const payload = {
    text: trimmed,
    attachments: readyAttachments.map((a) => toPromptAttachment(a)),
  };
  clearAfterSubmit();
  history.push(trimmed);
  text.value = '';
  clearDraft();
  closeSlashMenu();
  closeMentionMenu();
  collapseAndRefit();
  emit('steer', payload);
}

let isComposingText = false;
let compositionEndTimer: ReturnType<typeof setTimeout> | null = null;

function clearCompositionEndTimer(): void {
  if (compositionEndTimer !== null) {
    clearTimeout(compositionEndTimer);
    compositionEndTimer = null;
  }
}

function handleCompositionStart(): void {
  clearCompositionEndTimer();
  isComposingText = true;
}

function handleCompositionEnd(): void {
  clearCompositionEndTimer();
  compositionEndTimer = setTimeout(() => {
    compositionEndTimer = null;
    isComposingText = false;
  }, 0);
}

function isComposingKeyEvent(e: KeyboardEvent): boolean {
  return isComposingText || e.isComposing || e.keyCode === 229;
}

function handleKeydown(e: KeyboardEvent): void {
  if (isComposingKeyEvent(e)) return;

  // Close dropdowns on Escape
  if (e.key === 'Escape') {
    if (dropdownOpen.value) {
      e.preventDefault();
      closeDropdown();
      return;
    }
    if (permDropdownOpen.value) {
      e.preventDefault();
      closePermDropdown();
      return;
    }
    // Popup menus: also reachable while empty (slash "no commands" state) or
    // while the mention search is still loading — the in-branch Escape
    // handlers only run during normal navigation.
    if (slashOpen.value || mentionOpen.value) {
      e.preventDefault();
      closeSlashMenu();
      closeMentionMenu();
      return;
    }
  }

  // Slash menu navigation
  if (slashOpen.value && slashItems.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      slashActive.value = (slashActive.value + 1) % slashItems.value.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      slashActive.value = (slashActive.value - 1 + slashItems.value.length) % slashItems.value.length;
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const item = slashItems.value[slashActive.value];
      if (item) selectSlashCommand(item);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSlashMenu();
      return;
    }
  }

  // Mention menu navigation
  if (mentionOpen.value && !mentionLoading.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionActive.value = (mentionActive.value + 1) % Math.max(1, mentionItems.value.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionActive.value = (mentionActive.value - 1 + Math.max(1, mentionItems.value.length)) % Math.max(1, mentionItems.value.length);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const item = mentionItems.value[mentionActive.value];
      if (item) selectMentionItem(item);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMentionMenu();
      return;
    }
  }

  // Ctrl+S / Cmd+S — steer into the running turn (TUI parity)
  if (e.key === 's' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (props.running) {
      e.preventDefault();
      handleSteer();
    }
    return;
  }

  // History recall (shell-style ↑/↓) — see useInputHistory for the machinery.
  //
  // Disabled entirely in the expanded editor: that mode is for composing long
  // multi-line text, so the arrows always move the caret within the draft and
  // never jump to a previous message.
  //
  // ENTERING history: a plain ArrowUp only recalls when the caret is at the
  // very start of the text, so editing a multi-line draft with the arrows
  // still works — ArrowUp moves the caret within the draft until it reaches
  // the top, instead of jumping to a previous message mid-navigation.
  // ONCE BROWSING, the arrows walk history directly, regardless of where the
  // caret landed — a recalled multi-line entry leaves the caret at its end, and
  // the old "must be at the start" gate then trapped it there, so further
  // ArrowUp did nothing ("only one step back"). Walking freely while browsing
  // fixes that; typing exits history (handleInput resets browsing), after which
  // the arrows move the caret normally again.
  if (!expanded.value && !slashOpen.value && !mentionOpen.value && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
    const browsing = history.isBrowsing();
    if (e.key === 'ArrowUp' && history.hasHistory() && (browsing || history.caretAtTextStart())) {
      e.preventDefault();
      history.recallOlder();
      return;
    }
    if (e.key === 'ArrowDown' && browsing) {
      e.preventDefault();
      history.recallNewer();
      return;
    }
  }

  // Normal Enter / Shift+Enter
  if (e.key === 'Enter' && !e.shiftKey) {
    // Expanded editor: Enter inserts a newline; Cmd/Ctrl+Enter sends.
    // (Clicking the send button always sends.) Shift+Enter already falls
    // through to the default newline above, so behavior matches either way.
    if (expanded.value && !(e.metaKey || e.ctrlKey)) {
      return;
    }
    e.preventDefault();
    handleSubmit();
  }
}

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

// Send is always "send" — while running it enqueues (handled upstream by
// sendPrompt). On desktop the interrupt lives on its own Stop button beside it
// so the two can never be confused; on mobile the pair shares a single slot and
// cross-fades, so the toolbar keeps one footprint through a turn (see
// .send-stop).
const sendLabel = computed(() => t('composer.send'));
const hasUpload = computed(() => !!props.uploadImage);

// Upstream greys the send disc out while there is nothing to submit. This
// mirrors the handleSubmit guard (text or at least one ready attachment); the
// guard itself is unchanged, so the button is only painted, never re-wired.
const canSubmit = computed(() =>
  text.value.trim().length > 0
    || attachments.value.some((a) => !a.uploading && !a.error && a.fileId),
);

// The mobile cross-fade keeps both buttons mounted, so the faded-out half has
// to leave the tab order and the accessibility tree; on desktop the inactive
// stop button is display:none, which already does that.
const stopHidden = computed(() => isMobile.value && !props.running);
const sendHidden = computed(() => isMobile.value && props.running);

// ---------------------------------------------------------------------------
// Bottom toolbar — split into individual controls
// ---------------------------------------------------------------------------

const dropdownOpen = ref(false);
const permDropdownOpen = ref(false);
const toolbarRef = ref<HTMLElement | null>(null);

// The model dropdown is clamped (and watched for size) only while it is open;
// the pill-collapse measurement runs on the toolbar. Both watchers sit here,
// after their refs exist.
watch(dropdownOpen, () => {
  if (dropdownOpen.value) {
    void nextTick(syncModelDropdownViewport);
  } else {
    modelDropdownObserver?.disconnect();
    modelDropdownObserver = null;
  }
});

function toggleDropdown(): void {
  dropdownOpen.value = !dropdownOpen.value;
  if (dropdownOpen.value) {
    permDropdownOpen.value = false;
    closeAdd();
    document.addEventListener('click', onDocClick, true);
  } else {
    document.removeEventListener('click', onDocClick, true);
  }
}

function closeDropdown(): void {
  dropdownOpen.value = false;
  if (!permDropdownOpen.value) {
    document.removeEventListener('click', onDocClick, true);
  }
}

function togglePermDropdown(): void {
  permDropdownOpen.value = !permDropdownOpen.value;
  if (permDropdownOpen.value) {
    dropdownOpen.value = false;
    closeAdd();
    document.addEventListener('click', onDocClick, true);
  } else {
    document.removeEventListener('click', onDocClick, true);
  }
}

function closePermDropdown(): void {
  permDropdownOpen.value = false;
  if (!dropdownOpen.value) {
    document.removeEventListener('click', onDocClick, true);
  }
}

function onDocClick(e: MouseEvent): void {
  // On mobile the model menu is a bottom sheet teleported to <body>, so a row
  // tap always looks like a click "outside" the toolbar here. Dismissing the
  // menu in this capture-phase handler unmounts the sheet's rows before they
  // receive the tap, and Vue drops emits from an already-unmounted instance —
  // the row would silently do nothing. The sheet dismisses itself instead
  // (scrim / grab handle / Escape), which routes back through closeDropdown().
  if (isMobile.value && dropdownOpen.value) return;
  if (toolbarRef.value && !toolbarRef.value.contains(e.target as Node)) {
    closeDropdown();
    closePermDropdown();
  }
}

onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true);
  document.removeEventListener('mousedown', onAddDocClick);
});

// Clamped to 0–100: ctxUsed can momentarily exceed ctxMax (estimates), and
// ctxMax can be 0 before the first status fetch — both broke the ring. ceil
// (not round) so a session under 0.5% usage still shows a sliver of arc —
// Math.round floored it to an empty, "no data"-looking ring.
const pct = computed(() => {
  const max = props.status?.ctxMax ?? 0;
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.ceil(((props.status?.ctxUsed ?? 0) / max) * 100)));
});

const ctxTooltip = computed(() => {
  const used = formatTokens(props.status?.ctxUsed ?? 0);
  const max = formatTokens(props.status?.ctxMax ?? 0);
  return t('status.ctxTooltip', { used, max, pct: pct.value });
});

const showCompact = computed(() => pct.value >= 80);

// Thinking toggle
// Identity is the model id — display/model names can collide across providers.
const currentModel = computed(() =>
  props.models?.find((m) => m.id === props.status?.modelId),
);
// The client resolves the level per model (the model's stored pick when still
// declared, else the catalog default), so what arrives here is valid for the
// active model and drives the toolbar suffix (the dropdown's segmented
// control recomputes the same values in ComposerModelMenu).
const thinkingLevel = computed(() => effectiveThinkingLevel(currentModel.value, props.thinking));
const thinkingOn = computed(() => isThinkingOn(thinkingLevel.value));
// Footer-style suffix: effort models show the concrete level; boolean models
// keep the plain "thinking" tag; off shows nothing.
const thinkingSuffix = computed(() => {
  if (!thinkingOn.value) return '';
  const hasEfforts = (currentModel.value?.supportEfforts?.length ?? 0) > 0;
  const level = thinkingLevel.value;
  if (hasEfforts && level !== 'on') return t('composer.thinkingSuffixEffort', { level });
  return t('composer.thinkingSuffix');
});

// Plan toggle
const planOn = computed(() => props.planMode === true);
const planArmedOn = computed(() => props.planArmed === true);
const swarmOn = computed(() => props.swarmMode === true);
const goalStatus = computed(() => props.goal?.status ?? props.activationBadges?.goal?.status ?? null);
const goalActive = computed(() => goalStatus.value !== null && goalStatus.value !== 'complete');
const goalCanPause = computed(() => goalStatus.value === 'active');
const goalCanResume = computed(() => goalStatus.value === 'paused' || goalStatus.value === 'blocked');

// Work-mode pill: a rounded chip floating over the textarea's top-left while a
// mode is armed or active. Goal shows for the armed stage only (an ACTIVE goal
// keeps its goal card); plan shows for the armed stage AND while active. The
// arm setters in useWorkspaceState keep plan/goal mutually exclusive, so at
// most one kind is ever shown.
const wmPillKind = computed<'plan' | 'goal' | null>(() =>
  props.goalMode === true ? 'goal' : planArmedOn.value || planOn.value ? 'plan' : null,
);

// The pill overlays the textarea start, so the first line is indented by its
// width while it shows (CSS text-indent only nudges line 1 — mirrors upstream).
const wmPillRef = ref<HTMLElement | null>(null);
const wmPillIndent = ref('');
function measureWmPill(): void {
  const el = wmPillRef.value;
  wmPillIndent.value = el ? `calc(${el.offsetWidth}px + var(--space-2))` : '';
}
watch(wmPillKind, () => {
  if (wmPillKind.value !== null) void nextTick(() => requestAnimationFrame(measureWmPill));
  else wmPillIndent.value = '';
});
const wmPillStyle = computed(() => (wmPillIndent.value ? { textIndent: wmPillIndent.value } : undefined));

/** Dismiss the work-mode pill: un-arm a staged plan, turn an active plan off,
 *  or un-arm a staged goal. */
function dismissWmPill(): void {
  if (wmPillKind.value === 'goal') emit('toggleGoal');
  else if (planArmedOn.value) emit('togglePlanArmed');
  else if (planOn.value) emit('togglePlan');
}

// Add menu ("+" next to the input) — Files / Goal / Plan / Swarm.
const addOpen = ref(false);

// Upstream marks the dock with `has-popup` while any popup anchored to it is up
// — the two dropdowns, the add menu, and the slash/mention menus. Declared here,
// after every flag, because `watch` reads the source during setup. The dock root
// owns the class, so the state is reported up.
const anyPopupOpen = computed(
  () => dropdownOpen.value || permDropdownOpen.value || addOpen.value || slashOpen.value || mentionOpen.value,
);
watch(anyPopupOpen, (open) => emit('popup', open));
const addRef = ref<HTMLElement | null>(null);
const addMenuRef = ref<HTMLElement | null>(null);
// The menu is position:fixed (so no composer stacking context can paint over
// it); these coords anchor it just above the trigger, computed on open.
const addMenuStyle = ref<Record<string, string>>({});

// Keep the app's "any menu open" flag in step with this composer's dropdowns,
// so Tooltip hides hover bubbles whose trigger sits outside the open menu.
trackMenuOpen(
  computed(
    () =>
      slashOpen.value ||
      mentionOpen.value ||
      dropdownOpen.value ||
      permDropdownOpen.value ||
      addOpen.value,
  ),
);

function closeAdd(): void {
  addOpen.value = false;
  document.removeEventListener('mousedown', onAddDocClick);
}
function onAddDocClick(e: MouseEvent): void {
  // Same trap as the model sheet (see onDocClick): on mobile the add menu is a
  // bottom sheet teleported to <body>, and `addMenuRef` is bound to the desktop
  // panel only, so the tapped row never reads as "inside" the menu. Closing the
  // menu on mousedown drops the row's click before its handler runs — Files /
  // Plan / Swarm did nothing. The sheet dismisses itself instead (scrim / grab
  // handle / Escape), which routes back through closeAdd().
  if (isMobile.value && addOpen.value) return;
  const t = e.target as Node;
  if (addRef.value?.contains(t) || addMenuRef.value?.contains(t)) return;
  closeAdd();
}
function toggleAddMenu(): void {
  if (addOpen.value) {
    closeAdd();
    return;
  }
  // Keep the toolbar menus mutually exclusive so they never overlap.
  closeDropdown();
  closePermDropdown();
  // On mobile the add menu opens as a bottom sheet, so the fixed-position
  // anchor coordinates are desktop-only.
  if (!isMobile.value) {
    const r = addRef.value?.getBoundingClientRect();
    if (r) {
      // Upstream's add menu spans the composer card's *content* box (`left: 0;
      // right: 0` inside the card, whose box is border-box with a 1px border) —
      // so the panel copies the card's content-box left edge and width, not its
      // border box, which would be 2px wider.
      const cardEl = cardRef.value;
      const card = cardEl?.getBoundingClientRect();
      const style: Record<string, string> = {
        left: `${Math.round((card?.left ?? r.left) + (cardEl?.clientLeft ?? 0))}px`,
        bottom: `${Math.round(window.innerHeight - r.top + 8)}px`,
      };
      if (cardEl) style.width = `${Math.round(cardEl.clientWidth)}px`;
      addMenuStyle.value = style;
    }
  }
  addOpen.value = true;
  setTimeout(() => document.addEventListener('mousedown', onAddDocClick), 0);
  void nextTick(() => {
    (addMenuRef.value?.querySelector<HTMLElement>('.am-row') ?? undefined)?.focus();
  });
}
// Keyboard nav inside the add menu: arrows cycle the rows, Escape/Tab dismiss.
// Every row is a focusable button.
const ADD_ROW_SELECTOR = '.am-row';
function onAddKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeAdd();
    textareaRef.value?.focus();
    return;
  }
  if (e.key === 'Tab') {
    closeAdd();
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  // Query the rows from the element the handler is bound to (the desktop
  // panel or the mobile sheet wrapper) — the desktop addMenuRef does not
  // exist while the sheet variant is mounted.
  const host = e.currentTarget;
  const rows = host instanceof HTMLElement
    ? Array.from(host.querySelectorAll<HTMLElement>(ADD_ROW_SELECTOR))
    : [];
  if (rows.length === 0) return;
  const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const idx = activeEl ? rows.indexOf(activeEl) : -1;
  const next = e.key === 'ArrowDown' ? (idx + 1) % rows.length : (idx - 1 + rows.length) % rows.length;
  rows[next]?.focus();
}
/** Run an add-menu row action: dismiss the menu and refocus the composer. */
function runAddRow(action: () => void): void {
  closeAdd();
  action();
  textareaRef.value?.focus();
}
/**
 * Swarm turns on behind a confirmation, as upstream has it: its Swarm row opens
 * a dialog ("Enable swarm mode?" / "The agent will run multiple sub-agents in
 * parallel.") and only the dialog's confirm toggles the mode. The dialog lives
 * in the client (`toggleSwarmMode`), which every swarm entry point goes through,
 * so the row only emits — otherwise the mode would ask twice.
 */
function chooseSwarmRow(): void {
  runAddRow(() => emit('toggleSwarm'));
}

/** Commands / Mention rows (mobile sheet only): seed the composer with the
 *  trigger those menus open on, exactly as typing it would. An existing draft is
 *  kept and the trigger appended after it, so the row never discards text. */
function seedTrigger(char: '/' | '@'): void {
  const current = text.value;
  if (current.length === 0) text.value = char;
  else if (!/\s$/.test(current)) text.value = `${current} ${char}`;
  else text.value = `${current}${char}`;
}
/** Plan row: arm for the next send when off; an ACTIVE plan toggles off (the
 *  pill × is the other exit). */
function choosePlanRow(): void {
  if (planOn.value) runAddRow(() => emit('togglePlan'));
  else runAddRow(() => emit('togglePlanArmed'));
}
// Permission modes
const PERM_MODES: { mode: PermissionMode; rowColor: string; icon: IconName; labelKey: string; descKey: string }[] = [
  { mode: 'manual', rowColor: 'var(--color-text)', icon: 'hand', labelKey: 'status.permissionManual', descKey: 'status.permissionManualDesc' },
  { mode: 'yolo', rowColor: 'var(--color-warning)', icon: 'shield-question', labelKey: 'status.permissionYolo', descKey: 'status.permissionYoloDesc' },
  { mode: 'auto', rowColor: 'var(--color-danger)', icon: 'shield-exclamation', labelKey: 'status.permissionAuto', descKey: 'status.permissionAutoDesc' },
];
const menuMeasureRef = ref<HTMLElement | null>(null);
const permissionDescriptionWidth = ref('');
function menuDescStyle(width: string): Record<string, string> {
  const style: Record<string, string> = {};
  if (width) style['--composer-menu-desc-width'] = width;
  return style;
}
const permissionMenuStyle = computed<Record<string, string>>(() => menuDescStyle(permissionDescriptionWidth.value));
let menuMeasureFrame: number | null = null;

function cssPx(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function canvasFont(style: CSSStyleDeclaration): string {
  return `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${style.fontSize} ${style.fontFamily}`;
}

function letterSpacingPx(style: CSSStyleDeclaration): number {
  return style.letterSpacing === 'normal' ? 0 : cssPx(style.letterSpacing);
}

function measureTextWidth(text: string, style: CSSStyleDeclaration): number {
  if (!text) return 0;
  const prepared = prepareWithSegments(text, canvasFont(style), {
    letterSpacing: letterSpacingPx(style),
  });
  return measureNaturalWidth(prepared);
}

function measureMenuDescriptions(): void {
  const probe = menuMeasureRef.value?.querySelector<HTMLElement>('.pd-desc');
  if (!probe) return;
  const style = getComputedStyle(probe);
  const permissionWidth = Math.max(
    0,
    ...PERM_MODES.map((opt) => measureTextWidth(t(opt.descKey), style)),
  );
  permissionDescriptionWidth.value = permissionWidth > 0 ? `${Math.ceil(permissionWidth)}px` : '';
}

function scheduleMenuDescriptionMeasure(): void {
  if (typeof window === 'undefined') return;
  if (menuMeasureFrame !== null) {
    window.cancelAnimationFrame(menuMeasureFrame);
  }
  void nextTick(() => {
    menuMeasureFrame = window.requestAnimationFrame(() => {
      menuMeasureFrame = null;
      measureMenuDescriptions();
    });
  });
}

watch(locale, scheduleMenuDescriptionMeasure, { immediate: true });

onMounted(() => {
  scheduleMenuDescriptionMeasure();
  void document.fonts?.ready.then(scheduleMenuDescriptionMeasure);
  void document.fonts?.ready.then(() => measureWmPill());
  // Toolbar measurement: re-fit the model pill's collapse decision on any
  // toolbar resize, window resize, model change, or late font load (label
  // widths are font-dependent).
  const toolbar = toolbarRef.value;
  if (toolbar && typeof ResizeObserver !== 'undefined') {
    toolbarObserver = new ResizeObserver(() => updateModelPillCollapse());
    toolbarObserver.observe(toolbar);
  }
  updateModelPillCollapse();
  window.addEventListener('resize', onComposerResize);
  void document.fonts?.ready.then(() => {
    updateModelPillCollapse();
    if (dropdownOpen.value) void nextTick(positionModelDropdown);
  });
});

onUnmounted(() => {
  if (menuMeasureFrame !== null) {
    window.cancelAnimationFrame(menuMeasureFrame);
    menuMeasureFrame = null;
  }
  toolbarObserver?.disconnect();
  toolbarObserver = null;
  window.removeEventListener('resize', onComposerResize);
  menuResizeObservers.forEach((observer) => observer.disconnect());
  menuResizeObservers.clear();
  modelDropdownObserver?.disconnect();
  modelDropdownObserver = null;
});

function choosePermission(mode: PermissionMode): void {
  emit('setPermission', mode);
  closePermDropdown();
}

const permInfo = computed(() => PERM_MODES.find((p) => p.mode === props.status?.permission));
const permLabel = computed(() => (permInfo.value ? t(permInfo.value.labelKey) : ''));

function selectModel(modelId: string): void {
  emit('selectModel', modelId);
  closeDropdown();
}
</script>

<template>
  <div
    class="composer"
    :class="{ 'drag-over': isDragOver, expanded, focused }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Media rail (above the input row) — images and videos as reorderable
         thumbnails stamped with their position, which is what a mention in the
         text refers to. -->
    <div v-if="mediaAttachments.length > 0" class="att-rail">
      <MediaRail
        :items="mediaRailItems"
        :label="t('composer.mediaAttachments')"
        size="composer"
        reorderable
        mentionable
        removable
        @activate="onMediaActivate"
        @mention="onMediaMention"
        @remove="(item) => removeAttachment(item.id)"
        @reorder="onMediaReorder"
      />
    </div>

    <!-- Attachment chips (above the input row) — file attachments only; media
         is in the rail above. -->
    <div v-if="fileAttachments.length > 0" class="att-strip">
      <AttachmentChip
        v-for="att in fileAttachments"
        :key="att.localId"
        :kind="att.kind"
        :name="att.name"
        :url="att.previewUrl"
        :file-id="att.fileId"
        :media-type="att.mediaType"
        :size="att.size"
        :uploading="att.uploading"
        :error="att.error"
        removable
        :remove-label="t('composer.removeNamed', { name: att.name })"
        @activate="onAttachmentActivate(att)"
        @remove="removeAttachment(att.localId)"
      />
    </div>

    <div v-if="previewAttachment" class="att-lightbox lg-scrim" @click.self="closeAttachmentPreview">
      <div class="att-lightbox-card">
        <Tooltip :text="t('model.close')">
          <button
            type="button"
            class="att-lightbox-close"
            :aria-label="t('model.close')"
            @click="closeAttachmentPreview"
          >✕</button>
        </Tooltip>
        <video
          v-if="previewAttachment.kind === 'video'"
          class="att-lightbox-media"
          :src="previewAttachment.previewUrl"
          controls
          playsinline
        />
        <img v-else class="att-lightbox-media" :src="previewAttachment.previewUrl" :alt="previewAttachment.name" />
        <div class="att-lightbox-name">{{ previewAttachment.name }}</div>
      </div>
    </div>

    <!-- Main composer card -->
    <div ref="cardRef" class="composer-card lg-frost lg-lens">
      <!-- Input row with popup menus -->
      <div
        ref="cinWrapRef"
        class="cin-wrap"
        :class="{ 'has-wm-pill': !!wmPillKind }"
      >
        <!-- Work-mode pill — armed/active plan or armed goal, floating over the
             textarea's top-left; × exits (un-arm or turn off). -->
        <span v-if="wmPillKind" ref="wmPillRef" class="wm-pill" :data-work-mode="wmPillKind">
          <span class="wm-icon"><Icon :name="wmPillKind === 'goal' ? 'target' : 'file-edit'" size="sm" /></span>
          <span>{{ t(wmPillKind === 'goal' ? 'status.goalLabel' : 'status.planLabel') }}</span>
          <button
            type="button"
            class="wm-x"
            :aria-label="t('status.workModeDismiss')"
            :title="t('status.workModeDismiss')"
            @mousedown.prevent
            @click="dismissWmPill"
          >
            <Icon name="close" size="sm" />
          </button>
        </span>
        <!-- Slash menu (above textarea) — the clamp style keeps it inside the
             viewport (flip below when the space above the composer is small).
             Desktop only: on mobile the same content opens as a bottom sheet
             (see the sheets below the toolbar). -->
        <SlashMenu
          ref="slashMenuRef"
          v-if="slashOpen && !isMobile"
          :items="slashItems"
          :active-index="slashActive"
          :query="slashQuery"
          :ranges="slashRanges"
          :clamp-style="slashClamp"
          @select="selectSlashCommand"
          @hover="slashActive = $event"
        />

        <!-- Mention menu (above textarea) — same viewport clamping as slash.
             Desktop only: on mobile it opens as a bottom sheet. -->
        <MentionMenu
          ref="mentionMenuRef"
          v-if="mentionOpen && !isMobile"
          :items="mentionItems"
          :active-index="mentionActive"
          :loading="mentionLoading"
          :query="mentionQuery"
          :clamp-style="mentionClamp"
          @select="selectMentionItem"
          @hover="mentionActive = $event"
        />

        <div class="input-row">
          <!-- Placeholder overlay — positioned behind/over the textarea, fully
               pointer-event transparent. The textarea keeps the `:placeholder`
               attribute as a fallback for screen readers and for environments
               where the overlay cannot render (CSS disabled), but the visible
               placeholder is this div so a click anywhere inside the composer
               box focuses the textarea without the placeholder element ever
               intercepting it. This re-expresses the upstream
               `composer-placeholder-overlay` pattern on our plain <textarea>:
               upstream moved to ProseMirror (overlay div outside the editor);
               we keep the textarea and overlay the same way. -->
          <div
            v-show="showPlaceholderOverlay"
            class="ph-overlay"
            aria-hidden="true"
          >
            <span class="ph-overlay-primary">{{ placeholder }}</span>
          </div>
          <textarea
            ref="textareaRef"
            v-model="text"
            class="ph"
            :style="wmPillStyle"
            :placeholder="placeholder"
            :aria-label="t('composer.inputLabel')"
            :disabled="starting"
            rows="1"
            @keydown="handleKeydown"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
            @input="handleInput"
            @focus="onBarFocus"
            @blur="onBarBlur"
          />
          <Tooltip v-if="expanded || isGrown" :text="expanded ? t('composer.collapseTitle') : t('composer.expandTitle')">
            <button
              class="expand-btn"
              type="button"
              :aria-label="expanded ? t('composer.collapseTitle') : t('composer.expandTitle')"
              @click="toggleExpand"
            >
              <Icon v-if="expanded" name="collapse" size="sm" />
              <Icon v-else name="expand" size="sm" />
            </button>
          </Tooltip>
        </div>
      </div>

      <!-- Hidden file input (no accept filter — any file type can be attached) -->
      <input
        v-if="hasUpload"
        ref="fileInputRef"
        type="file"
        multiple
        class="file-input-hidden"
        @change="handleFileInputChange"
      />

      <!-- Bottom toolbar — split into individual controls -->
      <div ref="toolbarRef" class="toolbar">
        <div ref="menuMeasureRef" class="menu-measure" aria-hidden="true">
          <span class="pd-desc" />
        </div>

        <!-- Left: add menu + permission -->
        <div class="toolbar-left">
          <!-- "+" add menu — Files / Goal / Plan / Swarm -->
          <div v-if="status" ref="addRef" class="add">
            <Tooltip :text="t('composer.addMenu')">
              <IconButton
                class="composer-attach lg-glass"
                size="md"
                :label="t('composer.addMenu')"
                :class="{ open: addOpen }"
                aria-haspopup="menu"
                :aria-expanded="addOpen"
                @click.stop="toggleAddMenu"
              >
                <Icon name="plus" />
              </IconButton>
            </Tooltip>

            <!-- Teleported to body: position:fixed coords are viewport-based, and
                 the card's backdrop-filter would otherwise become the containing
                 block, throwing the menu off to the wrong position. -->
            <Teleport to="body">
              <div
                v-if="addOpen && !isMobile"
                ref="addMenuRef"
                class="add-menu lg-glass"
                :style="addMenuStyle"
                @click.stop
                @keydown="onAddKeydown"
              >
                <!-- Files / Goal / Plan / Swarm rows — shared with the mobile
                     bottom-sheet variant below. Upstream wraps them in this
                     scroll box on desktop and renders them bare in the mobile
                     sheet, so each surface owns its wrapper. -->
                <div class="am-scroll" role="menu">
                  <ComposerAddMenu
                    :has-upload="hasUpload"
                    :goal-active="goalActive"
                    :goal-mode="props.goalMode"
                    :goal-can-pause="goalCanPause"
                    :goal-can-resume="goalCanResume"
                    :plan-on="planOn"
                    :plan-armed-on="planArmedOn"
                    :swarm-on="swarmOn"
                    @files="runAddRow(openFilePicker)"
                    @goal-main="goalActive ? runAddRow(() => emit('focusGoal')) : runAddRow(() => emit('toggleGoal'))"
                    @plan="choosePlanRow"
                    @swarm="chooseSwarmRow"
                  />
                </div>
              </div>
            </Teleport>
          </div>

          <!-- Permission pill — click to open dropdown -->
          <span
            v-if="status"
            class="perm-pill lg-glass"
            :class="['perm-' + status.permission, { open: permDropdownOpen }]"
            role="button"
            tabindex="0"
            :aria-label="permLabel"
            @click.stop="togglePermDropdown"
            @keydown.enter="togglePermDropdown"
            @keydown.space.prevent="togglePermDropdown"
          >
            <!-- Leading glyph from the same per-mode table the dropdown rows
                 use (hand / shield-question / shield-exclamation), so the pill
                 and its menu read as one control. -->
            <Icon v-if="permInfo" class="perm-pill-icon" :name="permInfo.icon" size="md" />
            <span class="perm-pill-label">{{ permLabel }}</span>
          </span>

          <!-- Permission dropdown — anchored to the toolbar left side -->
          <div
            v-if="permDropdownOpen && status"
            class="ui-menu perm-dropdown lg-glass"
            :style="permissionMenuStyle"
            role="menu"
            @click.stop
          >
            <button
              v-for="opt in PERM_MODES"
              :key="opt.mode"
              type="button"
              class="ui-menu-item ui-menu-item--md pd-row"
              :class="{ 'is-current': opt.mode === status.permission }"
              role="menuitemradio"
              :aria-checked="opt.mode === status.permission"
              @click="choosePermission(opt.mode)"
            >
              <span class="pd-icon"><Icon :name="opt.icon" size="md" :style="{ color: opt.rowColor }" /></span>
              <span class="pd-info">
                <span class="pd-name" :style="{ color: opt.rowColor }">{{ t(opt.labelKey) }}</span>
                <span class="pd-desc">{{ t(opt.descKey) }}</span>
              </span>
              <span class="pd-check">
                <Icon v-if="opt.mode === status.permission" name="check" size="sm" :style="{ color: 'var(--color-accent)' }" />
              </span>
            </button>
          </div>

        </div>

        <!-- Right: ctx + model -->
        <div class="toolbar-right">
          <!-- Compact chip when context is high -->
          <button v-if="showCompact" class="compact-chip" @click.stop="emit('compact')">/compact</button>

          <!-- Context meter — circular ring only; the full usage (used/max/pct)
               lives in the tooltip. The ring is aria-hidden, so the trigger
               exposes those numbers via aria-label; focusable so keyboard and
               switch-control users reach the same tooltip hover users see. -->
          <Tooltip :text="ctxTooltip">
            <span
              v-if="status && !hideContext"
              class="ctx-group"
              role="img"
              tabindex="0"
              :aria-label="ctxTooltip"
            >
              <ContextRing :pct="pct" />
              <span class="ctx-num">{{ formatTokens(status.ctxUsed) }}</span>
              <!-- The separator belongs to the cache readout: with no cache rate
                   reported it used to hang after the token count with nothing
                   following it. -->
              <span v-if="status?.cacheHitRate" class="ctx-sep">|</span>
              <span v-if="status?.cacheHitRate" class="cache-badge" :title="`${status.cacheHitRate.toFixed(2)}% cache hit rate`">{{ status.cacheHitRate.toFixed(2) }}%</span>
            </span>
          </Tooltip>

          <!-- Model pill — click to open quick-switch dropdown. In narrow rows
               the label collapses to the chevron only (icon-only); the hover
               tooltip still shows model + effort. -->
          <Tooltip :text="modelPillCollapsed ? modelPillLabel : null">
            <button
              v-if="status"
              type="button"
              class="model-pill lg-glass"
              :class="{ open: dropdownOpen, 'icon-only': modelPillCollapsed }"
              :aria-label="modelPillLabel"
              aria-haspopup="menu"
              :aria-expanded="dropdownOpen"
              @click.stop="toggleDropdown"
            >
              <span class="mp-name">{{ status.model }}</span>
              <span v-if="thinkingSuffix" class="think-suffix">{{ thinkingSuffix }}</span>
              <Icon class="cv" name="chevron-down" size="sm" />
            </button>
          </Tooltip>
          <!-- Send + stop — one toolbar slot. Desktop: `display: contents`, so
               the two keep their own slots exactly as before (stop only visible
               while running). Mobile: both stack in one cell and cross-fade.
               No `lg-glass` on either: they are solid discs, not chips, and
               upstream draws them opaque — the glass wash overrode the disabled
               fill (upstream's faint neutral wash) with a full-strength accent
               one, so a disabled Send read as the primary action. -->
          <div class="send-stop">
            <Tooltip :text="running ? t('composer.interruptTitle') : null">
              <button
                class="stop"
                :class="{ 'is-off': !running }"
                :aria-label="t('composer.interrupt')"
                :aria-hidden="stopHidden ? 'true' : undefined"
                :tabindex="stopHidden ? -1 : undefined"
                @click="emit('interrupt')"
              >
                <Icon name="stop" size="sm" />
              </button>
            </Tooltip>
            <Tooltip :text="sendLabel">
              <button
                class="send"
                :class="{ 'is-starting': starting, 'is-off': running }"
                :aria-label="sendLabel"
                :aria-hidden="sendHidden ? 'true' : undefined"
                :tabindex="sendHidden ? -1 : undefined"
                :disabled="starting || !canSubmit"
                @click="handleSubmit()"
              >
                <Spinner v-if="starting" size="sm" />
                <Icon v-else name="send" size="sm" />
              </button>
            </Tooltip>
          </div>
        </div>

        <!-- Model dropdown — current provider models + controls + more. Positioned by
             inline style (viewport-clamped, flips below when short of space
             above); measured against the toolbar via modelDropdownRef. One
             container for both form factors, as upstream has it: its phone
             capture carries the same `ui-menu model-dropdown`, anchored to the
             right edge. -->
        <div
          v-if="dropdownOpen && status"
          ref="modelDropdownRef"
          class="ui-menu model-dropdown lg-glass"
          :style="modelDropdownStyle"
          role="menu"
          @click.stop
        >
          <!-- Starred / provider models + thinking + more — shared with the
               mobile bottom-sheet variant below. -->
          <ComposerModelMenu
            :models="models"
            :starred-ids="starredIds"
            :status="status"
            :thinking="thinking"
            @select="selectModel"
            @more="closeDropdown(); emit('pickModel')"
            @set-thinking="(level) => emit('setThinking', level)"
          />
        </div>
      </div>
    </div>
    <!-- Composer footer — upstream's `.composer-footer`, the card's SIBLING
         (not its child): the ws-bar's -16px top margin tucks it under the card's
         bottom edge, so the card keeps its own height instead of growing to
         wrap the chip row. The new-session state puts the workspace chip here
         (see the ws-bar markup ConversationPane slots in); the wrapper only
         renders when that slot has content, so it adds no element on any other
         surface. -->
    <div v-if="$slots.footer" class="composer-footer">
      <slot name="footer" />
    </div>
  <!-- Full-window drop target affordance: shown while files are dragged anywhere
       over the app (document-level listeners in useAttachmentUpload). Pure CSS
       show/hide — a Vue <Transition> can strand an invisible node when the drag
       ends before the enter transition starts. -->
  <div class="drop-overlay" :class="{ show: isDragOver }" aria-hidden="true">
    <div class="drop-card">
      <Icon name="file-plus" size="lg" />
      <span>{{ t('composer.dropToAttach') }}</span>
    </div>
  </div>

  <!-- Mobile menu sheets: on ≤640px the slash / mention / add / model menus
       open as grab-handle bottom sheets instead of the anchored floating
       panels above. Teleported to body so the composer card's frost (a
       backdrop-filter) can't become the fixed-position containing block.
       Closing a sheet closes its underlying menu state. -->
  <Teleport to="body">
    <BottomSheet
      :model-value="slashOpen && isMobile"
      :title="t('composer.slashSheetTitle')"
      @update:model-value="(open) => { if (!open) closeSlashMenu(); }"
    >
      <SlashMenu
        layout="sheet"
        :items="slashItems"
        :active-index="slashActive"
        :query="slashQuery"
        :ranges="slashRanges"
        @select="selectSlashCommand"
        @hover="slashActive = $event"
      />
    </BottomSheet>

    <BottomSheet
      :model-value="mentionOpen && isMobile"
      :title="t('composer.mentionSheetTitle')"
      @update:model-value="(open) => { if (!open) closeMentionMenu(); }"
    >
      <MentionMenu
        layout="sheet"
        :items="mentionItems"
        :active-index="mentionActive"
        :loading="mentionLoading"
        :query="mentionQuery"
        @select="selectMentionItem"
        @hover="mentionActive = $event"
      />
    </BottomSheet>

    <BottomSheet
      :model-value="addOpen && isMobile"
      @update:model-value="(open) => { if (!open) closeAdd(); }"
    >
      <div class="msheet-add" role="menu" @click.stop @keydown="onAddKeydown">
        <ComposerAddMenu
          :has-upload="hasUpload"
          :goal-active="goalActive"
          :goal-mode="props.goalMode"
          :goal-can-pause="goalCanPause"
          :goal-can-resume="goalCanResume"
          :plan-on="planOn"
          :plan-armed-on="planArmedOn"
          :swarm-on="swarmOn"
          show-trigger-rows
          @files="runAddRow(openFilePicker)"
          @commands="runAddRow(() => seedTrigger('/'))"
          @mention="runAddRow(() => seedTrigger('@'))"
          @goal-main="goalActive ? runAddRow(() => emit('focusGoal')) : runAddRow(() => emit('toggleGoal'))"
          @plan="choosePlanRow"
          @swarm="chooseSwarmRow"
        />
      </div>
    </BottomSheet>
  </Teleport>
</div>
</template>

<style scoped>
.composer {
  padding: 7px var(--dock-inline-right, 16px) 12px var(--dock-inline-left, 16px);
  background: transparent;
  transition: background 0.12s;
}

.composer.drag-over {
  background: var(--color-accent-soft);
}

/* Full-window drop overlay: pointer-events none — the document-level handlers
   in useAttachmentUpload receive the drop, the overlay is purely visual. */
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-bg) 72%, transparent);
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity var(--duration-base) ease,
    visibility var(--duration-base);
}
.drop-overlay.show {
  opacity: 1;
  visibility: visible;
}
.drop-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-lg);
  border: 1.5px dashed var(--color-accent);
  background: var(--color-bg);
  color: var(--color-accent);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--weight-medium);
  box-shadow: var(--shadow-md);
}

/* Main composer card */
.composer-card {
  --composer-send-size: 32px;
  /* Send glyph box. Upstream's --composer-send-icon-size: the arrow is drawn on
     the icon's own 24px grid, so the box is what sets its drawn size. */
  --composer-send-icon-size: 28px;
  /* Square size for the collapsed-to-icon controls (the model pill's
     icon-only state). Matches the add-button / send-button footprint. */
  --composer-control-size: 32px;
  --composer-send-inset: var(--space-2);
  /* Upstream's card geometry: a 32px corner radius and a single soft drop
     shadow. Both are geometry, not surface colour, so they hold in every
     theme; the literal radius sits behind a local var because the shared
     --radius-* scale stops at 20px. */
  --composer-card-radius: 32px;
  --composer-card-shadow: 0 5px 16px -4px rgba(0, 0, 0, 0.07);
  /* Upstream's card hairline is rgba(255,255,255,.12) — the text colour at
     ~14% (upstream's dark --color-text is rgba(255,255,255,.84)). Expressing
     it that way keeps a visible edge in the light theme too, where a literal
     white hairline would vanish on a light card. */
  --composer-card-border: color-mix(in srgb, var(--color-text) 14%, transparent);
  position: relative;
  border: 1px solid var(--composer-card-border);
  border-radius: var(--composer-card-radius);
  background: var(--color-composer-bg, var(--color-bg));
  box-shadow: var(--composer-card-shadow);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.composer-card:focus-within {
  border-color: var(--color-accent);
  box-shadow: var(--composer-card-shadow), 0 0 0 3px var(--color-accent-soft);
}



/* Attachment strip — the chip itself is the shared AttachmentChip; this is
   only the row layout above the input. */
.att-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0 6px;
}

/* Media rail row — the thumbnails are MediaThumb; this is only the row layout
   above the input. The rail scrolls horizontally in place, so a long attachment
   list never grows the composer. */
.att-rail {
  padding: 4px 0 6px;
}

.att-lightbox {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 23, 28, 0.62);
  /* defocus blur: the shared .lg-scrim utility (lg-frost family, style.css). */
}
.att-lightbox-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: min(960px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
}
.att-lightbox-media {
  max-width: 100%;
  max-height: calc(100vh - 96px);
  border-radius: 6px;
  background: var(--bg);
  box-shadow: var(--shadow-xl);
  object-fit: contain;
}
.att-lightbox-name {
  max-width: 100%;
  color: var(--surface-light);
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 2px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.att-lightbox-close {
  position: absolute;
  top: -14px;
  right: -14px;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255,255,255,0.45);
  border-radius: 50%;
  background: rgba(20,23,28,0.82);
  color: var(--surface-light);
  cursor: pointer;
}

/* Hidden file input (no accept filter — any file type can be attached).
   Kept laid out at 1x1 / opacity 0 instead of display:none: a display:none
   input can be refused by a mobile browser's file picker (iOS Safari), while
   pointer-events:none still takes it out of the touch order. */
.file-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* Wrapper that establishes a positioning context for the popup menus.
   The vertical inset is a variable so the mobile composer can rest tighter
   while the keyboard is down (see the `focused` rules in the ≤640px block);
   the fallbacks are the desktop values. */
.cin-wrap {
  position: relative;
  padding: var(--composer-inset-top, 14px) 16px var(--composer-inset-bottom, 8px);
}

/* Input row */
.input-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

/* Expand toggle — top-right of the textarea */
.expand-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dim);
  cursor: pointer;
  padding: 0;
  transition: background 0.12s, color 0.12s;
}

.expand-btn:hover {
  background: var(--panel2);
  color: var(--color-text);
}

.expand-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.ph {
  position: relative;
  z-index: 1;
  color: var(--faint);
  /* Keep the caret at the normal text colour even when the field is empty:
     the empty state sets `color` to `--faint` (so the placeholder feels soft),
     and an unset caret inherits that faint colour and nearly disappears. */
  caret-color: var(--color-text);
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  font-family: var(--font-ui);
  /* The user's configured font size, not upstream's literal 14px: they set the
     UI size deliberately and reading their own typing at a smaller size than
     their messages was wrong. Upstream's 14px is only correct at upstream's
     default scale. This keeps the composer at the app's setting. */
  font-size: var(--ui-font-size);
  background: transparent;
  /* No top padding: the card's own inset already places the editor row, and
     upstream's contenteditable has zero editor padding — the 9px here pushed
     both placeholder and typed text below the upstream text origin. */
  padding: 0 14px 0 0;
  /* The floor is a variable (fallback = today's comfortable height) so mobile
     can rest tighter while the keyboard is down. autosize() still drives the
     height from content: this only clamps it from below. */
  min-height: var(--composer-input-min-height, 36px);
  max-height: calc(100vh / 4);
  overflow-y: auto;
  line-height: 1.5;
  margin-bottom: var(--composer-input-gap, 6px);
}

/* The native placeholder attribute is kept for screen readers and CSS-disabled
   fallback, but it is invisible because the textarea sits on top of the
   overlay (z-index:1) and the overlay is fully pointer-event transparent. */
.ph::placeholder {
  color: transparent;
}

.ph:not(:placeholder-shown) {
  color: var(--color-text);
}

/* Work-mode pill reserve — upstream keeps the pill out of the text by reserving
   its block space on the editor (`padding-top: var(--wm-pill-block-reserve)`,
   the pill's own height plus the gap), which is why its placeholder starts below
   the pill instead of under it. Without the reserve the pill sat on the
   textarea's first line and covered the placeholder. `.ph` and `.ph-overlay`
   must keep identical padding (see the .ph-overlay note), so both get it. */
.cin-wrap.has-wm-pill .ph,
.cin-wrap.has-wm-pill .ph-overlay {
  padding-top: calc(var(--ui-font-size) * 1.5 + var(--space-1));
}

/* Placeholder overlay — sits BEHIND the textarea in the flex row, fully
   pointer-event transparent so clicks fall through to the textarea. The
   overlay is hidden the moment text is typed (showPlaceholderOverlay) so it
   never competes with the caret or the IME composition. */
.ph-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 2px;
  /* must match .ph's padding exactly so the placeholder starts on the same
     pixel the caret does when typing begins. Left padding is zero: the
     textarea's box edge already sits on the toolbar's + icon x-position, so
     the text aligns with that glyph (upstream's uniform composer inset). */
  padding: 0 14px 0 0;
  color: var(--muted);
  font-family: var(--font-ui);
  /* must match .ph's size exactly, or the placeholder and the caret sit on
     different baselines (upstream's editor metrics). */
  font-size: var(--ui-font-size);
  line-height: 1.5;
  pointer-events: none;
  user-select: none;
  overflow: hidden;
  z-index: 0;
}
.ph-overlay-primary {
  font-weight: var(--weight-medium);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* When the composer is focused the overlay stays visible (we still want to
   show the placeholder copy behind a moving caret), but its colour softens a
   touch — mirrors the upstream pattern. */
.composer-card:focus-within .ph-overlay-primary {
  color: var(--dim);
}

/* Expanded editor: a tall composing area at ~70% of the viewport — clearly
   larger than the auto-grow cap, while leaving room for the chat header, the
   bottom toolbar row, and padding so nothing gets clipped. Content beyond it
   scrolls internally. */
.composer.expanded .ph {
  min-height: 70vh;
  max-height: 70vh;
}

/* /compact chip */
.compact-chip {
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  color: var(--color-warning);
  font-family: var(--mono);
  font-size: var(--ui-font-size);
  padding: 0 4px;
  cursor: pointer;
  height: 19px;
  line-height: 17px;
  flex: none;
}
.compact-chip:hover { background: var(--panel2); }

/* Send button — circular icon. Always "send"; while running it enqueues
   (handled upstream). On desktop the interrupt is a separate Stop button so the
   two are never confused; on mobile the two share one slot.

   Fill: upstream's send is a near-white disc (--color-send-bg) carrying a dark
   glyph, not a saturated accent disc. The glyph therefore takes the theme's
   page background — dark in the dark theme (on the white disc), white in the
   light theme (where --color-send-bg maps to the accent seed, keeping the
   fork's blue light send).
   Empty input / sending: upstream disables the control and paints it with
   --color-send-bg-disabled; the fork mirrors that in .send:disabled below,
   while restarting the enabled fill for the sending spinner.
   Geometry, shadow and motion are upstream's rule for rule: --radius-full, the
   --shadow-send / --shadow-send-hover pair, and the background / transform /
   box-shadow transition. The disc carries no glass class — the glass wash
   replaced the disabled fill with a full-strength accent one. */
.send {
  width: var(--composer-send-size);
  height: var(--composer-send-size);
  min-width: var(--composer-send-size);
  border-radius: var(--radius-full);
  background: var(--color-send-bg, var(--color-accent));
  color: var(--color-bg);
  border: none;
  box-shadow: var(--shadow-send);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background var(--duration-slow) var(--ease-out),
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-slow) var(--ease-out);
  position: relative;
}

.send:hover:not(:disabled) {
  background: var(--color-send-bg-hover, var(--color-accent-hover));
  box-shadow: var(--shadow-send-hover);
}

.send:active {
  transform: scale(0.92);
}

/* Empty input: no text and no ready attachment. Upstream paints the disc with
   its disabled background token and the glyph with --color-send-icon-disabled. */
.send:disabled {
  cursor: not-allowed;
  background: var(--color-send-bg-disabled, rgba(255, 255, 255, 0.1));
  color: var(--color-send-icon-disabled, rgba(255, 255, 255, 0.28));
}

/* Sending (starting) is disabled too, but keeps the enabled fill and glyph
   (upstream's `.send.is-starting:disabled`) so the spinner on the disc reads. */
.send.is-starting:disabled {
  background: var(--color-send-bg, var(--color-accent));
  color: var(--color-bg);
}

.send:disabled:active {
  transform: none;
}

/* Spinner-on-send: recolor the ring so the arc reads on the fill.
   Spinner.vue styles are scoped, so pierce them with :deep(). */
.send.is-starting :deep(.ui-spinner) {
  color: var(--color-bg);
}

.send.is-starting :deep(.ui-spinner__track) {
  stroke: color-mix(in srgb, var(--color-bg) 32%, transparent);
}

/* Send glyph box — upstream's rule for rule. The control's own --p-ic-lg (20px)
   drew the arrow noticeably smaller than upstream's 28px box. */
.send svg {
  flex: none;
  width: var(--composer-send-icon-size);
  height: var(--composer-send-icon-size);
}

/* Stop button — sibling of Send, shown only while running. Upstream rule for
   rule: a neutral --color-subtle disc carrying the danger-tinted glyph
   (--color-stop-glyph), which fills solid danger and flips the glyph to
   --color-text-on-accent on hover. */
.stop {
  width: var(--composer-send-size);
  height: var(--composer-send-size);
  min-width: var(--composer-send-size);
  border-radius: var(--radius-full);
  background: var(--color-subtle);
  color: var(--color-stop-glyph);
  border: none;
  box-shadow: var(--shadow-xs);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  transition:
    background var(--duration-base) ease,
    color var(--duration-base) ease,
    transform var(--duration-fast) ease;
}
.stop:hover {
  background: var(--color-danger);
  color: var(--color-text-on-accent);
}
.stop:active {
  transform: scale(0.92);
}
.stop svg {
  flex: none;
  width: var(--p-ic-lg);
  height: var(--p-ic-lg);
}

/* Send / stop live in one toolbar slot. On desktop the slot is `display:
   contents`, so each button keeps its own flex item exactly as before, and the
   idle stop button is removed with display:none (what its old v-if did).
   Mobile (≤640px) instead stacks the pair in a single cell and cross-fades
   them — see the .send-stop rules in the mobile block below. */
.send-stop {
  display: contents;
}
.send-stop .stop.is-off {
  display: none;
}

/* Bottom toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* Upstream's --space-2 row gap. It reads as nothing in a two-item row, but it
     is what makes the flexed toolbar-right exactly 8px narrower than the row's
     free width — the width upstream's own rows measure. */
  gap: var(--space-2);
  padding: var(--space-1) var(--composer-send-inset) var(--composer-send-inset);
  position: relative;
}

.menu-measure {
  position: absolute;
  width: max-content;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  /* Upstream's --space-1 — the gap every pill in the row is spaced by. */
  gap: var(--space-1);
  min-width: 0;
}
/* Narrow-window crush fix: the left group never shrinks (it clips its own
   overflow when the row is truly out of space — the add button is the control
   users reach for), while the right group flexes to fill the remainder and
   right-aligns, its items yielding per their own min-width:0 / flex-shrink
   priorities instead of overlapping. */
.toolbar-left {
  flex: none;
  padding-right: var(--space-2);
  overflow: hidden;
}
.toolbar-right {
  flex: 1 1 auto;
  justify-content: flex-end;
}

/* Permission pill — upstream's metrics: a full-height capsule
   (--composer-control-size) with the label at --ui-font-size-sm on a 1
   line-height, a wider right pad than left (the asymmetric pad that seats the
   glyph), and the hover painted by an ::after overlay. The overlay is the
   upstream mechanism (the element's own background stays untouched), which is
   why a hover reads on both sides of the liquid-glass toggle — a plain
   `.perm-pill:hover { background }` would be outranked by the global glass
   rule in style.css and vanish whenever glass is on. */
.perm-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--composer-control-size);
  padding: 0 var(--space-3) 0 var(--space-2);
  /* Transparent hairline reserves the 1px slot for the liquid-glass rim without
     adding a visible border when the feature is off. */
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  font-size: var(--ui-font-size-sm);
  line-height: 1;
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
  transition:
    background var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out);
  font-family: var(--font-ui);
  font-weight: var(--weight-medium);
  /* Sized to its content (upstream's `.perm-pill` is `flex: none`): the label
     must never be squeezed to nothing. A too-long label truncates through
     .perm-pill-label's ellipsis at narrow widths; the glyph stays fixed. */
  flex: none;
}
.perm-pill::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--radius-full);
  background: var(--color-hover);
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
  pointer-events: none;
}
.perm-pill:hover::after {
  opacity: 1;
}
.perm-pill-icon {
  flex: none;
}
.perm-pill-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The "open" state wants the accent wash so the active dropdown is
   unmistakable. */
.perm-pill.open {
  background: var(--color-accent-soft);
}
.perm-pill.perm-manual {
  /* The pill stays muted; the menu's Always-Ask row uses --color-text instead
     (upstream's split between the pill and the row). */
  color: var(--color-text-muted);
}
.perm-pill.perm-yolo {
  color: var(--color-warning);
}
.perm-pill.perm-auto {
  color: var(--color-danger);
}

/* Round the "+" trigger into a capsule to match the pills — the IconButton
   default is a rounded square. */
.composer-attach {
  border-radius: var(--radius-full);
}

/* Context group — circular ring. Focusable for keyboard / switch access to its
   aria-label and tooltip (see template), so it needs a focus ring. */
.ctx-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  /* Upstream pads the group vertically only — the ring's own inset supplies the
     horizontal breathing room. */
  padding: 2px 0;
  border-radius: var(--radius-xs);
}
.ctx-group:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.ctx-num {
  font-size: var(--ui-font-size);
  color: var(--muted);
  font-family: var(--font-ui);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  letter-spacing: 0;
  line-height: 16px;
}

.cache-badge {
  font-size: calc(var(--ui-font-size) - 1px);
  color: var(--accent-primary);
  opacity: 0.7;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  letter-spacing: 0;
  line-height: 16px;
}

.ctx-sep {
  font-size: calc(var(--ui-font-size) - 1px);
  color: var(--muted);
  font-family: var(--font-mono);
  line-height: 16px;
}

/* Model pill — upstream's metrics, same capsule geometry as the permission
   pill. The hover is the upstream ::after overlay, not a background on the
   element: the glass rule outranks any `.model-pill:hover` background, so a
   component-level background would never paint. */
.model-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--composer-control-size);
  padding: 0 var(--space-3);
  /* Transparent hairline reserves the 1px slot for the liquid-glass rim without
     adding a visible border when the feature is off. */
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  font-size: var(--ui-font-size);
  line-height: var(--leading-normal);
  color: var(--color-text);
  font-family: var(--font-ui);
  font-weight: var(--weight-medium);
  cursor: pointer;
  user-select: none;
  transition:
    background var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out),
    transform var(--duration-fast) var(--ease-out);
  position: relative;
  overflow: hidden;
  max-width: 100%;
  /* Yields to the row: the label truncates (min-width:0 on .mp-name) well
     before the pill ever pushes its neighbours out. */
  flex: 0 1 auto;
  min-width: 0;
}
.model-pill::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--radius-full);
  background: var(--color-hover);
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
  pointer-events: none;
}
.model-pill:hover::after {
  opacity: 1;
}
.model-pill:active {
  transform: scale(0.97);
}
/* Icon-only collapse — the model label gives way to a bare chevron pill in
   very narrow rows (see modelPillCollapsed); the interlocking .lg-glass
   material keeps its tint + rim because the .lg-glass class is never removed. */
.model-pill.icon-only {
  width: var(--composer-control-size);
  height: var(--composer-control-size);
  padding: 0;
  justify-content: center;
  flex: none;
}
.model-pill.icon-only .mp-name,
.model-pill.icon-only .think-suffix {
  display: none;
}
.model-pill.open {
  background: var(--color-accent-soft);
}
.model-pill .mp-name {
  flex: 0 8 auto;
  font-weight: var(--weight-medium);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: min(40vw, 170px);
}
.model-pill .think-suffix {
  color: var(--color-accent);
  font-weight: var(--weight-medium);
  flex: none;
}
.model-pill .cv {
  color: var(--faint);
  flex: none;
  transition:
    transform var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out);
}
/* The chevron steps its colour on hover/open (`--faint` → `--dim`) and flips
   180° while the quick-switch menu is open. */
.model-pill:hover .cv,
.model-pill.open .cv {
  color: var(--dim);
}
.model-pill.open .cv {
  transform: rotate(180deg);
}

/* Model dropdown — anchored to the toolbar; the flip / horizontal clamp comes
   from the inline style computed in positionModelDropdown. The frame itself
   never scrolls: ComposerModelMenu's .md-list region owns the overflow so the
   thinking row / cache note / "more models" row stay pinned in view. */
.model-dropdown {
  position: absolute;
  z-index: var(--z-dropdown);
  min-width: 200px;
  max-height: min(70vh, 520px);
  overflow: hidden;
  /* Upstream's menu surface: translucent raised ink over a 24px backdrop blur,
     with its own shadow. Measured from the live page. */
  background: var(--color-menu-bg, var(--color-surface-raised));
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
  backdrop-filter: blur(24px) saturate(1.8);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2), 0 3px 9px rgba(0, 0, 0, 0.24);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-family: var(--font-ui);
}

/* Concentric corners: the frame is radius-lg, so the outermost regions pick up
   radius-md (≈ frame radius minus padding) on their outer corners. */
.model-dropdown > :first-child {
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
}
.model-dropdown > :last-child {
  border-bottom-left-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-md);
}

/* Permission dropdown — anchored to the toolbar left side */
.perm-dropdown {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 10px;
  z-index: var(--z-dropdown);
  min-width: 220px;
  width: max-content;
  max-width: calc(100vw - var(--space-8));
  /* Same measured menu surface as the model dropdown (upstream's permission
     trigger was not measurable, so the anchor stays the fork's). */
  background: var(--color-menu-bg, var(--color-surface-raised));
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
  backdrop-filter: blur(24px) saturate(1.8);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2), 0 3px 9px rgba(0, 0, 0, 0.24);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.pd-row {
  display: grid;
  grid-template-columns: var(--p-ic-md) var(--composer-menu-desc-width, max-content) var(--p-ic-sm);
  column-gap: 7px;
  row-gap: 2px;
  align-items: start;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 7px;
  border-radius: var(--radius-dropdown-row);
  text-align: left;
}
.pd-row:hover { background: var(--color-hover); }
.pd-row.is-current { background: var(--color-hover); }

.pd-icon {
  grid-column: 1;
  grid-row: 1;
  width: var(--p-ic-md);
  min-height: 1lh;
  font-size: var(--ui-font-size);
  font-weight: var(--weight-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: var(--leading-tight);
}
.pd-row .pd-icon svg {
  width: var(--p-ic-md);
  height: var(--p-ic-md);
  color: inherit;
}

.pd-check {
  grid-column: 3;
  grid-row: 1;
  width: var(--p-ic-sm);
  min-height: 1lh;
  color: var(--color-accent);
  font-size: var(--ui-font-size);
  font-weight: var(--weight-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: var(--leading-tight);
}
.pd-row .pd-check svg {
  width: var(--p-ic-sm);
  height: var(--p-ic-sm);
  color: inherit;
}

.pd-info {
  display: contents;
}

.pd-name {
  grid-column: 2;
  grid-row: 1;
  font-family: var(--font-ui);
  font-size: var(--ui-font-size);
  font-weight: var(--weight-medium);
  line-height: var(--leading-tight);
}

.pd-desc {
  grid-column: 2;
  grid-row: 2;
  width: var(--composer-menu-desc-width, auto);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: var(--weight-caption);
  color: var(--color-text-muted);
  line-height: var(--leading-tight);
}

/* Add menu ("+" next to the input) — Files / Goal / Plan / Swarm.
   z-index lifts the whole control (incl. its upward-opening menu) above the
   composer input row, which otherwise paints over the menu. flex:none keeps
   the trigger from being crushed when the row is narrow. */
.add { position: relative; display: inline-flex; z-index: var(--z-sticky); flex: none; }
.composer-attach.open { background: var(--color-accent-soft); }

.add-menu {
  position: fixed;
  z-index: var(--z-dropdown);
  min-width: 220px;
  /* Fallback width only: toggleAddMenu writes the composer card's left edge and
     width inline, because upstream's add menu spans the card (`left:0;right:0`)
     rather than shrinking to its content. */
  width: max-content;
  max-width: calc(100vw - var(--space-8));
  /* Upstream's wide dock menu uses the frosted ink (measured
     rgba(18,18,18,0.7)) with the same blur as the other menus. */
  background: var(--color-menu-bg-frost, var(--color-surface-raised));
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
  backdrop-filter: blur(24px) saturate(1.8);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2), 0 3px 9px rgba(0, 0, 0, 0.24);
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* Work-mode pill — armed/active plan or armed goal, floating over the
   textarea's top-left (`.cin-wrap` provides the positioning context). */
.wm-pill {
  position: absolute;
  top: 14px;
  left: 16px;
  z-index: var(--z-sticky);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: calc(var(--ui-font-size) * 1.5);
  padding: 0 calc((var(--ui-font-size) * 1.5 - 18px) / 2) 0 var(--space-2);
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  font-family: var(--font-ui);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--weight-medium);
  line-height: calc(var(--ui-font-size) * 1.5);
  white-space: nowrap;
  user-select: none;
}
.wm-x {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
}
.wm-x :deep(svg) { width: var(--p-ic-sm); height: var(--p-ic-sm); }

/* ---- Narrow composer toolbar ----------------------------------------------
   Below a wide desktop the chat column can be narrower than the full toolbar
   needs — with the sidebar open on a small window, and on phones. The desktop
   toolbar shows every control on one row and toolbar-left / toolbar-right are
   overflow:hidden, so without shedding ink the row clips its own content. The
   context ring stays visible at every width (it is the live context-pressure
   signal; the exact numbers live in its tooltip), the model name truncates
   earlier, and the permission label is capped so the ring and the send button
   are never squeezed out. Mobile (≤640px) additionally hides perm / modes via
   the rules below (those live in MobileSettingsSheet there). */
@media (max-width: 980px) {
  /* The model name is capped at min(40vw, 170px); trim it further so the ring
     and send button are not squeezed out on a narrow column. */
  .model-pill .mp-name {
    max-width: 130px;
  }
  /* Permission label is short (manual/yolo/auto); cap the LABEL rather than
     the pill so the pill always keeps its glyph and a readable label, and the
     row is still never pushed past its container. 72px + the pill's 16px icon,
     4px gap, 14px padding and hairline lands on the same ~107px footprint the
     pill-level cap used to enforce. */
  .perm-pill-label {
    max-width: 72px;
  }
}

/* ---- Mobile composer (prototype): round add button + rounded panel input +
       round blue send with a soft shadow. The .cin container loses its border
       and acts as a flex row; the textarea itself becomes the pill input. ---- */
@media (max-width: 640px) {
  .composer {
    padding:
      9px
      var(--dock-inline-right, max(12px, var(--safe-right)))
      max(24px, var(--safe-bottom))
      var(--dock-inline-left, max(12px, var(--safe-left)));
    /* Keyboard-down resting shape: a tighter editor and less inset around it,
       so more of the transcript stays visible while reading. Focusing the
       field (the keyboard is up then on touch) restores the comfortable inset
       from the desktop values in the var() fallbacks. The editor floor stays
       above one 16px line (24px), so the grown-state check in
       restingHeightPx() cannot flip between the two states, and autosize()
       keeps driving the height from content — a multi-line draft is never
       squashed by this. */
    --composer-inset-top: 9px;
    --composer-inset-bottom: 4px;
    --composer-input-min-height: 28px;
    --composer-input-gap: 2px;
  }
  .composer.focused {
    --composer-inset-top: 14px;
    --composer-inset-bottom: 8px;
    --composer-input-min-height: 36px;
    --composer-input-gap: 6px;
  }
  /* Layout-affecting, so both ride the gentle preset. */
  .cin-wrap {
    transition:
      padding-top var(--duration-spring-gentle) var(--spring-gentle),
      padding-bottom var(--duration-spring-gentle) var(--spring-gentle);
  }
  .ph {
    transition:
      min-height var(--duration-spring-gentle) var(--spring-gentle),
      margin-bottom var(--duration-spring-gentle) var(--spring-gentle);
  }
  .composer-card {
    --composer-send-size: 36px;
    /* Align the icon-only controls (model pill / add button) with the 36px
       send/stop so the collapsed toolbar reads as one row of matching
       circles (mirrors the upstream mobile composer). */
    --composer-control-size: 36px;
    max-width: 100%;
  }
  .input-row {
    gap: 6px;
    min-width: 0;
  }
  /* Send → 36px round (hide the SVG arrow, show only the ::after glyph) */
  .send {
    width: var(--composer-send-size);
    height: var(--composer-send-size);
    min-width: var(--composer-send-size);
    padding: 0;
    border-radius: 50%;
    font-size: 0;
    align-self: flex-end;
    position: relative;
  }
  .send svg {
    display: none;
  }
  .send::after {
    content: "↑";
    /* Glyph size shared by send and stop; sized to read well inside the 36px
       circle (the desktop icon box is --p-ic-lg 20px, these are scaled up for
       the touch-first button). The colour is inherited from .send so the
       disabled / starting states reach this glyph too. */
    font-size: 22px;
    line-height: 1;
  }
  /* Stop → 36px round "■" glyph to match the mobile Send sizing. */
  .stop {
    width: var(--composer-send-size);
    height: var(--composer-send-size);
    min-width: var(--composer-send-size);
    padding: 0;
    border-radius: 50%;
    font-size: 0;
    align-self: flex-end;
    position: relative;
  }
  .stop svg {
    display: none;
  }
  .stop::after {
    content: "■";
    /* Same 22px size as the send glyph so the pair reads as one unit. */
    font-size: 22px;
    line-height: 1;
  }
  /* One send/stop slot: both buttons share a single cell and cross-fade, so
     the toolbar keeps one footprint through a turn instead of growing a second
     circle when the agent starts working. Opacity rides the gentle preset, the
     scale the responsive one. `visibility` is held open for the fade-out (0s
     + delay) so the leaving button stops taking taps and leaves the tab order
     only once it is invisible. */
  .send-stop {
    display: grid;
    margin-left: var(--space-2);
  }
  .send-stop .send,
  .send-stop .stop,
  .send-stop .stop.is-off {
    display: flex;
    grid-area: 1 / 1;
    margin-left: 0;
    transition:
      opacity var(--duration-spring-gentle) var(--spring-gentle),
      transform var(--duration-spring-responsive) var(--spring-responsive),
      background var(--duration-spring-gentle) var(--spring-gentle),
      visibility 0s;
  }
  .send-stop .send.is-off,
  .send-stop .stop.is-off {
    opacity: 0;
    transform: scale(0.7);
    pointer-events: none;
    visibility: hidden;
    transition:
      opacity var(--duration-spring-gentle) var(--spring-gentle),
      transform var(--duration-spring-responsive) var(--spring-responsive),
      background var(--duration-spring-gentle) var(--spring-gentle),
      visibility 0s linear var(--duration-spring-gentle);
  }

  /* Mobile toolbar: hide secondary controls; the "+" add menu / context ring /
     model / send stay visible. The permission pill moves into the
     MobileSettingsSheet; the work-mode chip stays, as it does upstream. The
     context ring stays at every width by design —
     it is the live context-pressure signal on a phone (the exact numbers live
     in the ring's tooltip). The /compact chip also stays so compaction is one
     tap away at ≥80% usage. */
  /* Upstream keeps the work-mode chip (armed goal / plan) on a phone — measured
     visible at the composer's top-left — so only the permission pill is dropped
     here. Hiding it made every mobile state report upstream's "Goal" as missing. */
  .perm-pill {
    display: none;
  }

  /* Model dropdown on mobile — width caps only; the flip / clamp comes from
     the inline style computed while open. */
  .model-dropdown {
    min-width: 180px;
    max-width: calc(100vw - 24px);
  }

  /* Bump mobile font sizes +2px and pin input at 16px to prevent iOS zoom.
     Height (min 36px / max one quarter of the viewport) is inherited from the
     base .ph rule so the box auto-grows the same way on touch and desktop. */
  .ph {
    /* Pinned at 16px to prevent iOS auto-zoom on focus (not part of UI font scale). */
    font-size: 16px;
  }
  .model-pill,
  .composer-attach {
    font-size: var(--ui-font-size);
  }
  .toolbar {
    gap: 6px;
    min-width: 0;
  }
  .toolbar-left,
  .toolbar-right {
    min-width: 0;
  }
  .model-pill {
    max-width: min(52vw, 220px);
    /* The pill is the composer's model-switch entry; at desktop height it
       measures 27px — under the touch floor, and it can't take the ::before
       halo the round controls use because it clips its own overflow. Raise the
       box itself (the collapsed variant keeps its 36px circle). */
    min-height: 44px;
  }
  .model-pill.icon-only {
    min-height: var(--composer-control-size);
  }
  .model-pill .mp-name {
    max-width: min(40vw, 170px);
  }
  .pd-name {
    font-size: var(--ui-font-size);
  }
  .pd-desc {
    font-size: var(--text-xs);
  }
}

/* Upstream's add-menu scroll box: desktop popover only, `.add-menu > .am-scroll`
   with the rows as its children. Upstream rule for rule; values in the fork's
   tokens where a token exists, otherwise upstream's literal. */
.am-scroll {
  /* Upstream --p-add-menu-h: var(--p-slash-menu-h) → 228px */
  max-height: 228px;
  /* Upstream --menu-row-hug: var(--space-1-5) → 6px */
  margin: 0 -6px;
  padding: 0 6px;
  overflow-y: auto;
  scrollbar-width: none;
  display: flex;
  flex-direction: column;
  /* Upstream --menu-rows-seam */
  gap: 1px;
}
.am-scroll::-webkit-scrollbar {
  display: none;
}

/* Mobile bottom-sheet content wrapper for the add menu, upstream's `.msheet-add`:
   the sheet owns the surface, this lays the rows out in a column. Upstream caps
   nothing here — the list scrolls with the sheet, not inside itself. */
.msheet-add {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 6px;
  font-family: var(--font-ui);
}

/* Touch devices (phones/tablets with no hover): widen the hit area of the
   mobile composer's round controls — the 36px circles fall short of the 44px
   touch target, so a transparent ::before extends each one's interaction
   zone (upstream does the same via an inset overlay). The expand button is
   smaller still, so it gets a wider halo. The model pill is excluded: it
   clips overflow (label ellipsis), which would also clip the halo. */
@media (max-width: 640px) and (hover: none) {
  .send,
  .stop,
  .expand-btn,
  .composer-attach {
    position: relative;
  }
  .send::before,
  .stop::before,
  .expand-btn::before,
  .composer-attach::before {
    content: "";
    position: absolute;
    inset: -6px;
  }
  .expand-btn::before {
    inset: -11px;
  }
  /* The "+" is an md IconButton (32px), a step smaller than the 36px circles it
     sits beside, so it needs the extra reach to clear the touch floor. */
  .composer-attach::before {
    inset: -8px;
  }
}

/* NOTE: Composer overrides live in src/style.css (global), NOT here. Scoped
   `.cin` rules did NOT reliably win the cascade against the base `.cin` (the
   input stayed square + mono), so they were moved to the global sheet where they
   apply. */
</style>
