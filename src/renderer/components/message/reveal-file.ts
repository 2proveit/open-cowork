interface RevealFileOptions {
  filePath: string;
  cwd?: string;
  showItemInFolder?: (filePath: string, cwd?: string) => Promise<boolean>;
  onFailure: (error?: unknown) => void;
}

export async function revealFileInShell({
  filePath,
  cwd,
  showItemInFolder,
  onFailure,
}: RevealFileOptions): Promise<void> {
  if (!showItemInFolder) {
    return;
  }

  try {
    const revealed = await showItemInFolder(filePath, cwd);
    if (!revealed) {
      onFailure();
    }
  } catch (error) {
    onFailure(error);
  }
}
