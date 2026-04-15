export function shouldBroadcastWorkspacePathChange(sessionId?: string | null): boolean {
  return !sessionId;
}

export function shouldReloadWorkspaceTree(kind: string): boolean {
  return kind === 'add' || kind === 'unlink' || kind === 'addDir' || kind === 'unlinkDir';
}
