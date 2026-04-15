import type { FileAttachmentContent, ImageContent } from '../../types';

const MAX_IMAGE_BLOB_SIZE_BYTES = 3.75 * 1024 * 1024;

export interface ComposerImageAttachment {
  url: string;
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export interface ComposerFileAttachment {
  name: string;
  path: string;
  size: number;
  type: string;
  inlineDataBase64?: string;
}

export interface DroppedAttachmentResult {
  images: ComposerImageAttachment[];
  files: ComposerFileAttachment[];
}

function normalizeImageMediaType(type: string): ComposerImageAttachment['mediaType'] {
  if (
    type === 'image/jpeg' ||
    type === 'image/png' ||
    type === 'image/gif' ||
    type === 'image/webp'
  ) {
    return type;
  }
  return 'image/png';
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader result is not a string'));
        return;
      }
      const parts = result.split(',');
      resolve(parts[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function resizeImageIfNeeded(blob: Blob): Promise<Blob> {
  if (blob.size <= MAX_IMAGE_BLOB_SIZE_BYTES) {
    return Promise.resolve(blob);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      const baseScale = Math.sqrt(MAX_IMAGE_BLOB_SIZE_BYTES / blob.size);
      const encode = async (scale: number, quality: number): Promise<Blob> => {
        canvas.width = Math.max(1, Math.floor(image.width * scale));
        canvas.height = Math.max(1, Math.floor(image.height * scale));
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const encoded = await new Promise<Blob>((resolveBlob, rejectBlob) => {
          canvas.toBlob(
            (compressedBlob) => {
              if (!compressedBlob) {
                rejectBlob(new Error('Failed to encode image blob'));
                return;
              }
              resolveBlob(compressedBlob);
            },
            blob.type || 'image/jpeg',
            quality
          );
        });

        if (encoded.size <= MAX_IMAGE_BLOB_SIZE_BYTES || (quality <= 0.5 && scale <= 0.3)) {
          return encoded;
        }

        const nextQuality = Math.max(0.5, quality - 0.1);
        const nextScale = quality <= 0.5 ? scale * 0.9 : scale;
        return encode(nextScale, nextQuality);
      };

      encode(baseScale, 0.9).then(resolve).catch(reject);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    image.src = objectUrl;
  });
}

export async function toImageAttachment(blob: Blob): Promise<ComposerImageAttachment> {
  const resizedBlob = await resizeImageIfNeeded(blob);
  return {
    url: URL.createObjectURL(resizedBlob),
    base64: await blobToBase64(resizedBlob),
    mediaType: normalizeImageMediaType(resizedBlob.type),
  };
}

export function filesFromPaths(filePaths: string[]): ComposerFileAttachment[] {
  return filePaths.map((filePath) => ({
    name: filePath.split(/[/\\]/).pop() || 'unknown',
    path: filePath,
    size: 0,
    type: 'application/octet-stream',
  }));
}

export async function processDroppedFiles(files: File[]): Promise<DroppedAttachmentResult> {
  const imageFiles = files.filter((file) => file.type.startsWith('image/'));
  const nonImageFiles = files.filter((file) => !file.type.startsWith('image/'));

  const images = await Promise.all(imageFiles.map((file) => toImageAttachment(file)));
  const processedFiles = await Promise.all(
    nonImageFiles.map(async (file) => {
      const droppedPath = 'path' in file && typeof file.path === 'string' ? file.path : '';
      return {
        name: file.name,
        path: droppedPath,
        size: file.size,
        type: file.type || 'application/octet-stream',
        inlineDataBase64: droppedPath ? undefined : await blobToBase64(file),
      };
    })
  );

  return { images, files: processedFiles };
}

export function toImageContent(image: ComposerImageAttachment): ImageContent {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: image.mediaType,
      data: image.base64,
    },
  };
}

export function toFileAttachmentContent(file: ComposerFileAttachment): FileAttachmentContent {
  return {
    type: 'file_attachment',
    filename: file.name,
    relativePath: file.path,
    size: file.size,
    mimeType: file.type,
    inlineDataBase64: file.inlineDataBase64,
  };
}

export function revokeImageUrls(images: ComposerImageAttachment[]): void {
  images.forEach((image) => URL.revokeObjectURL(image.url));
}
