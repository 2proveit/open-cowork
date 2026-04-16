import * as path from 'path';

interface CreateUniqueAttachmentFilenameInput {
  requestedName: string;
  sourcePath?: string;
  usedNames: Set<string>;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/^[a-zA-Z]:/, '')
    .replace(/[\\/]+/g, '__')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function createUniqueAttachmentFilename({
  requestedName,
  sourcePath,
  usedNames,
}: CreateUniqueAttachmentFilenameInput): string {
  const baseName = path.basename(requestedName || sourcePath || 'attachment');
  const extension = path.extname(baseName);
  const stem = path.basename(baseName, extension) || 'attachment';

  let candidate = baseName || `attachment${extension}`;
  if (!usedNames.has(candidate)) {
    usedNames.add(candidate);
    return candidate;
  }

  const sourceHint = sanitizeFilenamePart(sourcePath || requestedName);
  if (sourceHint) {
    candidate = sourceHint.endsWith(extension) ? sourceHint : `${sourceHint}${extension}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }

  let counter = 2;
  while (usedNames.has(candidate)) {
    candidate = `${stem}-${counter}${extension}`;
    counter += 1;
  }

  usedNames.add(candidate);
  return candidate;
}
