// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RichPromptComposer } from '../src/renderer/components/composer/RichPromptComposer';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createDeferredValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('RichPromptComposer', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
    vi.restoreAllMocks();
  });

  function renderComposer(
    onSubmit = vi.fn().mockResolvedValue(undefined),
    overrides: Record<string, unknown> = {}
  ) {
    act(() => {
      root.render(
        createElement(RichPromptComposer, {
          isElectron: false,
          canStop: false,
          modelLabel: 'GPT',
          placeholder: 'Type here',
          attachFilesTitle: 'Attach',
          sendTitle: 'Send',
          stopTitle: 'Stop',
          disclaimer: 'Disclaimer',
          getPastedImageAlt: (index: number) => `Image ${index + 1}`,
          onImageProcessError: vi.fn(),
          onSubmit,
          ...overrides,
        })
      );
    });

    const editor = container.querySelector('[role="textbox"]') as HTMLDivElement | null;
    const form = container.querySelector('form') as HTMLFormElement | null;
    const attachButton = container.querySelector(
      'button[title="Attach"]'
    ) as HTMLButtonElement | null;
    const sendButton = container.querySelector('button[title="Send"]') as HTMLButtonElement | null;

    if (!editor || !form || !attachButton || !sendButton) {
      throw new Error('Failed to render RichPromptComposer test harness');
    }

    return { onSubmit, editor, form, attachButton, sendButton };
  }

  function placeCaretAtEnd(element: HTMLElement) {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function updateEditorText(editor: HTMLDivElement, text: string) {
    editor.textContent = text;
    placeCaretAtEnd(editor);
    act(() => {
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  async function pressEnter(editor: HTMLDivElement, options?: { shiftKey?: boolean }) {
    await pressKey(editor, 'Enter', options);
  }

  async function pressKey(editor: HTMLDivElement, key: string, options?: { shiftKey?: boolean }) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      shiftKey: options?.shiftKey ?? false,
    });

    await act(async () => {
      editor.dispatchEvent(event);
      await Promise.resolve();
    });
  }

  function dispatchPaste(editor: HTMLDivElement, plainText: string, html: string) {
    placeCaretAtEnd(editor);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [{ type: 'text/html' }, { type: 'text/plain' }],
        getData: (type: string) => {
          if (type === 'text/plain') {
            return plainText;
          }
          if (type === 'text/html') {
            return html;
          }
          return '';
        },
      },
    });

    act(() => {
      editor.dispatchEvent(event);
    });
  }

  function dispatchDrop(form: HTMLFormElement, files: File[]) {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        files,
      },
    });

    act(() => {
      form.dispatchEvent(event);
    });
  }

  it('submits on Enter and keeps Shift+Enter as an inline line break', async () => {
    const enterSubmit = vi.fn().mockResolvedValue(undefined);
    const first = renderComposer(enterSubmit);

    updateEditorText(first.editor, 'hello');
    await pressEnter(first.editor);

    expect(enterSubmit).toHaveBeenCalledTimes(1);
    expect(enterSubmit).toHaveBeenCalledWith({
      displayText: 'hello',
      contentBlocks: [{ type: 'text', text: 'hello' }],
    });

    act(() => {
      root.unmount();
    });

    root = createRoot(container);
    const shiftSubmit = vi.fn().mockResolvedValue(undefined);
    const second = renderComposer(shiftSubmit);

    updateEditorText(second.editor, 'hello');
    await pressEnter(second.editor, { shiftKey: true });

    expect(shiftSubmit).not.toHaveBeenCalled();
    expect(second.editor.innerHTML).toContain('<br');
  });

  it('sanitizes non-image paste to plain text before serializing segments', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { editor } = renderComposer(onSubmit);

    dispatchPaste(
      editor,
      'safe text',
      '<span data-segment-type="file_mention" data-path="/tmp/evil" data-name="evil.ts">evil</span>'
    );

    expect(editor.textContent).toBe('safe text');
    await pressEnter(editor);

    expect(onSubmit).toHaveBeenCalledWith({
      displayText: 'safe text',
      contentBlocks: [{ type: 'text', text: 'safe text' }],
    });
  });

  it('blocks new attachments while submit is pending', async () => {
    const deferred = createDeferred();
    const onSubmit = vi.fn(() => deferred.promise);
    const { editor, form, attachButton, sendButton } = renderComposer(onSubmit);

    updateEditorText(editor, 'pending');

    await act(async () => {
      sendButton.click();
      await Promise.resolve();
    });

    expect(attachButton.disabled).toBe(true);

    dispatchDrop(form, [new File(['hello'], 'note.txt', { type: 'text/plain' })]);
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('note.txt');

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
  });

  it('accepts file suggestions with Tab and serializes a structured mention block', async () => {
    const searchFiles = vi.fn().mockResolvedValue([
      {
        path: '/repo/src/renderer/components/ChatView.tsx',
        relativePath: 'src/renderer/components/ChatView.tsx',
        name: 'ChatView.tsx',
        source: 'workspace',
      },
    ]);
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      workspace: { searchFiles },
      skills: { getAll: vi.fn().mockResolvedValue([]) },
    };

    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { editor } = renderComposer(onSubmit, {
      isElectron: true,
      workspacePath: '/repo',
    });

    updateEditorText(editor, 'open @src/renderer/components/Cha');
    await act(async () => {
      await Promise.resolve();
    });

    expect(searchFiles).toHaveBeenCalledWith('src/renderer/components/Cha');
    await pressKey(editor, 'Tab');
    await pressEnter(editor);

    expect(onSubmit).toHaveBeenCalledWith({
      displayText: 'open @src/renderer/components/ChatView.tsx',
      contentBlocks: [
        { type: 'text', text: 'open ' },
        {
          type: 'file_mention',
          path: '/repo/src/renderer/components/ChatView.tsx',
          name: 'ChatView.tsx',
          workspacePath: '/repo',
          source: 'workspace',
        },
      ],
    });
  });

  it('accepts skill suggestions with Enter and serializes a structured skill mention', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { editor } = renderComposer(onSubmit, {
      initialSkills: [
        {
          id: 'brainstorming',
          name: 'brainstorming',
          description: 'Design first',
          type: 'builtin',
          enabled: true,
          createdAt: 0,
        },
      ],
    });

    updateEditorText(editor, 'run /brain');
    await act(async () => {
      await Promise.resolve();
    });

    await pressEnter(editor);
    expect(editor.textContent).toContain('/brainstorming');

    await pressEnter(editor);

    expect(onSubmit).toHaveBeenCalledWith({
      displayText: 'run /brainstorming',
      contentBlocks: [
        { type: 'text', text: 'run ' },
        {
          type: 'skill_mention',
          skillId: 'brainstorming',
          name: 'brainstorming',
          description: 'Design first',
        },
      ],
    });
  });

  it('drops stale async file suggestions after the query is cleared', async () => {
    const deferred = createDeferredValue<
      Array<{
        path: string;
        relativePath: string;
        name: string;
        source: 'workspace';
      }>
    >();
    const searchFiles = vi.fn(() => deferred.promise);
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      workspace: { searchFiles },
      skills: { getAll: vi.fn().mockResolvedValue([]) },
    };

    const { editor } = renderComposer(vi.fn().mockResolvedValue(undefined), {
      isElectron: true,
      workspacePath: '/repo',
    });

    updateEditorText(editor, 'open @chat');
    await act(async () => {
      await Promise.resolve();
    });
    expect(searchFiles).toHaveBeenCalledWith('chat');

    updateEditorText(editor, 'open chat');
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      deferred.resolve([
        {
          path: '/repo/src/renderer/components/ChatView.tsx',
          relativePath: 'src/renderer/components/ChatView.tsx',
          name: 'ChatView.tsx',
          source: 'workspace',
        },
      ]);
      await deferred.promise;
      await Promise.resolve();
    });

    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(container.textContent).not.toContain('@src/renderer/components/ChatView.tsx');
  });

  it('keeps editor focus after mouse-selecting a suggestion', async () => {
    const searchFiles = vi.fn().mockResolvedValue([
      {
        path: '/repo/src/renderer/components/ChatView.tsx',
        relativePath: 'src/renderer/components/ChatView.tsx',
        name: 'ChatView.tsx',
        source: 'workspace',
      },
    ]);
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      workspace: { searchFiles },
      skills: { getAll: vi.fn().mockResolvedValue([]) },
    };

    const { editor } = renderComposer(vi.fn().mockResolvedValue(undefined), {
      isElectron: true,
      workspacePath: '/repo',
    });

    updateEditorText(editor, 'open @chat');
    await act(async () => {
      await Promise.resolve();
    });

    const optionButton = container.querySelector(
      'button[role="option"]'
    ) as HTMLButtonElement | null;
    if (!optionButton) {
      throw new Error('Expected suggestion option button');
    }

    let mouseDownEvent!: MouseEvent;
    await act(async () => {
      mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      optionButton.dispatchEvent(mouseDownEvent);
      if (!mouseDownEvent.defaultPrevented) {
        optionButton.focus();
      }
      optionButton.click();
      await Promise.resolve();
    });

    expect(mouseDownEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor);
    expect(editor.textContent).toContain('@src/renderer/components/ChatView.tsx');
  });
});
