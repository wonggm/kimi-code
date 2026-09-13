export default {
  // Upstream's own panel strings, ported verbatim so the tab strip, its tail and
  // the launcher read exactly as upstream's does (this is the tab set the
  // complete-merge round adopted; see PLANS/web-port-0.41.md).
  tabs: {
    diff: '改动',
    file: '文件',
    turnDiff: '本轮改动',
    compaction: '压缩摘要',
    agent: '子 Agent',
    term: '终端',
    // Fork keys still referenced by the pre-merge shell and its panes.
    changes: '改动',
    sideChat: '侧栏会话',
    terminal: '终端',
    bash: 'Bash',
    subagents: '子 Agent',
    todos: '待办',
  },
  newTab: '新建标签页',
  closeTab: '关闭标签页',
  expand: '展开面板',
  collapse: '恢复面板',
  hide: '关闭右侧面板',
  launcherAria: '快速打开',
  // Fork keys still referenced by the pre-merge shell and its panes.
  close: '关闭右侧面板',
  back: '返回',
  agentGone: '该子 Agent 已不可用，请返回列表。',
  drillAgentLabel: '子 Agent 详情',
  drillFileLabel: '文件预览',
  turnDiffEmpty: '本轮没有改动文件',
  terminalUnavailable: '当前版本未提供终端',
  workbarLabel: '打开{name}',
  openPanel: '打开右侧面板',
  terminalLoopbackOnly: '仅当服务器绑定到回环地址时终端路由才可用',

} as const;
