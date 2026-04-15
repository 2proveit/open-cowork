import i18n from '../i18n/config';
import { useAppStore } from '../store';

const pendingWorkbenchSaves = new Map<string, Promise<boolean>>();

type SaveWorkbenchFileMode = 'autosave' | 'flush';

interface SaveWorkbenchFileOptions {
  mode?: SaveWorkbenchFileMode;
}

export function getWorkbenchPreviewContent(
  draftContent: string | undefined,
  savedContent: string
): string {
  return draftContent ?? savedContent;
}

export function shouldAutosaveDraft(
  activeTabPath: string | null,
  draftContent: string | undefined,
  isDirty: boolean,
  isSaving: boolean,
  lastAttemptedDraft?: string
): activeTabPath is string {
  return (
    activeTabPath !== null &&
    draftContent !== undefined &&
    isDirty &&
    !isSaving &&
    draftContent !== lastAttemptedDraft
  );
}

export async function saveWorkbenchFile(
  path: string,
  options: SaveWorkbenchFileOptions = {}
): Promise<boolean> {
  const mode = options.mode || 'flush';
  const pendingSave = pendingWorkbenchSaves.get(path);
  if (pendingSave) {
    const success = await pendingSave;
    if (!success) {
      return false;
    }
    if (!useAppStore.getState().dirtyByPath[path]) {
      return true;
    }
    return mode === 'flush' ? saveWorkbenchFile(path, options) : true;
  }

  const state = useAppStore.getState();
  const nextDraft = state.draftContentByPath[path];
  const lastSaved = state.savedContentByPath[path];

  if (nextDraft === undefined || nextDraft === lastSaved) {
    return true;
  }

  const savePromise = (async () => {
    state.markFileSaving(path, true);
    const result = await window.electronAPI.workspace.writeFile(path, nextDraft, lastSaved);
    if (result.success) {
      state.markFileSaved(path, nextDraft, result.savedAt);
      return true;
    }

    state.markFileSaving(path, false);
    state.setFileSaveError(path, result.error || i18n.t('fileWorkbench.saveFailed'));
    state.setGlobalNotice({
      id: `workbench-save-${Date.now()}`,
      type: result.conflict ? 'warning' : 'error',
      message: result.conflict
        ? i18n.t('fileWorkbench.conflictDetected')
        : result.error || i18n.t('fileWorkbench.saveFailed'),
    });
    return false;
  })();

  pendingWorkbenchSaves.set(path, savePromise);

  try {
    const success = await savePromise;
    if (!success) {
      return false;
    }
  } finally {
    if (pendingWorkbenchSaves.get(path) === savePromise) {
      pendingWorkbenchSaves.delete(path);
    }
  }

  if (!useAppStore.getState().dirtyByPath[path]) {
    return true;
  }

  return mode === 'flush' ? saveWorkbenchFile(path, options) : true;
}

export async function saveAllDirtyWorkbenchTabs(): Promise<boolean> {
  const state = useAppStore.getState();
  const dirtyPaths = Object.entries(state.dirtyByPath)
    .filter(([, dirty]) => dirty)
    .map(([path]) => path);

  for (const dirtyPath of dirtyPaths) {
    const success = await saveWorkbenchFile(dirtyPath);
    if (!success) {
      return false;
    }
  }

  return true;
}
