// apps/kimi-web/src/lib/icons.ts
// Single source of truth for apps/kimi-web icons (design-system §02).
//
// Icons come from three collections, all bundled by unplugin-icons at build
// time — only the icons listed below end up in the production bundle:
//   - `~icons/kimi/*` — Kimi Design System icons (24×24 outlined,
//     fill="currentColor"), local SVGs under src/icons/kimi/ registered as a
//     custom collection in vite.config.ts. Preferred when a Kimi icon exists
//     for the intent.
//   - `~icons/tabler/*` — Tabler Icons (https://tabler.io/icons, MIT),
//     24×24 stroke-based (stroke="currentColor"); used for the sidebar
//     panel toggle, which neither pack above covers well.
//   - `~icons/ri/*` — Remix Icon (https://remixicon.com/, Apache-2.0) for
//     the remaining intents.
// Each icon is imported twice: once as a Vue component (for <Icon name=... />)
// and once as a `?raw` SVG string (for iconSvg() in v-html contexts such as
// lib/toolMeta.ts).
//
// All collections share the 24x24 source grid and follow currentColor; the
// rendered size comes from the size token prop. Colour follows text.
//
// Two consumers share this registry:
//   - the <Icon> Vue component (components/ui/Icon.vue) for template use;
//   - iconSvg() below, for v-html contexts (e.g. lib/toolMeta.ts).

import type { Component } from 'vue';

// Components (Kimi collection) ----------------------------------------------
import KimiAddConversation from '~icons/kimi/add-conversation';
import KimiArrowLeft from '~icons/kimi/arrow-left';
import KimiArrowRight from '~icons/kimi/arrow-right';
import KimiLink from '~icons/kimi/link';
import KimiFolder from '~icons/kimi/folder';
import KimiFolderOpen from '~icons/kimi/folder-open';
import KimiHand from '~icons/kimi/hand';
import KimiListLines from '~icons/kimi/list-lines';
import KimiChevronDown from '~icons/kimi/chevron-down';
import KimiCircleCheck from '~icons/kimi/circle-check';
import KimiPanelCollapseRight from '~icons/kimi/panel-collapse-right';
import KimiLeftPanel from '~icons/kimi/left-panel';
import KimiLeftPanelExpand from '~icons/kimi/left-panel-expand';
import KimiRightPanel from '~icons/kimi/right-panel';
import KimiRightPanelExpand from '~icons/kimi/right-panel-expand';
import KimiMore from '~icons/kimi/more';
import KimiPlus from '~icons/kimi/plus';
import KimiFlask from '~icons/kimi/flask';
import KimiMicroscope from '~icons/kimi/microscope';
import KimiRobot from '~icons/kimi/robot';
import KimiSearch from '~icons/kimi/search';
import KimiThinking from '~icons/kimi/thinking';
import KimiSend from '~icons/kimi/send';
import KimiPencilFilled from '~icons/kimi/pencil-filled';
import KimiTerminalFilled from '~icons/kimi/terminal-filled';
import KimiAgentFilled from '~icons/kimi/agent-filled';
import KimiSetting from '~icons/kimi/setting';
import KimiShieldExclamation from '~icons/kimi/shield-exclamation';
import KimiShieldQuestion from '~icons/kimi/shield-question';
import KimiTrash from '~icons/kimi/trash';
import KimiViewFlat from '~icons/kimi/view-flat';
import KimiViewGrouped from '~icons/kimi/view-grouped';
import KimiCopy from '~icons/kimi/copy';
import KimiPencil from '~icons/kimi/pencil';
import KimiDownload from '~icons/kimi/download';
import KimiArchive from '~icons/kimi/archive';

// Components (Tabler) ---------------------------------------------------------
import TablerSidebarLeftExpand from '~icons/tabler/layout-sidebar-left-expand';
import TablerSidebarRightExpand from '~icons/tabler/layout-sidebar-right-expand';
import TablerPaperclip from '~icons/tabler/paperclip';
import TablerListNumbers from '~icons/tabler/list-numbers';
import TablerRefresh from '~icons/tabler/refresh';
import TablerTextWrap from '~icons/tabler/text-wrap';
import TablerTextWrapDisabled from '~icons/tabler/text-wrap-disabled';

// Components (Remix) ---------------------------------------------------------
import RiAlertLine from '~icons/ri/alert-line';
import RiArchiveLine from '~icons/ri/archive-line';
import RiArrowDownLine from '~icons/ri/arrow-down-line';
import RiArrowGoBackLine from '~icons/ri/arrow-go-back-line';
import RiArrowLeftSLine from '~icons/ri/arrow-left-s-line';
import RiArrowRightSLine from '~icons/ri/arrow-right-s-line';
import RiArrowUpLine from '~icons/ri/arrow-up-line';
import RiArrowUpSLine from '~icons/ri/arrow-up-s-line';
import RiAtLine from '~icons/ri/at-line';
import RiBracesLine from '~icons/ri/braces-line';
import RiCalendarCloseLine from '~icons/ri/calendar-close-line';
import RiCalendarScheduleLine from '~icons/ri/calendar-schedule-line';
import RiCalendarTodoLine from '~icons/ri/calendar-todo-line';
import RiCheckLine from '~icons/ri/check-line';
import RiCloseLine from '~icons/ri/close-line';
import RiCodeLine from '~icons/ri/code-line';
import RiCollapseDiagonalLine from '~icons/ri/collapse-diagonal-line';
import RiDownloadLine from '~icons/ri/download-line';
import RiDraggable from '~icons/ri/draggable';
import RiEmotionLine from '~icons/ri/emotion-line';
import RiEqualizerLine from '~icons/ri/equalizer-line';
import RiExpandDiagonalLine from '~icons/ri/expand-diagonal-line';
import RiExternalLinkLine from '~icons/ri/external-link-line';
import RiFileAddLine from '~icons/ri/file-add-line';
import RiFileCopyLine from '~icons/ri/file-copy-line';
import RiFileEditLine from '~icons/ri/file-edit-line';
import RiFileLine from '~icons/ri/file-line';
import RiFileTextLine from '~icons/ri/file-text-line';
import RiFlashlightLine from '~icons/ri/flashlight-line';
import RiFolderAddLine from '~icons/ri/folder-add-line';
import RiFolderFill from '~icons/ri/folder-fill';
import RiGitForkLine from '~icons/ri/git-fork-line';
import RiGitPullRequestLine from '~icons/ri/git-pull-request-line';
import RiGlobalLine from '~icons/ri/global-line';
import RiImageLine from '~icons/ri/image-line';
import RiInformationLine from '~icons/ri/information-line';
import RiListCheck from '~icons/ri/list-check';
import RiListUnordered from '~icons/ri/list-unordered';
import RiLoginBoxLine from '~icons/ri/login-box-line';
import RiMailLine from '~icons/ri/mail-line';
import RiMessageLine from '~icons/ri/message-line';
import RiPauseFill from '~icons/ri/pause-fill';
import RiPencilLine from '~icons/ri/pencil-line';
import RiPlayFill from '~icons/ri/play-fill';
import RiPushpinFill from '~icons/ri/pushpin-fill';
import RiPushpinLine from '~icons/ri/pushpin-line';
import RiQuestionLine from '~icons/ri/question-line';
import RiSortDesc from '~icons/ri/sort-desc';
import RiSparklingLine from '~icons/ri/sparkling-line';
import RiStarFill from '~icons/ri/star-fill';
import RiStarLine from '~icons/ri/star-line';
import RiStopFill from '~icons/ri/stop-fill';
import RiSubtractLine from '~icons/ri/subtract-line';
import RiTargetLine from '~icons/ri/target-line';
import RiTerminalBoxLine from '~icons/ri/terminal-box-line';
import RiTimeLine from '~icons/ri/time-line';
import RiToolsLine from '~icons/ri/tools-line';
import RiUnpinLine from '~icons/ri/unpin-line';
import RiUserLine from '~icons/ri/user-line';

// Raw SVG strings (Kimi collection) -----------------------------------------
import RawKimiAddConversation from '~icons/kimi/add-conversation?raw';
import RawKimiArrowLeft from '~icons/kimi/arrow-left?raw';
import RawKimiArrowRight from '~icons/kimi/arrow-right?raw';
import RawKimiChevronDown from '~icons/kimi/chevron-down?raw';
import RawKimiCircleCheck from '~icons/kimi/circle-check?raw';
import RawKimiPanelCollapseRight from '~icons/kimi/panel-collapse-right?raw';
import RawKimiLeftPanel from '~icons/kimi/left-panel?raw';
import RawKimiLeftPanelExpand from '~icons/kimi/left-panel-expand?raw';
import RawKimiRightPanel from '~icons/kimi/right-panel?raw';
import RawKimiRightPanelExpand from '~icons/kimi/right-panel-expand?raw';
import RawKimiLink from '~icons/kimi/link?raw';
import RawKimiFolder from '~icons/kimi/folder?raw';
import RawKimiFolderOpen from '~icons/kimi/folder-open?raw';
import RawKimiHand from '~icons/kimi/hand?raw';
import RawKimiListLines from '~icons/kimi/list-lines?raw';
import RawKimiMore from '~icons/kimi/more?raw';
import RawKimiPlus from '~icons/kimi/plus?raw';
import RawKimiFlask from '~icons/kimi/flask?raw';
import RawKimiMicroscope from '~icons/kimi/microscope?raw';
import RawKimiRobot from '~icons/kimi/robot?raw';
import RawKimiSearch from '~icons/kimi/search?raw';
import RawKimiThinking from '~icons/kimi/thinking?raw';
import RawKimiSend from '~icons/kimi/send?raw';
import RawKimiPencilFilled from '~icons/kimi/pencil-filled?raw';
import RawKimiTerminalFilled from '~icons/kimi/terminal-filled?raw';
import RawKimiAgentFilled from '~icons/kimi/agent-filled?raw';
import RawKimiSetting from '~icons/kimi/setting?raw';
import RawKimiShieldExclamation from '~icons/kimi/shield-exclamation?raw';
import RawKimiShieldQuestion from '~icons/kimi/shield-question?raw';
import RawKimiTrash from '~icons/kimi/trash?raw';
import RawKimiViewFlat from '~icons/kimi/view-flat?raw';
import RawKimiViewGrouped from '~icons/kimi/view-grouped?raw';
import RawKimiCopy from '~icons/kimi/copy?raw';
import RawKimiPencil from '~icons/kimi/pencil?raw';
import RawKimiDownload from '~icons/kimi/download?raw';
import RawKimiArchive from '~icons/kimi/archive?raw';

// Raw SVG strings (Tabler) ----------------------------------------------------
import RawTablerSidebarLeftExpand from '~icons/tabler/layout-sidebar-left-expand?raw';
import RawTablerSidebarRightExpand from '~icons/tabler/layout-sidebar-right-expand?raw';
import RawTablerPaperclip from '~icons/tabler/paperclip?raw';
import RawTablerListNumbers from '~icons/tabler/list-numbers?raw';
import RawTablerRefresh from '~icons/tabler/refresh?raw';
import RawTablerTextWrap from '~icons/tabler/text-wrap?raw';
import RawTablerTextWrapDisabled from '~icons/tabler/text-wrap-disabled?raw';

// Raw SVG strings (Remix) ----------------------------------------------------
import RawAlertLine from '~icons/ri/alert-line?raw';
import RawArchiveLine from '~icons/ri/archive-line?raw';
import RawArrowDownLine from '~icons/ri/arrow-down-line?raw';
import RawArrowGoBackLine from '~icons/ri/arrow-go-back-line?raw';
import RawArrowLeftSLine from '~icons/ri/arrow-left-s-line?raw';
import RawArrowRightSLine from '~icons/ri/arrow-right-s-line?raw';
import RawArrowUpLine from '~icons/ri/arrow-up-line?raw';
import RawArrowUpSLine from '~icons/ri/arrow-up-s-line?raw';
import RawAtLine from '~icons/ri/at-line?raw';
import RawBracesLine from '~icons/ri/braces-line?raw';
import RawCalendarCloseLine from '~icons/ri/calendar-close-line?raw';
import RawCalendarScheduleLine from '~icons/ri/calendar-schedule-line?raw';
import RawCalendarTodoLine from '~icons/ri/calendar-todo-line?raw';
import RawCheckLine from '~icons/ri/check-line?raw';
import RawCloseLine from '~icons/ri/close-line?raw';
import RawCodeLine from '~icons/ri/code-line?raw';
import RawCollapseDiagonalLine from '~icons/ri/collapse-diagonal-line?raw';
import RawDownloadLine from '~icons/ri/download-line?raw';
import RawDraggable from '~icons/ri/draggable?raw';
import RawEmotionLine from '~icons/ri/emotion-line?raw';
import RawEqualizerLine from '~icons/ri/equalizer-line?raw';
import RawExpandDiagonalLine from '~icons/ri/expand-diagonal-line?raw';
import RawExternalLinkLine from '~icons/ri/external-link-line?raw';
import RawFileAddLine from '~icons/ri/file-add-line?raw';
import RawFileCopyLine from '~icons/ri/file-copy-line?raw';
import RawFileEditLine from '~icons/ri/file-edit-line?raw';
import RawFileLine from '~icons/ri/file-line?raw';
import RawFileTextLine from '~icons/ri/file-text-line?raw';
import RawFlashlightLine from '~icons/ri/flashlight-line?raw';
import RawFolderAddLine from '~icons/ri/folder-add-line?raw';
import RawFolderFill from '~icons/ri/folder-fill?raw';
import RawGitForkLine from '~icons/ri/git-fork-line?raw';
import RawGitPullRequestLine from '~icons/ri/git-pull-request-line?raw';
import RawGlobalLine from '~icons/ri/global-line?raw';
import RawImageLine from '~icons/ri/image-line?raw';
import RawInformationLine from '~icons/ri/information-line?raw';
import RawListCheck from '~icons/ri/list-check?raw';
import RawListUnordered from '~icons/ri/list-unordered?raw';
import RawLoginBoxLine from '~icons/ri/login-box-line?raw';
import RawMailLine from '~icons/ri/mail-line?raw';
import RawMessageLine from '~icons/ri/message-line?raw';
import RawPauseFill from '~icons/ri/pause-fill?raw';
import RawPencilLine from '~icons/ri/pencil-line?raw';
import RawPlayFill from '~icons/ri/play-fill?raw';
import RawPushpinFill from '~icons/ri/pushpin-fill?raw';
import RawPushpinLine from '~icons/ri/pushpin-line?raw';
import RawQuestionLine from '~icons/ri/question-line?raw';
import RawSortDesc from '~icons/ri/sort-desc?raw';
import RawSparklingLine from '~icons/ri/sparkling-line?raw';
import RawStarFill from '~icons/ri/star-fill?raw';
import RawStarLine from '~icons/ri/star-line?raw';
import RawStopFill from '~icons/ri/stop-fill?raw';
import RawSubtractLine from '~icons/ri/subtract-line?raw';
import RawTargetLine from '~icons/ri/target-line?raw';
import RawTerminalBoxLine from '~icons/ri/terminal-box-line?raw';
import RawTimeLine from '~icons/ri/time-line?raw';
import RawToolsLine from '~icons/ri/tools-line?raw';
import RawUnpinLine from '~icons/ri/unpin-line?raw';
import RawUserLine from '~icons/ri/user-line?raw';

// Public types -------------------------------------------------------------
export type IconName =
  | 'plus'
  | 'chat-new'
  | 'calendar-close'
  | 'calendar-schedule'
  | 'calendar-todo'
  | 'close'
  | 'check'
  | 'circle-check'
  | 'panel-collapse-right'
  | 'left-panel'
  | 'left-panel-expand'
  | 'right-panel'
  | 'right-panel-expand'
  | 'archive'
  | 'search'
  | 'copy'
  | 'link'
  | 'external-link'
  | 'download'
  | 'undo'
  | 'send'
  | 'image'
  | 'emoji'
  | 'settings'
  | 'sliders'
  | 'log-in'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-right'
  | 'arrow-left'
  | 'refresh'
  | 'minus'
  | 'left-panel'
  | 'left-panel-expand'
  | 'panel-expand'
  | 'panel-right'
  | 'expand'
  | 'collapse'
  | 'list'
  | 'list-numbers'
  | 'text-wrap'
  | 'text-wrap-disabled'
  | 'sort'
  | 'grip'
  | 'folder'
  | 'folder-closed'
  | 'folder-plus'
  | 'folder-solid'
  | 'file'
  | 'file-text'
  | 'file-edit'
  | 'file-plus'
  | 'file-off'
  | 'attachment'
  | 'at'
  | 'image-off'
  | 'code'
  | 'terminal'
  | 'pencil'
  | 'tool'
  | 'glob'
  | 'globe'
  | 'check-list'
  | 'bolt'
  | 'git-fork'
  | 'git-pull-request'
  | 'message'
  | 'mail'
  | 'user'
  | 'info'
  | 'help-circle'
  | 'alert-triangle'
  | 'hand'
  | 'shield-question'
  | 'shield-exclamation'
  | 'trash'
  | 'robot'
  | 'thinking'
  | 'microscope'
  | 'flask'
  | 'view-flat'
  | 'view-grouped'
  | 'list-lines'
  | 'kimi-copy'
  | 'kimi-pencil'
  | 'kimi-download'
  | 'kimi-archive'
  | 'clock'
  | 'sparkles'
  | 'target'
  | 'pencil-filled'
  | 'terminal-filled'
  | 'agent-filled'
  | 'pause'
  | 'play'
  | 'stop'
  | 'star'
  | 'star-outline'
  | 'pin'
  | 'pin-outline'
  | 'unpin'
  | 'dots-horizontal';

export type IconSize = 'sm' | 'md' | 'lg';

export const SIZE_PX: Record<IconSize, number> = { sm: 14, md: 16, lg: 20 };

export interface IconEntry {
  /** Vue component that renders the icon (used by <Icon>). */
  component: Component;
  /** Raw `<svg>` string (used by iconSvg() in v-html contexts). */
  svg: string;
}

function entry(component: Component, svg: string): IconEntry {
  return { component, svg };
}

export const ICONS: Record<IconName, IconEntry> = {
  plus: entry(KimiPlus, RawKimiPlus),
  'chat-new': entry(KimiAddConversation, RawKimiAddConversation),
  'calendar-close': entry(RiCalendarCloseLine, RawCalendarCloseLine),
  'calendar-schedule': entry(RiCalendarScheduleLine, RawCalendarScheduleLine),
  'calendar-todo': entry(RiCalendarTodoLine, RawCalendarTodoLine),
  close: entry(RiCloseLine, RawCloseLine),
  check: entry(RiCheckLine, RawCheckLine),
  'circle-check': entry(KimiCircleCheck, RawKimiCircleCheck),
  'panel-collapse-right': entry(KimiPanelCollapseRight, RawKimiPanelCollapseRight),
  'left-panel': entry(KimiLeftPanel, RawKimiLeftPanel),
  'left-panel-expand': entry(KimiLeftPanelExpand, RawKimiLeftPanelExpand),
  'right-panel': entry(KimiRightPanel, RawKimiRightPanel),
  'right-panel-expand': entry(KimiRightPanelExpand, RawKimiRightPanelExpand),
  archive: entry(RiArchiveLine, RawArchiveLine),
  search: entry(KimiSearch, RawKimiSearch),
  copy: entry(RiFileCopyLine, RawFileCopyLine),
  link: entry(KimiLink, RawKimiLink),
  'external-link': entry(RiExternalLinkLine, RawExternalLinkLine),
  download: entry(RiDownloadLine, RawDownloadLine),
  emoji: entry(RiEmotionLine, RawEmotionLine),
  undo: entry(RiArrowGoBackLine, RawArrowGoBackLine),
  send: entry(KimiSend, RawKimiSend),
  image: entry(RiImageLine, RawImageLine),
  settings: entry(KimiSetting, RawKimiSetting),
  sliders: entry(RiEqualizerLine, RawEqualizerLine),
  'log-in': entry(RiLoginBoxLine, RawLoginBoxLine),
  'chevron-down': entry(KimiChevronDown, RawKimiChevronDown),
  'chevron-left': entry(RiArrowLeftSLine, RawArrowLeftSLine),
  'chevron-right': entry(RiArrowRightSLine, RawArrowRightSLine),
  'chevron-up': entry(RiArrowUpSLine, RawArrowUpSLine),
  'arrow-up': entry(RiArrowUpLine, RawArrowUpLine),
  'arrow-down': entry(RiArrowDownLine, RawArrowDownLine),
  'arrow-right': entry(KimiArrowRight, RawKimiArrowRight),
  'arrow-left': entry(KimiArrowLeft, RawKimiArrowLeft),
  refresh: entry(TablerRefresh, RawTablerRefresh),
  minus: entry(RiSubtractLine, RawSubtractLine),
  'panel-expand': entry(TablerSidebarLeftExpand, RawTablerSidebarLeftExpand),
  'panel-right': entry(TablerSidebarRightExpand, RawTablerSidebarRightExpand),
  expand: entry(RiExpandDiagonalLine, RawExpandDiagonalLine),
  collapse: entry(RiCollapseDiagonalLine, RawCollapseDiagonalLine),
  list: entry(RiListUnordered, RawListUnordered),
  'list-numbers': entry(TablerListNumbers, RawTablerListNumbers),
  'text-wrap': entry(TablerTextWrap, RawTablerTextWrap),
  'text-wrap-disabled': entry(TablerTextWrapDisabled, RawTablerTextWrapDisabled),
  sort: entry(RiSortDesc, RawSortDesc),
  grip: entry(RiDraggable, RawDraggable),
  folder: entry(KimiFolderOpen, RawKimiFolderOpen),
  'folder-closed': entry(KimiFolder, RawKimiFolder),
  'folder-plus': entry(RiFolderAddLine, RawFolderAddLine),
  'folder-solid': entry(RiFolderFill, RawFolderFill),
  file: entry(RiFileLine, RawFileLine),
  'file-text': entry(RiFileTextLine, RawFileTextLine),
  'file-edit': entry(RiFileEditLine, RawFileEditLine),
  'file-plus': entry(RiFileAddLine, RawFileAddLine),
  'file-off': entry(RiFileLine, RawFileLine),
  attachment: entry(TablerPaperclip, RawTablerPaperclip),
  at: entry(RiAtLine, RawAtLine),
  'image-off': entry(RiImageLine, RawImageLine),
  code: entry(RiCodeLine, RawCodeLine),
  terminal: entry(RiTerminalBoxLine, RawTerminalBoxLine),
  pencil: entry(RiPencilLine, RawPencilLine),
  tool: entry(RiToolsLine, RawToolsLine),
  glob: entry(RiBracesLine, RawBracesLine),
  globe: entry(RiGlobalLine, RawGlobalLine),
  'check-list': entry(RiListCheck, RawListCheck),
  bolt: entry(RiFlashlightLine, RawFlashlightLine),
  'git-fork': entry(RiGitForkLine, RawGitForkLine),
  'git-pull-request': entry(RiGitPullRequestLine, RawGitPullRequestLine),
  message: entry(RiMessageLine, RawMessageLine),
  mail: entry(RiMailLine, RawMailLine),
  user: entry(RiUserLine, RawUserLine),
  info: entry(RiInformationLine, RawInformationLine),
  'help-circle': entry(RiQuestionLine, RawQuestionLine),
  'alert-triangle': entry(RiAlertLine, RawAlertLine),
  hand: entry(KimiHand, RawKimiHand),
  'shield-question': entry(KimiShieldQuestion, RawKimiShieldQuestion),
  'shield-exclamation': entry(KimiShieldExclamation, RawKimiShieldExclamation),
  trash: entry(KimiTrash, RawKimiTrash),
  robot: entry(KimiRobot, RawKimiRobot),
  thinking: entry(KimiThinking, RawKimiThinking),
  'pencil-filled': entry(KimiPencilFilled, RawKimiPencilFilled),
  'terminal-filled': entry(KimiTerminalFilled, RawKimiTerminalFilled),
  'agent-filled': entry(KimiAgentFilled, RawKimiAgentFilled),
  microscope: entry(KimiMicroscope, RawKimiMicroscope),
  flask: entry(KimiFlask, RawKimiFlask),
  'view-flat': entry(KimiViewFlat, RawKimiViewFlat),
  'view-grouped': entry(KimiViewGrouped, RawKimiViewGrouped),
  'list-lines': entry(KimiListLines, RawKimiListLines),
  'kimi-copy': entry(KimiCopy, RawKimiCopy),
  'kimi-pencil': entry(KimiPencil, RawKimiPencil),
  'kimi-download': entry(KimiDownload, RawKimiDownload),
  'kimi-archive': entry(KimiArchive, RawKimiArchive),
  clock: entry(RiTimeLine, RawTimeLine),
  sparkles: entry(RiSparklingLine, RawSparklingLine),
  target: entry(RiTargetLine, RawTargetLine),
  pause: entry(RiPauseFill, RawPauseFill),
  play: entry(RiPlayFill, RawPlayFill),
  stop: entry(RiStopFill, RawStopFill),
  star: entry(RiStarFill, RawStarFill),
  'star-outline': entry(RiStarLine, RawStarLine),
  pin: entry(RiPushpinFill, RawPushpinFill),
  'pin-outline': entry(RiPushpinLine, RawPushpinLine),
  unpin: entry(RiUnpinLine, RawUnpinLine),
  'dots-horizontal': entry(KimiMore, RawKimiMore),
};

export function getIcon(name: IconName): IconEntry {
  return ICONS[name];
}

function applySize(svg: string, px: number): string {
  return svg
    .replaceAll(/\s(?:width|height)="[^"]*"/g, '')
    .replace(/^<svg\b/, `<svg class="kw-icon" width="${px}" height="${px}" aria-hidden="true"`);
}

/** Render an icon to a full <svg> string for v-html contexts. Mirrors <Icon>. */
export function iconSvg(name: IconName, size: IconSize = 'md'): string {
  const entry = ICONS[name];
  if (!entry) return '';
  return applySize(entry.svg, SIZE_PX[size]);
}

// ---------------------------------------------------------------------------
// catalog grouping — single source of truth for design-system §02 icon list
// ---------------------------------------------------------------------------

/** Display order + grouping for the design-system §02 icon catalog. */
export const ICON_GROUPS: ReadonlyArray<readonly [string, readonly IconName[]]> = [
  [
    'Actions',
    [
      'plus',
      'attachment',
      'at',
      'chat-new',
      'close',
      'trash',
      'check',
      'search',
      'copy',
      'link',
      'external-link',
      'download',
      'emoji',
      'undo',
      'send',
      'image',
      'settings',
      'sliders',
      'robot',
      'thinking',
      'microscope',
      'flask',
      'view-flat',
      'view-grouped',
      'log-in',
    ],
  ],
  [
    'Navigation & layout',
    [
      'chevron-down',
      'chevron-left',
      'chevron-right',
      'chevron-up',
      'arrow-up',
      'arrow-down',
      'arrow-right',
      'minus',
      'left-panel',
      'left-panel-expand',
      'panel-expand',
      'panel-right',
      'expand',
      'collapse',
      'list',
      'list-lines',
      'sort',
      'grip',
    ],
  ],
  [
    'Files & tools',
    [
      'folder',
      'folder-closed',
      'folder-plus',
      'folder-solid',
      'file',
      'file-text',
      'file-edit',
      'file-plus',
      'file-off',
      'image-off',
      'code',
      'terminal',
      'pencil',
      'tool',
      'glob',
      'globe',
      'check-list',
      'bolt',
      'git-fork',
      'git-pull-request',
      'archive',
      'target',
      'calendar-schedule',
      'calendar-todo',
      'calendar-close',
    ],
  ],
  ['Communication', ['message', 'mail', 'user']],
  [
    'Status & media',
    [
      'info',
      'help-circle',
      'alert-triangle',
      'hand',
      'shield-question',
      'shield-exclamation',
      'clock',
      'sparkles',
      'pause',
      'play',
      'stop',
      'star',
      'star-outline',
      'pin',
      'pin-outline',
      'unpin',
      'dots-horizontal',
    ],
  ],
];
