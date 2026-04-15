import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/main/config/config-store';

const mocks = vi.hoisted(() => ({
  generateTextWithClaudeSdk: vi.fn(),
}));

vi.mock('../src/main/claude/claude-sdk-one-shot', () => ({
  generateTextWithClaudeSdk: mocks.generateTextWithClaudeSdk,
}));

import { createModelBackedWorkspaceMemoryGenerator } from '../src/main/memory/workspace-memory-generator';

const config: AppConfig = {
  provider: 'openai',
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com/v1',
  customProtocol: 'openai',
  model: 'gpt-5.4',
  activeProfileKey: 'default',
  profiles: {},
  activeConfigSetId: 'default',
  configSets: [],
  claudeCodePath: '',
  defaultWorkdir: '',
  globalSkillsPath: '',
  enableDevLogs: true,
  sandboxEnabled: true,
};

describe('model-backed workspace memory generator', () => {
  it('calls one-shot helper with memory context, strengthened system prompt, and config', async () => {
    mocks.generateTextWithClaudeSdk.mockResolvedValue(
      JSON.stringify({
        userProfile: ['Prefers concise answers.'],
        habitsAndPreferences: ['直接进入实现。'],
        activeWorkstreams: ['可能正在接入工作区 MEMORY 功能。'],
        recentSessionSummary: {
          timestamp: '2026-04-15 18:18',
          title: '接入 MEMORY',
          summary: '定义了托管区块和注入策略。',
          signals: ['删除会话归档'],
        },
      })
    );

    const generator = createModelBackedWorkspaceMemoryGenerator(() => config);
    await generator.generate({
      existingManaged: {
        userProfile: [],
        habitsAndPreferences: [],
        activeWorkstreams: [],
        recentSessionSummaries: [],
      },
      sessionTurns: [{ role: 'user', text: '请在删除会话时写入 MEMORY.md' }],
    });

    expect(mocks.generateTextWithClaudeSdk).toHaveBeenCalledTimes(1);
    const [prompt, systemPrompt, passedConfig] = mocks.generateTextWithClaudeSdk.mock.calls[0];
    expect(prompt).toContain('existingManaged:');
    expect(prompt).toContain('sessionTurns:');
    expect(systemPrompt).toContain('保守');
    expect(systemPrompt).toContain('只输出 JSON');
    expect(systemPrompt).toContain('不要包含密钥');
    expect(systemPrompt).toContain('不要包含原始工具输出');
    expect(systemPrompt).toContain('协作');
    expect(passedConfig).toBe(config);
  });

  it('returns structured JSON content from the one-shot helper', async () => {
    mocks.generateTextWithClaudeSdk.mockResolvedValue(
      JSON.stringify({
        userProfile: ['Prefers concise answers.'],
        habitsAndPreferences: ['直接进入实现。'],
        activeWorkstreams: ['可能正在接入工作区 MEMORY 功能。'],
        recentSessionSummary: {
          timestamp: '2026-04-15 18:18',
          title: '接入 MEMORY',
          summary: '定义了托管区块和注入策略。',
          signals: ['删除会话归档'],
        },
      })
    );

    const generator = createModelBackedWorkspaceMemoryGenerator(() => config);
    const result = await generator.generate({
      existingManaged: {
        userProfile: [],
        habitsAndPreferences: [],
        activeWorkstreams: [],
        recentSessionSummaries: [],
      },
      sessionTurns: [{ role: 'user', text: '请在删除会话时写入 MEMORY.md' }],
    });

    expect(result.userProfile).toEqual(['Prefers concise answers.']);
    expect(result.recentSessionSummary.summary).toContain('托管区块');
  });

  it('throws when the helper returns invalid JSON', async () => {
    mocks.generateTextWithClaudeSdk.mockResolvedValue('not-json');
    const generator = createModelBackedWorkspaceMemoryGenerator(() => config);
    await expect(
      generator.generate({
        existingManaged: {
          userProfile: [],
          habitsAndPreferences: [],
          activeWorkstreams: [],
          recentSessionSummaries: [],
        },
        sessionTurns: [{ role: 'user', text: 'bad payload' }],
      })
    ).rejects.toThrow('Invalid workspace memory payload');
  });

  it('throws when the helper returns an empty payload', async () => {
    const generator = createModelBackedWorkspaceMemoryGenerator(() => config);

    mocks.generateTextWithClaudeSdk.mockResolvedValue(null);
    await expect(
      generator.generate({
        existingManaged: {
          userProfile: [],
          habitsAndPreferences: [],
          activeWorkstreams: [],
          recentSessionSummaries: [],
        },
        sessionTurns: [{ role: 'user', text: 'bad payload' }],
      })
    ).rejects.toThrow('Empty workspace memory payload');

    mocks.generateTextWithClaudeSdk.mockResolvedValue('');
    await expect(
      generator.generate({
        existingManaged: {
          userProfile: [],
          habitsAndPreferences: [],
          activeWorkstreams: [],
          recentSessionSummaries: [],
        },
        sessionTurns: [{ role: 'user', text: 'bad payload' }],
      })
    ).rejects.toThrow('Empty workspace memory payload');
  });
});
