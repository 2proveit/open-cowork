import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Loader2, Plug } from 'lucide-react';
import {
  useActiveExecutionClock,
  useActivePartialContent,
  useActiveSessionId,
  useActiveSessionMessages,
  useActiveTurn,
  useAppConfig,
  useCurrentSession,
  usePendingTurns,
} from '../store/selectors';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import { MessageCard } from './MessageCard';
import { RichPromptComposer } from './composer/RichPromptComposer';
import type { ContentBlock, Message } from '../types';

export function ChatView() {
  const { t } = useTranslation();
  const activeSessionId = useActiveSessionId();
  const activeSession = useCurrentSession();
  const messages = useActiveSessionMessages();
  const { partialMessage, partialThinking } = useActivePartialContent();
  const activeTurn = useActiveTurn();
  const pendingTurns = usePendingTurns();
  const executionClock = useActiveExecutionClock();
  const appConfig = useAppConfig();
  const setGlobalNotice = useAppStore((state) => state.setGlobalNotice);
  const workingDir = useAppStore((state) => state.workingDir);
  const { continueSession, stopSession, isElectron } = useIPC();
  const [activeConnectors, setActiveConnectors] = useState<
    { id: string; name: string; connected: boolean; toolCount: number }[]
  >([]);
  const [showConnectorLabel, setShowConnectorLabel] = useState(true);
  const headerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const connectorMeasureRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const prevPartialLengthRef = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRequestRef = useRef<number | null>(null);
  const isScrollingRef = useRef(false);
  const [clockNow, setClockNow] = useState(() => Date.now());

  const hasActiveTurn = Boolean(activeTurn);
  const pendingCount = pendingTurns.length;
  const isSessionRunning = activeSession?.status === 'running';
  const canStop = isSessionRunning || hasActiveTurn || pendingCount > 0;
  const composerWorkspacePath = activeSession?.cwd || workingDir || undefined;

  const displayedMessages = useMemo(() => {
    if (!activeSessionId) return messages;

    const hasStreamingContent = partialMessage || partialThinking;
    if (!hasStreamingContent || !activeTurn?.userMessageId) return messages;
    const anchorIndex = messages.findIndex((message) => message.id === activeTurn.userMessageId);
    if (anchorIndex === -1) return messages;

    let insertIndex = anchorIndex + 1;
    while (insertIndex < messages.length) {
      if (messages[insertIndex].role === 'user') break;
      insertIndex += 1;
    }

    const contentBlocks: ContentBlock[] = [];
    if (partialThinking) {
      contentBlocks.push({ type: 'thinking', thinking: partialThinking });
    }
    if (partialMessage) {
      contentBlocks.push({ type: 'text', text: partialMessage });
    }

    const streamingMessage: Message = {
      id: `partial-${activeSessionId}`,
      sessionId: activeSessionId,
      role: 'assistant',
      content: contentBlocks,
      timestamp: Date.now(),
    };

    return [...messages.slice(0, insertIndex), streamingMessage, ...messages.slice(insertIndex)];
  }, [activeSessionId, activeTurn?.userMessageId, messages, partialMessage, partialThinking]);

  const formatExecutionTime = useCallback((ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }, []);

  useEffect(() => {
    const isActive = Boolean(executionClock?.startAt && executionClock.endAt === null);
    if (!isActive) return;

    setClockNow(Date.now());
    const interval = setInterval(() => {
      setClockNow(Date.now());
    }, 100);
    return () => clearInterval(interval);
  }, [executionClock?.startAt, executionClock?.endAt]);

  const liveElapsed =
    executionClock?.startAt == null
      ? 0
      : Math.max(0, (executionClock.endAt ?? clockNow) - executionClock.startAt);
  const timerActive = Boolean(executionClock?.startAt && executionClock.endAt === null);

  const scrollToBottom = useRef((behavior: ScrollBehavior = 'auto', immediate = false) => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    if (scrollRequestRef.current) {
      cancelAnimationFrame(scrollRequestRef.current);
      scrollRequestRef.current = null;
    }

    const performScroll = () => {
      if (!isUserAtBottomRef.current) return;
      isScrollingRef.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior });
      setTimeout(
        () => {
          isScrollingRef.current = false;
        },
        behavior === 'smooth' ? 300 : 50
      );
    };

    if (immediate) {
      performScroll();
      return;
    }
    scrollRequestRef.current = requestAnimationFrame(() => {
      scrollTimeoutRef.current = setTimeout(performScroll, 16);
    });
  }).current;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateScrollState = () => {
      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      isUserAtBottomRef.current = distanceToBottom <= 80;
    };

    updateScrollState();
    const onScroll = () => updateScrollState();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const messageCount = messages.length;
    const partialLength = partialMessage.length + partialThinking.length;
    const hasNewMessage = messageCount !== prevMessageCountRef.current;
    const isStreamingTick = partialLength !== prevPartialLengthRef.current && !hasNewMessage;

    if (isScrollingRef.current) {
      prevMessageCountRef.current = messageCount;
      prevPartialLengthRef.current = partialLength;
      return;
    }

    if (isUserAtBottomRef.current) {
      if (!isStreamingTick) {
        const behavior: ScrollBehavior = hasNewMessage ? 'smooth' : 'auto';
        scrollToBottom(behavior, false);
      } else {
        scrollToBottom('auto', false);
      }
    }

    prevMessageCountRef.current = messageCount;
    prevPartialLengthRef.current = partialLength;
  }, [messages.length, partialMessage.length, partialThinking.length, scrollToBottom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const messagesContainer = messagesContainerRef.current;
    if (!container || !messagesContainer) return;

    const resizeObserver = new ResizeObserver(() => {
      if (!isScrollingRef.current && isUserAtBottomRef.current) {
        scrollToBottom('auto', false);
      }
    });
    resizeObserver.observe(messagesContainer);

    return () => resizeObserver.disconnect();
  }, [scrollToBottom]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (scrollRequestRef.current) {
        cancelAnimationFrame(scrollRequestRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isElectron || typeof window === 'undefined' || !window.electronAPI) {
      return;
    }
    const loadConnectors = async () => {
      try {
        const statuses = await window.electronAPI.mcp.getServerStatus();
        const active =
          (
            statuses as Array<{ id: string; name: string; connected: boolean; toolCount: number }>
          )?.filter((status) => status.connected && status.toolCount > 0) || [];
        setActiveConnectors(active);
      } catch (error) {
        console.error('Failed to load MCP connectors:', error);
      }
    };
    void loadConnectors();
    const interval = setInterval(loadConnectors, 5000);
    return () => clearInterval(interval);
  }, [isElectron]);

  useEffect(() => {
    const titleEl = titleRef.current;
    const headerEl = headerRef.current;
    const measureEl = connectorMeasureRef.current;
    if (!titleEl || !headerEl || !measureEl) {
      setShowConnectorLabel(true);
      return;
    }

    const updateLabelVisibility = () => {
      const isTruncated = titleEl.scrollWidth > titleEl.clientWidth;
      const headerStyle = window.getComputedStyle(headerEl);
      const paddingLeft = Number.parseFloat(headerStyle.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(headerStyle.paddingRight) || 0;
      const contentWidth = headerEl.clientWidth - paddingLeft - paddingRight;
      const titleWidth = titleEl.getBoundingClientRect().width;
      const rightColumnWidth = Math.max(0, (contentWidth - titleWidth) / 2);
      const connectorFullWidth = measureEl.getBoundingClientRect().width;
      setShowConnectorLabel(!isTruncated && rightColumnWidth >= connectorFullWidth);
    };

    updateLabelVisibility();
    const observer = new ResizeObserver(() => {
      updateLabelVisibility();
    });
    observer.observe(titleEl);
    observer.observe(headerEl);
    return () => observer.disconnect();
  }, [activeSession?.title, activeConnectors.length]);

  const handleComposerSubmit = async (displayText: string, contentBlocks: ContentBlock[]) => {
    if (!activeSessionId) {
      return;
    }
    await continueSession(activeSessionId, { displayText, contentBlocks }, composerWorkspacePath);
  };

  const handleStop = () => {
    if (activeSessionId) {
      stopSession(activeSessionId);
    }
  };

  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <span>{t('chat.loadingConversation')}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div
        ref={headerRef}
        className="relative h-12 border-b border-border-muted grid grid-cols-[1fr_auto_1fr] items-center px-4 lg:px-8 bg-background/88 backdrop-blur-md"
      >
        <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-text-muted">
          Open Cowork
        </div>
        <h2
          ref={titleRef}
          className="text-[15px] font-medium text-text-primary text-center truncate max-w-[40vw] lg:max-w-[32rem]"
        >
          {activeSession.title}
        </h2>
        {activeConnectors.length > 0 && (
          <>
            <div
              ref={connectorMeasureRef}
              aria-hidden="true"
              className="absolute left-0 top-0 -z-10 opacity-0 pointer-events-none"
            >
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-mcp/20">
                <Plug className="w-3.5 h-3.5" />
                <span className="text-xs font-medium whitespace-nowrap">
                  {t('chat.connectorCount', { count: activeConnectors.length })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-mcp/8 border border-mcp/15 justify-self-end">
              <Plug className="w-3.5 h-3.5 text-mcp" />
              <span className="text-xs text-mcp font-medium">
                {showConnectorLabel
                  ? t('chat.connectorCount', { count: activeConnectors.length })
                  : activeConnectors.length}
              </span>
            </div>
          </>
        )}
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div
          ref={messagesContainerRef}
          className="w-full max-w-[920px] mx-auto py-8 px-5 lg:px-8 space-y-5"
        >
          {displayedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-text-muted space-y-3 text-center">
              <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted/80">
                Open Cowork
              </p>
              <p className="text-base text-text-secondary">{t('chat.startConversation')}</p>
            </div>
          ) : (
            displayedMessages.map((message) => {
              const isStreaming =
                typeof message.id === 'string' && message.id.startsWith('partial-');
              return (
                <div key={message.id}>
                  <MessageCard message={message} isStreaming={isStreaming} />
                </div>
              );
            })
          )}

          {hasActiveTurn &&
            (!partialMessage || partialMessage.trim() === '') &&
            !partialThinking && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-full bg-background/80 border border-border-subtle max-w-fit">
                <Loader2 className="w-4 h-4 text-accent animate-spin" />
                <span className="text-sm text-text-secondary">{t('chat.processing')}</span>
              </div>
            )}

          {liveElapsed > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-1 ml-0.5">
              <Clock className="w-3 h-3" />
              <span>
                {timerActive
                  ? formatExecutionTime(liveElapsed)
                  : t('messageCard.executionTime', { time: formatExecutionTime(liveElapsed) })}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-border-muted bg-background/92 backdrop-blur-md">
        <div className="max-w-[920px] mx-auto px-5 lg:px-8 py-5">
          <RichPromptComposer
            isElectron={isElectron}
            canStop={canStop}
            modelLabel={appConfig?.model || t('chat.noModel')}
            placeholder={t('chat.typeMessage')}
            attachFilesTitle={t('welcome.attachFiles')}
            sendTitle={t('chat.sendMessage')}
            stopTitle={t('chat.stop')}
            disclaimer={t('chat.disclaimer')}
            getPastedImageAlt={(index) => t('common.pastedImageAlt', { index: index + 1 })}
            workspacePath={composerWorkspacePath}
            focusKey={activeSessionId}
            shellClassName="rounded-[1.75rem] bg-background/88 shadow-soft"
            onImageProcessError={() => {
              setGlobalNotice({
                id: `image-process-failed-${Date.now()}`,
                type: 'warning',
                message: t('chat.imageProcessFailed'),
              });
            }}
            onSubmit={async ({ displayText, contentBlocks }) => {
              await handleComposerSubmit(displayText, contentBlocks);
            }}
            onStop={handleStop}
          />
        </div>
      </div>
    </div>
  );
}
