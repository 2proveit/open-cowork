import i18n from '../i18n/config';
import { useAppStore } from '../store';

export async function saveWorkbenchFile(path: string): Promise<boolean> {
  const state = useAppStore.getState();
  const nextDraft = state.draftContentByPath[path];
  const lastSaved = state.savedContentByPath[path];

  if (nextDraft === undefined) {
    return true;
  }

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
