import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FileText,
  Plus,
  Settings,
  Search,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../store';
import type { Session, WorkspaceTreeNode } from '../types';
import { useIPC } from '../hooks/useIPC';
import { saveAllDirtyWorkbenchTabs } from '../utils/file-workbench';

function insertChildren(
  nodes: WorkspaceTreeNode[],
  targetPath: string,
  children: WorkspaceTreeNode[]
): WorkspaceTreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children, hasChildren: children.length > 0 };
    }
    if (node.children?.length) {
      return { ...node, children: insertChildren(node.children, targetPath, children) };
    }
    return node;
  });
}

function WorkspaceNodeRow({
  node,
  depth,
  expandedPaths,
  selectedPath,
  openTabPaths,
  onToggleDirectory,
  onOpenFile,
}: {
  node: WorkspaceTreeNode;
  depth: number;
  expandedPaths: string[];
  selectedPath: string | null;
  openTabPaths: Set<string>;
  onToggleDirectory: (node: WorkspaceTreeNode) => void;
  onOpenFile: (node: WorkspaceTreeNode) => void;
}) {
  const isExpanded = expandedPaths.includes(node.path);
  const isSelected = selectedPath === node.path;
  const isOpen = openTabPaths.has(node.path);

  return (
    <div>
      <button
        type="button"
        onClick={() => (node.type === 'directory' ? onToggleDirectory(node) : onOpenFile(node))}
        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
          isSelected
            ? 'bg-accent-muted text-text-primary'
            : isOpen
              ? 'bg-surface-hover text-text-primary'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }`}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
      >
        {node.type === 'directory' ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <FolderOpen className="h-4 w-4 shrink-0" />
          </>
        ) : (
          <>
            <span className="w-4 shrink-0" />
            <FileText className="h-4 w-4 shrink-0" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {node.type === 'directory' && isExpanded && node.children?.length
        ? node.children.map((child) => (
            <WorkspaceNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              openTabPaths={openTabPaths}
              onToggleDirectory={onToggleDirectory}
              onOpenFile={onOpenFile}
            />
          ))
        : null}
    </div>
  );
}

export function WorkspacePanel() {
  const { t } = useTranslation();
  const workingDir = useAppStore((s) => s.workingDir);
  const workspaceTree = useAppStore((s) => s.workspaceTree);
  const expandedPaths = useAppStore((s) => s.expandedPaths);
  const selectedPath = useAppStore((s) => s.selectedPath);
  const historyCollapsed = useAppStore((s) => s.historyCollapsed);
  const treeLoadingState = useAppStore((s) => s.treeLoadingState);
  const treeError = useAppStore((s) => s.treeError);
  const workspaceTreeVersion = useAppStore((s) => s.workspaceTreeVersion);
  const openTabs = useAppStore((s) => s.openTabs);
  const dirtyByPath = useAppStore((s) => s.dirtyByPath);
  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessionStates = useAppStore((s) => s.sessionStates);
  const setWorkspaceTree = useAppStore((s) => s.setWorkspaceTree);
  const toggleExpandedPath = useAppStore((s) => s.toggleExpandedPath);
  const setSelectedPath = useAppStore((s) => s.setSelectedPath);
  const setHistoryCollapsed = useAppStore((s) => s.setHistoryCollapsed);
  const setTreeLoadingState = useAppStore((s) => s.setTreeLoadingState);
  const openFileTab = useAppStore((s) => s.openFileTab);
  const resetWorkbench = useAppStore((s) => s.resetWorkbench);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const setMessages = useAppStore((s) => s.setMessages);
  const setTraceSteps = useAppStore((s) => s.setTraceSteps);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const setGlobalNotice = useAppStore((s) => s.setGlobalNotice);
  const { changeWorkingDir, getSessionMessages, getSessionTraceSteps, deleteSession, isElectron } =
    useIPC();

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!workingDir || !window.electronAPI?.workspace) {
      setWorkspaceTree([]);
      return;
    }

    let cancelled = false;
    setTreeLoadingState('loading');

    void window.electronAPI.workspace
      .getTree()
      .then((tree) => {
        if (!cancelled) {
          setWorkspaceTree(tree);
          setTreeLoadingState('idle');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceTree([]);
          setTreeLoadingState(
            'error',
            error instanceof Error ? error.message : t('workspacePanel.loadFailed')
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setTreeLoadingState, setWorkspaceTree, t, workingDir, workspaceTreeVersion]);

  const openTabPaths = useMemo(() => new Set(openTabs.map((tab) => tab.path)), [openTabs]);
  const filteredSessions = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) {
      return sessions;
    }
    return sessions.filter((session) => session.title.toLowerCase().includes(normalized));
  }, [searchQuery, sessions]);

  const workspaceName = workingDir?.split(/[/\\]/).pop() || t('workspacePanel.noWorkspace');

  const handleWorkspaceSelect = async () => {
    const hasDirtyTabs = Object.values(dirtyByPath).some(Boolean);
    if (hasDirtyTabs) {
      const shouldContinue = window.confirm(t('workspacePanel.switchDirtyConfirm'));
      if (!shouldContinue) {
        return;
      }

      const shouldSave = window.confirm(t('workspacePanel.switchDirtySavePrompt'));
      if (shouldSave) {
        const success = await saveAllDirtyWorkbenchTabs();
        if (!success) {
          return;
        }
      }
    }

    const result = await changeWorkingDir(undefined, workingDir || undefined);
    if (result.success) {
      resetWorkbench();
      setSelectedPath(null);
    }
    if (!result.success && result.error && result.error !== 'User cancelled') {
      setGlobalNotice({
        id: `workspace-open-${Date.now()}`,
        type: 'warning',
        message: `${t('workspacePanel.openFailed')}: ${result.error}`,
      });
    }
  };

  const handleOpenFile = async (node: WorkspaceTreeNode) => {
    setSelectedPath(node.path);
    if (!/\.md$/i.test(node.path)) {
      setGlobalNotice({
        id: `workspace-unsupported-${Date.now()}`,
        type: 'warning',
        message: t('workspacePanel.markdownOnly'),
      });
      return;
    }

    try {
      const file = await window.electronAPI.workspace.readFile(node.path);
      openFileTab(
        {
          path: file.path,
          name: node.name,
          workspacePath: workingDir || '',
          lastOpenedAt: Date.now(),
        },
        file.content
      );
    } catch (error) {
      setGlobalNotice({
        id: `workspace-open-error-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : t('workspacePanel.readFileFailed'),
      });
    }
  };

  const handleToggleDirectory = async (node: WorkspaceTreeNode) => {
    const alreadyExpanded = expandedPaths.includes(node.path);
    toggleExpandedPath(node.path);
    if (alreadyExpanded || node.children) {
      return;
    }

    try {
      const children = await window.electronAPI.workspace.getTree(node.path);
      setWorkspaceTree(insertChildren(useAppStore.getState().workspaceTree, node.path, children));
    } catch (error) {
      setGlobalNotice({
        id: `workspace-expand-error-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : t('workspacePanel.loadFailed'),
      });
    }
  };

  const handleSessionClick = async (session: Session) => {
    setShowSettings(false);
    if (activeSessionId === session.id) {
      return;
    }

    setActiveSession(session.id);

    const existingMessages = sessionStates[session.id]?.messages;
    if ((!existingMessages || existingMessages.length === 0) && isElectron) {
      const messages = await getSessionMessages(session.id);
      if (messages?.length) {
        setMessages(session.id, messages);
      }
    }

    const existingSteps = sessionStates[session.id]?.traceSteps;
    if ((!existingSteps || existingSteps.length === 0) && isElectron) {
      const steps = await getSessionTraceSteps(session.id);
      setTraceSteps(session.id, steps || []);
    }
  };

  return (
    <aside className="w-[320px] shrink-0 border-r border-border-subtle bg-surface/70 backdrop-blur-xl">
      <div className="flex h-full flex-col">
        <div className="border-b border-border-subtle px-4 py-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.18em] text-text-muted">
                {t('workspacePanel.sectionLabel')}
              </div>
              <div
                className="truncate text-base font-semibold text-text-primary"
                title={workingDir || ''}
              >
                {workspaceName}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary px-3 py-2 text-sm"
              onClick={handleWorkspaceSelect}
            >
              <FolderOpen className="h-4 w-4" />
              <span>{t('workspacePanel.openWorkspace')}</span>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost flex-1 justify-start px-3 py-2 text-sm"
              onClick={() => {
                setActiveSession(null);
                setShowSettings(false);
              }}
            >
              <Plus className="h-4 w-4" />
              <span>{t('workspacePanel.newChat')}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost px-3 py-2"
              onClick={() => setShowSettings(true)}
              aria-label={t('workspacePanel.openSettings')}
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {treeLoadingState === 'loading' ? (
            <div className="px-3 py-6 text-sm text-text-muted">
              {t('workspacePanel.loadingTree')}
            </div>
          ) : treeError ? (
            <div className="rounded-2xl border border-error/30 bg-error/10 px-3 py-3 text-sm text-error">
              {treeError}
            </div>
          ) : workspaceTree.length === 0 ? (
            <div className="px-3 py-6 text-sm text-text-muted">{t('workspacePanel.emptyTree')}</div>
          ) : (
            workspaceTree.map((node) => (
              <WorkspaceNodeRow
                key={node.path}
                node={node}
                depth={0}
                expandedPaths={expandedPaths}
                selectedPath={selectedPath}
                openTabPaths={openTabPaths}
                onToggleDirectory={handleToggleDirectory}
                onOpenFile={handleOpenFile}
              />
            ))
          )}
        </div>

        <div className="border-t border-border-subtle px-3 py-3">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left"
            onClick={() => setHistoryCollapsed(!historyCollapsed)}
          >
            <span className="text-sm font-medium text-text-primary">
              {t('workspacePanel.historyTitle')}
            </span>
            {historyCollapsed ? (
              <ChevronRight className="h-4 w-4 text-text-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 text-text-muted" />
            )}
          </button>

          {!historyCollapsed && (
            <div className="mt-2">
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
                <Search className="h-4 w-4 text-text-muted" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                  placeholder={t('workspacePanel.searchSessions')}
                />
              </div>
              <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
                {filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      activeSessionId === session.id
                        ? 'bg-surface-hover text-text-primary'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void handleSessionClick(session)}
                      className="min-w-0 flex-1 truncate text-left"
                    >
                      {session.title}
                    </button>
                    <button
                      type="button"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteSession(session.id);
                      }}
                      aria-label={t('workspacePanel.deleteSession')}
                    >
                      <Trash2 className="h-4 w-4 text-text-muted hover:text-error" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
