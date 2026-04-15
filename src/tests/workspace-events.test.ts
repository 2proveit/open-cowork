import { describe, expect, it } from 'vitest';
import {
  shouldBroadcastWorkspacePathChange,
  shouldReloadWorkspaceTree,
} from '../shared/workspace-events';

describe('workspace event helpers', () => {
  it('broadcasts working directory changes only for global workspace switches', () => {
    expect(shouldBroadcastWorkspacePathChange(undefined)).toBe(true);
    expect(shouldBroadcastWorkspacePathChange(null)).toBe(true);
    expect(shouldBroadcastWorkspacePathChange('session-123')).toBe(false);
  });

  it('reloads the workspace tree only for structural watcher events', () => {
    expect(shouldReloadWorkspaceTree('add')).toBe(true);
    expect(shouldReloadWorkspaceTree('unlink')).toBe(true);
    expect(shouldReloadWorkspaceTree('addDir')).toBe(true);
    expect(shouldReloadWorkspaceTree('unlinkDir')).toBe(true);
    expect(shouldReloadWorkspaceTree('change')).toBe(false);
  });
});
