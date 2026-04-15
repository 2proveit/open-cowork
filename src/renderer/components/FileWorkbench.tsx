import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, FileText, PencilLine, Save, X } from 'lucide-react';
import { useAppStore } from '../store';
import { MessageMarkdown } from './MessageMarkdown';
import {
  getWorkbenchPreviewContent,
  saveWorkbenchFile,
  shouldAutosaveDraft,
} from '../utils/file-workbench';

export function FileWorkbench() {
  const { t } = useTranslation();
  const openTabs = useAppStore((s) => s.openTabs);
  const activeTabPath = useAppStore((s) => s.activeTabPath);
  const viewModeByPath = useAppStore((s) => s.viewModeByPath);
  const draftContentByPath = useAppStore((s) => s.draftContentByPath);
  const savedContentByPath = useAppStore((s) => s.savedContentByPath);
  const dirtyByPath = useAppStore((s) => s.dirtyByPath);
  const savingByPath = useAppStore((s) => s.savingByPath);
  const saveErrorByPath = useAppStore((s) => s.saveErrorByPath);
  const lastSavedAtByPath = useAppStore((s) => s.lastSavedAtByPath);
  const setActiveTabPath = useAppStore((s) => s.setActiveTabPath);
  const closeFileTab = useAppStore((s) => s.closeFileTab);
  const setTabViewMode = useAppStore((s) => s.setTabViewMode);
  const setFileDraft = useAppStore((s) => s.setFileDraft);
  const autosaveAttemptByPathRef = useRef<Record<string, string | undefined>>({});
  const activeTab = openTabs.find((tab) => tab.path === activeTabPath) || null;
  const activeDraft = activeTabPath ? draftContentByPath[activeTabPath] : undefined;
  const activeDraftText = activeDraft ?? '';
  const activeSaved = activeTabPath ? savedContentByPath[activeTabPath] || '' : '';
  const activeMode = activeTabPath ? viewModeByPath[activeTabPath] || 'edit' : 'edit';
  const isDirty = activeTabPath ? dirtyByPath[activeTabPath] : false;
  const isSaving = activeTabPath ? savingByPath[activeTabPath] : false;
  const saveError = activeTabPath ? saveErrorByPath[activeTabPath] : null;
  const activeLastSavedAt = activeTabPath ? lastSavedAtByPath[activeTabPath] : null;

  useEffect(() => {
    const autosavePath = activeTabPath;
    const lastAttemptedDraft = autosavePath
      ? autosaveAttemptByPathRef.current[autosavePath]
      : undefined;
    if (!shouldAutosaveDraft(autosavePath, activeDraft, isDirty, isSaving, lastAttemptedDraft)) {
      return;
    }

    const draftToSave = activeDraft;
    const timer = window.setTimeout(() => {
      autosaveAttemptByPathRef.current[autosavePath] = draftToSave;
      void saveWorkbenchFile(autosavePath, { mode: 'autosave' });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [activeDraft, activeLastSavedAt, activeTabPath, isDirty, isSaving, saveError]);

  async function handleSave(path: string) {
    await saveWorkbenchFile(path);
  }

  async function handleCloseTab(path: string) {
    if (!dirtyByPath[path]) {
      closeFileTab(path);
      return;
    }

    const shouldContinue = window.confirm(t('fileWorkbench.closeDirtyConfirm'));
    if (!shouldContinue) {
      return;
    }

    const shouldSave = window.confirm(t('fileWorkbench.closeDirtySavePrompt'));
    if (shouldSave) {
      const success = await saveWorkbenchFile(path);
      if (!success) {
        return;
      }
    }

    closeFileTab(path);
  }

  return (
    <aside className="w-[420px] shrink-0 border-l border-border-subtle bg-background-secondary/80">
      <div className="flex h-full flex-col">
        <div className="border-b border-border-subtle px-3 py-3">
          {openTabs.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <FileText className="h-4 w-4" />
              <span>{t('fileWorkbench.emptyTitle')}</span>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto">
              {openTabs.map((tab) => {
                const isActive = tab.path === activeTabPath;
                const isTabDirty = dirtyByPath[tab.path];
                return (
                  <button
                    key={tab.path}
                    type="button"
                    onClick={() => setActiveTabPath(tab.path)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                      isActive
                        ? 'border-accent/40 bg-accent-muted text-text-primary'
                        : 'border-border-subtle bg-surface text-text-secondary'
                    }`}
                  >
                    <span className="truncate">{tab.name}</span>
                    {isTabDirty && <span className="h-2 w-2 rounded-full bg-accent" />}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCloseTab(tab.path);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {activeTab ? (
          <>
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">
                  {activeTab.name}
                </div>
                <div className="text-xs text-text-muted">
                  {isSaving
                    ? t('fileWorkbench.saving')
                    : saveError
                      ? saveError
                      : isDirty
                        ? t('fileWorkbench.unsavedChanges')
                        : t('fileWorkbench.saved')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`btn px-3 py-2 text-sm ${activeMode === 'edit' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setTabViewMode(activeTab.path, 'edit')}
                >
                  <PencilLine className="h-4 w-4" />
                  <span>{t('common.edit')}</span>
                </button>
                <button
                  type="button"
                  className={`btn px-3 py-2 text-sm ${activeMode === 'preview' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setTabViewMode(activeTab.path, 'preview')}
                >
                  <Eye className="h-4 w-4" />
                  <span>{t('fileWorkbench.preview')}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary px-3 py-2 text-sm"
                  onClick={() => void handleSave(activeTab.path)}
                >
                  <Save className="h-4 w-4" />
                  <span>{t('common.save')}</span>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {activeMode === 'edit' ? (
                <textarea
                  value={activeDraftText}
                  onChange={(event) => setFileDraft(activeTab.path, event.target.value)}
                  className="h-full w-full resize-none border-0 bg-transparent px-4 py-4 font-mono text-sm leading-6 text-text-primary outline-none"
                  spellCheck={false}
                />
              ) : (
                <div className="h-full overflow-y-auto px-5 py-5">
                  <MessageMarkdown
                    normalizedText={getWorkbenchPreviewContent(activeDraft, activeSaved)}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-text-muted">
            {t('fileWorkbench.emptyBody')}
          </div>
        )}
      </div>
    </aside>
  );
}
