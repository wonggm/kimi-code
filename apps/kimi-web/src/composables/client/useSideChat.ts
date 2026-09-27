// apps/kimi-web/src/composables/client/useSideChat.ts
// Side chat ("BTW") — a TUI-style forked agent rendered as a session tab.
// It is not a child session and never appears in the sidebar. Each session can
// have its own side chat; state is keyed by session id, while messages are
// keyed by agent id so they survive session switches.
//
// Cross-dependencies (failure reporting, optimistic-id generation, the event
// connection) are injected by the facade.

import { computed, ref } from 'vue';
import { getKimiWebApi } from '../../api';
import type { AppMessage, KimiEventConnection, ThinkingLevel } from '../../api/types';
import { messagesToTurns } from '../messagesToTurns';
import { reconcileTurns } from '../reconcileTurns';
import type { ExtendedState, PromptAttachment } from '../useKimiWebClient';
import type { ChatTurn } from '../../types';

export interface UseSideChatDeps {
  pushOperationFailure: (
    operation: string,
    err: unknown,
    opts?: { title?: string; message?: string; sessionId?: string },
  ) => void;
  nextOptimisticMsgId: () => string;
  connectEventsIfNeeded: () => void;
  getEventConn: () => KimiEventConnection | null;
  /** Resolve the thinking level for a prompt submission: waits for the
   *  session's own /status fold when it has not landed yet, then resolves the
   *  session + model level; undefined when the model is not in the catalog. */
  resolveThinkingForPrompt: (
    sessionId: string | null,
    modelId: string | undefined,
  ) => Promise<ThinkingLevel | undefined>;
}

export function useSideChat(rawState: ExtendedState, deps: UseSideChatDeps) {
  const {
    pushOperationFailure,
    nextOptimisticMsgId,
    connectEventsIfNeeded,
    getEventConn,
    resolveThinkingForPrompt,
  } = deps;

  const sideChatTargetBySession = ref<Record<string, { agentId: string }>>({});

  const activeSideChatTarget = computed<{ parentId: string; agentId: string } | null>(() => {
    const sid = rawState.activeSessionId;
    if (!sid) return null;
    const target = sideChatTargetBySession.value[sid];
    return target ? { parentId: sid, agentId: target.agentId } : null;
  });

  const sideChatSessionId = computed<string | null>(
    () => activeSideChatTarget.value?.parentId ?? null,
  );
  const sideChatVisible = computed<boolean>(() => activeSideChatTarget.value !== null);

  const sideChatAgentId = computed<string | null>(
    () => activeSideChatTarget.value?.agentId ?? null,
  );

  const sideChatSending = computed<boolean>(() => {
    const target = activeSideChatTarget.value;
    return target ? Boolean(rawState.sideChatSendingByAgent[target.agentId]) : false;
  });

  const sideChatRunning = computed<boolean>(() => {
    const target = activeSideChatTarget.value;
    if (!target) return false;
    if (rawState.sideChatSendingByAgent[target.agentId]) return true;
    return (rawState.tasksBySession[target.parentId] ?? []).some(
      (task) => task.id === target.agentId && task.status === 'running',
    );
  });

  // The side chat's turn list is rebuilt on every streamed token, so without
  // reconciliation it hands ChatPane a fresh object for every turn on every
  // token. Each row's v-memo compares its turn by identity, so every row in the
  // panel re-renders and re-parses its markdown, and the whole conversation pane
  // above it re-renders too. The main transcript reconciles for exactly this
  // reason (see reconcileTurns); do the same here. The previous list is kept per
  // agent, so switching sessions can never reconcile against another session's
  // turns, and the entry is dropped with the agent's messages.
  const sideChatTurnsByAgent = new Map<string, ChatTurn[]>();

  const sideChatTurns = computed<ChatTurn[]>(() => {
    const target = activeSideChatTarget.value;
    if (!target) return [];
    const messages = rawState.sideChatMessagesByAgent[target.agentId] ?? [];
    const built = messagesToTurns(
      messages,
      [],
      (fileId) => getKimiWebApi().getFileUrl(fileId),
      sideChatRunning.value,
    );
    const reconciled = reconcileTurns(sideChatTurnsByAgent.get(target.agentId) ?? [], built);
    sideChatTurnsByAgent.set(target.agentId, reconciled);
    return reconciled;
  });

  function updateSideChatMessages(agentId: string, update: (messages: AppMessage[]) => AppMessage[]): void {
    rawState.sideChatMessagesByAgent = {
      ...rawState.sideChatMessagesByAgent,
      [agentId]: update(rawState.sideChatMessagesByAgent[agentId] ?? []),
    };
  }

  function appendSideChatMessage(agentId: string, message: AppMessage): void {
    updateSideChatMessages(agentId, (messages) => [...messages, message]);
  }

  function removeLastSideChatUserMessage(agentId: string): void {
    updateSideChatMessages(agentId, (messages) => {
      const idx = [...messages].toReversed().findIndex((message) => message.role === 'user');
      if (idx === -1) return messages;
      const removeIndex = messages.length - 1 - idx;
      return messages.filter((_, index) => index !== removeIndex);
    });
  }

  function stampLastSideChatUserPrompt(agentId: string, promptId: string): void {
    updateSideChatMessages(agentId, (messages) => {
      const next = [...messages];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        const message = next[i]!;
        if (message.role !== 'user') continue;
        next[i] = { ...message, promptId: message.promptId ?? promptId };
        return next;
      }
      return messages;
    });
  }

  function appendSideChatAssistantText(agentId: string, sessionId: string, chunk: string): void {
    if (!chunk) return;
    updateSideChatMessages(agentId, (messages) => {
      const last = messages.at(-1);
      if (last?.role === 'assistant') {
        const first = last.content[0];
        const text = first?.type === 'text' ? first.text : '';
        return [
          ...messages.slice(0, -1),
          {
            ...last,
            content: [{ type: 'text', text: `${text}${chunk}` }],
          },
        ];
      }
      return [
        ...messages,
        {
          id: nextOptimisticMsgId(),
          sessionId,
          role: 'assistant',
          content: [{ type: 'text', text: chunk }],
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }

  function finishSideChatAgent(agentId: string, sessionId: string, outputPreview?: string): void {
    rawState.sideChatSendingByAgent = { ...rawState.sideChatSendingByAgent, [agentId]: false };
    if (!outputPreview) return;
    const messages = rawState.sideChatMessagesByAgent[agentId] ?? [];
    const last = messages.at(-1);
    const lastText = last?.role === 'assistant' && last.content[0]?.type === 'text'
      ? last.content[0].text
      : '';
    if (lastText.trim().length > 0) return;
    appendSideChatAssistantText(agentId, sessionId, outputPreview);
  }

  /** The wire content for a side-chat prompt: the text (when there is any)
   *  followed by the attachments, in the same shapes the main composer sends. */
  function promptContent(text: string, attachments: PromptAttachment[]): AppMessage['content'] {
    const content: AppMessage['content'] = [];
    if (text) content.push({ type: 'text', text });
    for (const att of attachments) {
      if (att.kind === 'video') {
        content.push({ type: 'video', source: { kind: 'file', fileId: att.fileId } });
      } else if (att.kind === 'file') {
        content.push({
          type: 'file',
          fileId: att.fileId,
          name: att.name ?? '',
          mediaType: att.mediaType || 'application/octet-stream',
          size: att.size ?? 0,
        });
      } else {
        content.push({ type: 'image', source: { kind: 'file', fileId: att.fileId } });
      }
    }
    return content;
  }

  /** Open (creating if needed) the side chat for the active session; optionally send a first prompt. */
  async function openSideChat(initialPrompt?: string): Promise<void> {
    const parent = rawState.activeSessionId;
    if (!parent) return;
    await openSideChatOn(parent, initialPrompt);
  }

  /** Low-level: open the side chat on an explicit parent session id.
   *  Used when the parent was just created from the empty composer so the call
   *  can target it directly instead of reading the active session (which could
   *  race with a concurrent session switch). */
  async function openSideChatOn(parent: string, initialPrompt?: string): Promise<void> {
    if (!sideChatTargetBySession.value[parent]) {
      let agentId: string;
      try {
        ({ agentId } = await getKimiWebApi().startBtw(parent));
      } catch (error) {
        pushOperationFailure('openSideChat', error, { sessionId: parent });
        return;
      }
      rawState.sideChatMessagesByAgent = {
        ...rawState.sideChatMessagesByAgent,
        [agentId]: rawState.sideChatMessagesByAgent[agentId] ?? [],
      };
      sideChatTargetBySession.value = {
        ...sideChatTargetBySession.value,
        [parent]: { agentId },
      };
      connectEventsIfNeeded();
      getEventConn()?.markSideChannelAgent(agentId);
    }
    if (initialPrompt && initialPrompt.trim()) {
      await sendSideChatPromptOn(parent, initialPrompt.trim());
    }
  }

  /** Low-level: send a prompt to the side-chat child of an explicit parent session.
   *  Always uses `parent` as the session id, carrying model / thinking /
   *  permissionMode / plan / swarm so the turn matches the UI regardless of
   *  parent /profile inheritance or race. Resolves true when the daemon took
   *  the prompt — the panel restores the composer's draft when it did not. */
  async function sendSideChatPromptOn(
    parent: string,
    text: string,
    attachments?: PromptAttachment[],
  ): Promise<boolean> {
    const target = sideChatTargetBySession.value[parent];
    const trimmed = text.trim();
    const ready = attachments ?? [];
    if (!target || (trimmed.length === 0 && ready.length === 0)) return false;
    const sid = parent;
    const agentId = target.agentId;
    rawState.sideChatSendingByAgent = { ...rawState.sideChatSendingByAgent, [agentId]: true };
    const userMsg: AppMessage = {
      id: nextOptimisticMsgId(),
      sessionId: sid,
      role: 'user',
      content: promptContent(trimmed, ready),
      createdAt: new Date().toISOString(),
      metadata: { 'kimiWeb.optimisticUserMessage': true },
    };
    appendSideChatMessage(agentId, userMsg);
    try {
      // Carry the parent's current model, thinking, and permission so a BTW
      // first-turn reflects the same draft/runtime controls the UI shows — the
      // parent session profile mirrors them, but the prompt itself is the only
      // thing the daemon reads for this turn. Thinking is resolved against the
      // PARENT session + its model (the session's own level when declared,
      // else its stored pick, else its default) — never the active-session
      // rawState.thinking: startBtw above may have spanned a session switch
      // that changed what the active view resolved to (see
      // submitPromptInternal in useWorkspaceState).
      const promptSession = rawState.sessions.find((s) => s.id === sid);
      const model =
        (promptSession?.model && promptSession.model.length > 0
          ? promptSession.model
          : rawState.defaultModel) ?? undefined;
      const result = await getKimiWebApi().submitPrompt(sid, {
        content: promptContent(trimmed, ready),
        agentId,
        model,
        thinking: (await resolveThinkingForPrompt(sid, model)) ?? rawState.thinking,
        permissionMode: rawState.permissionBySession[sid] ?? rawState.permission,
        planMode: rawState.planModeBySession[sid] ?? false,
        swarmMode: rawState.swarmModeBySession[sid] ?? false,
      });
      stampLastSideChatUserPrompt(agentId, result.promptId);
      rawState.sideChatUserMessageIdsBySession = {
        ...rawState.sideChatUserMessageIdsBySession,
        [sid]: [...(rawState.sideChatUserMessageIdsBySession[sid] ?? []), result.userMessageId],
      };
      return true;
    } catch (error) {
      pushOperationFailure('sendSideChatPrompt', error, { sessionId: sid });
      removeLastSideChatUserMessage(agentId);
      rawState.sideChatSendingByAgent = { ...rawState.sideChatSendingByAgent, [agentId]: false };
      return false;
    }
  }

  function closeSideChat(): void {
    const sid = rawState.activeSessionId;
    if (!sid) return;
    const { [sid]: _removed, ...rest } = sideChatTargetBySession.value;
    void _removed;
    sideChatTargetBySession.value = rest;
  }

  /** Send a prompt to the active session's side chat, carrying the
   *  controls (model, thinking, permissionMode, plan/swarm) the UI shows so a
   *  BTW turn matches them even if the parent's /profile is still in
   *  flight. Resolves false when there is no side chat to send to, or when the
   *  daemon refused the prompt. */
  async function sendSideChatPrompt(
    text: string,
    attachments?: PromptAttachment[],
  ): Promise<boolean> {
    const target = activeSideChatTarget.value;
    if (!target) return false;
    return sendSideChatPromptOn(target.parentId, text, attachments);
  }

  // When a session is deleted, drop its side-chat target so it cannot leak into
  // a later session that happens to reuse the same id — and drop the orphaned
  // agent's transcript + sending flag with it: nothing else ever deletes the
  // agent-keyed entries, so without this every archived side chat would leave
  // its full message list pinned in memory for the page's lifetime.
  function clearSideChatForSession(sessionId: string): void {
    const target = sideChatTargetBySession.value[sessionId];
    if (!target) return;
    const { [sessionId]: _removed, ...rest } = sideChatTargetBySession.value;
    void _removed;
    sideChatTargetBySession.value = rest;
    const { [target.agentId]: _dropMessages, ...restMessages } = rawState.sideChatMessagesByAgent;
    void _dropMessages;
    rawState.sideChatMessagesByAgent = restMessages;
    const { [target.agentId]: _dropSending, ...restSending } = rawState.sideChatSendingByAgent;
    void _dropSending;
    rawState.sideChatSendingByAgent = restSending;
    // The reconciled turn list holds every turn object of that agent, so it
    // goes with the messages rather than outliving them.
    sideChatTurnsByAgent.delete(target.agentId);
  }

  return {
    sideChatTargetBySession,
    sideChatSessionId,
    sideChatVisible,
    sideChatAgentId,
    sideChatSending,
    sideChatRunning,
    sideChatTurns,
    appendSideChatAssistantText,
    finishSideChatAgent,
    openSideChat,
    openSideChatOn,
    closeSideChat,
    sendSideChatPrompt,
    clearSideChatForSession,
  };
}

export type UseSideChat = ReturnType<typeof useSideChat>;
