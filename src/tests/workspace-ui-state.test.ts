import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../renderer/store';

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
});

describe('workspace and workbench state', () => {
  it('toggles expanded workspace paths without duplicates', () => {
    const store = useAppStore.getState();

    store.toggleExpandedPath('/repo/docs');
    expect(useAppStore.getState().expandedPaths).toEqual(['/repo/docs']);

    store.toggleExpandedPath('/repo/docs');
    expect(useAppStore.getState().expandedPaths).toEqual([]);
  });

  it('opens a markdown file into the workbench and tracks its content', () => {
    useAppStore.getState().openFileTab(
      {
        path: '/repo/docs/plan.md',
        name: 'plan.md',
        workspacePath: '/repo',
        lastOpenedAt: 100,
      },
      '# Plan'
    );

    const state = useAppStore.getState();
    expect(state.openTabs).toHaveLength(1);
    expect(state.activeTabPath).toBe('/repo/docs/plan.md');
    expect(state.draftContentByPath['/repo/docs/plan.md']).toBe('# Plan');
    expect(state.savedContentByPath['/repo/docs/plan.md']).toBe('# Plan');
    expect(state.dirtyByPath['/repo/docs/plan.md']).toBe(false);
    expect(state.viewModeByPath['/repo/docs/plan.md']).toBe('edit');
  });

  it('re-activates an existing tab instead of creating a duplicate', () => {
    const store = useAppStore.getState();
    store.openFileTab(
      {
        path: '/repo/docs/plan.md',
        name: 'plan.md',
        workspacePath: '/repo',
        lastOpenedAt: 100,
      },
      '# Plan'
    );
    store.setFileDraft('/repo/docs/plan.md', '# Updated draft');

    store.openFileTab(
      {
        path: '/repo/docs/plan.md',
        name: 'plan.md',
        workspacePath: '/repo',
        lastOpenedAt: 200,
      },
      '# Disk copy should not overwrite draft'
    );

    const state = useAppStore.getState();
    expect(state.openTabs).toHaveLength(1);
    expect(state.activeTabPath).toBe('/repo/docs/plan.md');
    expect(state.draftContentByPath['/repo/docs/plan.md']).toBe('# Updated draft');
  });
});
