import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkbenchPreviewContent,
  saveWorkbenchFile,
  shouldAutosaveDraft,
} from '../renderer/utils/file-workbench';
import { useAppStore } from '../renderer/store';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  vi.restoreAllMocks();
});

describe('file workbench helpers', () => {
  it('uses an empty draft for preview instead of falling back to saved content', () => {
    expect(getWorkbenchPreviewContent('', '# Saved content')).toBe('');
    expect(getWorkbenchPreviewContent(undefined, '# Saved content')).toBe('# Saved content');
  });

  it('skips autosave scheduling while no tab is active, content is clean, or a save is in flight', () => {
    expect(shouldAutosaveDraft(null, '# Draft', true, false)).toBe(false);
    expect(shouldAutosaveDraft('/repo/docs/plan.md', '# Draft', false, false)).toBe(false);
    expect(shouldAutosaveDraft('/repo/docs/plan.md', '# Draft', true, true)).toBe(false);
    expect(shouldAutosaveDraft('/repo/docs/plan.md', undefined, true, false)).toBe(false);
    expect(shouldAutosaveDraft('/repo/docs/plan.md', '# Draft', true, false, '# Draft')).toBe(
      false
    );
    expect(shouldAutosaveDraft('/repo/docs/plan.md', '# Draft v2', true, false, '# Draft v1')).toBe(
      true
    );
  });

  it('waits for an in-flight save and flushes the newest draft before reporting success', async () => {
    const path = '/repo/docs/plan.md';
    const store = useAppStore.getState();
    store.openFileTab(
      {
        path,
        name: 'plan.md',
        workspacePath: '/repo',
        lastOpenedAt: 100,
      },
      '# Saved v1'
    );
    store.setFileDraft(path, '# Draft v2');

    const firstWrite = createDeferred<{ success: boolean; savedAt: number }>();
    const secondWrite = createDeferred<{ success: boolean; savedAt: number }>();
    const writeFile = vi
      .fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(() => secondWrite.promise);

    vi.stubGlobal('window', {
      electronAPI: {
        workspace: {
          writeFile,
        },
      },
    });

    const initialSavePromise = saveWorkbenchFile(path, { mode: 'flush' });
    await Promise.resolve();
    expect(writeFile).toHaveBeenCalledTimes(1);

    useAppStore.getState().setFileDraft(path, '# Draft v3');

    let flushResolved = false;
    const flushPromise = saveWorkbenchFile(path, { mode: 'flush' }).then((result) => {
      flushResolved = true;
      return result;
    });

    await Promise.resolve();
    expect(flushResolved).toBe(false);

    firstWrite.resolve({ success: true, savedAt: 110 });
    await Promise.resolve();
    await Promise.resolve();

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(flushResolved).toBe(false);

    secondWrite.resolve({ success: true, savedAt: 120 });

    await expect(flushPromise).resolves.toBe(true);
    await expect(initialSavePromise).resolves.toBe(true);

    const nextState = useAppStore.getState();
    expect(nextState.savedContentByPath[path]).toBe('# Draft v3');
    expect(nextState.draftContentByPath[path]).toBe('# Draft v3');
    expect(nextState.dirtyByPath[path]).toBe(false);
  });

  it('keeps autosave debounced when newer edits arrive during an in-flight save', async () => {
    const path = '/repo/docs/plan.md';
    const store = useAppStore.getState();
    store.openFileTab(
      {
        path,
        name: 'plan.md',
        workspacePath: '/repo',
        lastOpenedAt: 100,
      },
      '# Saved v1'
    );
    store.setFileDraft(path, '# Draft v2');

    const firstWrite = createDeferred<{ success: boolean; savedAt: number }>();
    const writeFile = vi.fn().mockImplementationOnce(() => firstWrite.promise);

    vi.stubGlobal('window', {
      electronAPI: {
        workspace: {
          writeFile,
        },
      },
    });

    const autosavePromise = saveWorkbenchFile(path, { mode: 'autosave' });
    await Promise.resolve();
    expect(writeFile).toHaveBeenCalledTimes(1);

    useAppStore.getState().setFileDraft(path, '# Draft v3');
    firstWrite.resolve({ success: true, savedAt: 110 });

    await expect(autosavePromise).resolves.toBe(true);

    const nextState = useAppStore.getState();
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(nextState.savedContentByPath[path]).toBe('# Draft v2');
    expect(nextState.draftContentByPath[path]).toBe('# Draft v3');
    expect(nextState.dirtyByPath[path]).toBe(true);
  });
});
