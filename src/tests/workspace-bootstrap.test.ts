import { describe, expect, it } from 'vitest';
import { resolveInitialWorkspace } from '../main/workspace-bootstrap';

describe('resolveInitialWorkspace', () => {
  it('uses the persisted workspace when it exists, is accessible, and is supported', () => {
    const result = resolveInitialWorkspace({
      persistedWorkspacePath: '/Users/test/project',
      platform: 'darwin',
      sandboxEnabled: false,
      directoryExists: (path) => path === '/Users/test/project',
      directoryAccessible: (path) => path === '/Users/test/project',
    });

    expect(result).toEqual({
      workspacePath: '/Users/test/project',
      requiresSelection: false,
      reason: null,
    });
  });

  it('requires selection when there is no persisted workspace', () => {
    const result = resolveInitialWorkspace({
      persistedWorkspacePath: '',
      platform: 'darwin',
      sandboxEnabled: false,
      directoryExists: () => true,
      directoryAccessible: () => true,
    });

    expect(result).toEqual({
      workspacePath: null,
      requiresSelection: true,
      reason: 'missing',
    });
  });

  it('requires selection when the persisted workspace directory does not exist', () => {
    const result = resolveInitialWorkspace({
      persistedWorkspacePath: '/Users/test/missing',
      platform: 'darwin',
      sandboxEnabled: false,
      directoryExists: () => false,
      directoryAccessible: () => true,
    });

    expect(result).toEqual({
      workspacePath: null,
      requiresSelection: true,
      reason: 'invalid',
    });
  });

  it('requires selection when the persisted workspace is not accessible', () => {
    const result = resolveInitialWorkspace({
      persistedWorkspacePath: '/Users/test/private',
      platform: 'darwin',
      sandboxEnabled: false,
      directoryExists: () => true,
      directoryAccessible: () => false,
    });

    expect(result).toEqual({
      workspacePath: null,
      requiresSelection: true,
      reason: 'invalid',
    });
  });

  it('requires selection when the persisted workspace is unsupported', () => {
    const result = resolveInitialWorkspace({
      persistedWorkspacePath: '\\\\server\\share',
      platform: 'win32',
      sandboxEnabled: true,
      directoryExists: () => true,
      directoryAccessible: () => true,
    });

    expect(result).toEqual({
      workspacePath: null,
      requiresSelection: true,
      reason: 'unsupported',
    });
  });
});
