import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import { getInitialSessionTitle } from '../../shared/session-title';
import { RichPromptComposer } from './composer/RichPromptComposer';
import {
  FileText,
  BarChart3,
  FolderOpen,
  ArrowRight,
  Mail,
  BookOpen,
  FileSearch,
} from 'lucide-react';

import welcomeLogoSrc from '../assets/logo.png';

export function WelcomeView() {
  const { t } = useTranslation();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [composerSeed, setComposerSeed] = useState<{ key: number; text: string }>({
    key: 0,
    text: '',
  });
  const { startSession, changeWorkingDir, isElectron } = useIPC();
  const workingDir = useAppStore((state) => state.workingDir);
  const setGlobalNotice = useAppStore((state) => state.setGlobalNotice);
  const isConfigured = useAppStore((state) => state.isConfigured);
  const setShowSettings = useAppStore((state) => state.setShowSettings);
  const setSettingsTab = useAppStore((state) => state.setSettingsTab);

  const handleSelectFolder = async () => {
    try {
      const result = await changeWorkingDir(undefined, workingDir || undefined);
      if (!result.success && result.error && result.error !== 'User cancelled') {
        setGlobalNotice({
          id: `notice-workdir-select-${Date.now()}`,
          type: 'warning',
          message: `${t('welcome.selectWorkingFolderFailed')}: ${result.error}`,
        });
      }
    } catch (error) {
      setGlobalNotice({
        id: `notice-workdir-select-${Date.now()}`,
        type: 'error',
        message:
          error instanceof Error && error.message
            ? `${t('welcome.selectWorkingFolderFailed')}: ${error.message}`
            : t('welcome.selectWorkingFolderFailed'),
      });
    }
  };

  const handleTagClick = (tag: string, tagPrompt: string) => {
    setSelectedTag(tag === selectedTag ? null : tag);
    if (tag !== selectedTag) {
      setComposerSeed({
        key: Date.now(),
        text: tagPrompt,
      });
    }
  };

  const quickTags = [
    {
      id: 'create',
      label: t('welcome.createFile'),
      icon: FileText,
      prompt: t('welcome.quickPromptCreate'),
    },
    {
      id: 'crunch',
      label: t('welcome.crunchData'),
      icon: BarChart3,
      prompt: t('welcome.quickPromptCrunch'),
    },
    {
      id: 'organize',
      label: t('welcome.organizeFiles'),
      icon: FolderOpen,
      prompt: t('welcome.quickPromptOrganize'),
    },
    {
      id: 'email',
      label: t('welcome.checkEmails'),
      icon: Mail,
      prompt: t('welcome.quickPromptEmail'),
      requiresChrome: true,
    },
    {
      id: 'papers',
      label: t('welcome.searchPapers'),
      icon: BookOpen,
      prompt: t('welcome.quickPromptPapers'),
      requiresChrome: true,
    },
    {
      id: 'research-notion',
      label: t('welcome.summarizePapersToNotion'),
      icon: FileSearch,
      prompt: t('welcome.quickPromptNotion'),
      requiresNotion: true,
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 md:px-8 md:py-14">
      <div className="max-w-[840px] w-full space-y-7 animate-fade-in">
        <div className="space-y-4 text-center">
          <div className="flex items-center justify-center gap-4">
            <img
              src={welcomeLogoSrc}
              alt={t('welcome.logoAlt')}
              className="w-16 h-16 md:w-20 md:h-20 rounded-[1.4rem] object-cover border border-border-subtle bg-background/60 shadow-soft"
            />
            <div className="text-left">
              <h1 className="text-[2.35rem] md:text-[3.1rem] leading-none font-semibold tracking-[-0.05em] text-text-primary">
                Open Cowork
              </h1>
            </div>
          </div>
          <p className="heading-serif text-[1.15rem] md:text-[1.45rem] font-medium tracking-[-0.02em] text-text-secondary text-center">
            {t('welcome.title')}
          </p>
        </div>

        {/* API Not Configured Hint */}
        {!isConfigured && (
          <p className="text-sm text-text-muted text-center">
            {t('welcome.apiNotConfigured')}{' '}
            <button
              type="button"
              onClick={() => {
                setSettingsTab('api');
                setShowSettings(true);
              }}
              className="inline-flex items-center gap-1 text-accent hover:text-accent-hover transition-colors"
            >
              {t('welcome.goToSettings')}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </p>
        )}

        {/* Quick Action Tags */}
        <div className="flex flex-wrap gap-2 justify-center px-3">
          {quickTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => handleTagClick(tag.id, tag.prompt)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                selectedTag === tag.id
                  ? 'border-accent/30 bg-accent-muted text-accent'
                  : 'border-border-subtle bg-background/65 text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              } ${
                ('requiresChrome' in tag && tag.requiresChrome) ||
                ('requiresNotion' in tag && tag.requiresNotion)
                  ? 'relative'
                  : ''
              }`}
            >
              <tag.icon
                className={`w-4 h-4 ${selectedTag === tag.id ? 'text-accent' : 'text-text-muted'}`}
              />
              <span>{tag.label}</span>
              {'requiresChrome' in tag && tag.requiresChrome && (
                <span className="ml-1 px-1.5 py-px text-[9px] rounded bg-surface-active text-text-muted">
                  {t('welcome.chromeRequired')}
                </span>
              )}
              {'requiresNotion' in tag && tag.requiresNotion && (
                <span className="ml-1 px-1.5 py-px text-[9px] rounded bg-surface-active text-text-muted">
                  {t('welcome.notionRequired')}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={handleSelectFolder}
              className={`flex items-center gap-2 text-sm transition-colors ${
                workingDir
                  ? 'text-text-secondary hover:text-text-primary'
                  : 'text-accent hover:text-accent-hover'
              }`}
              title={workingDir || t('welcome.selectWorkingFolder')}
            >
              <FolderOpen className="w-4 h-4" />
              <span>
                {workingDir ? workingDir.split(/[/\\]/).pop() : t('welcome.selectWorkingFolder')}
              </span>
            </button>
          </div>

          <RichPromptComposer
            isElectron={isElectron}
            canStop={false}
            placeholder={t('welcome.placeholder')}
            attachFilesTitle={t('welcome.attachFiles')}
            sendTitle={t('welcome.letsGo')}
            stopTitle={t('chat.stop')}
            getPastedImageAlt={(index) => t('welcome.pastedImageAlt', { index: index + 1 })}
            workspacePath={workingDir || undefined}
            seedText={composerSeed.text}
            seedKey={composerSeed.key}
            shellClassName="rounded-[1.9rem] bg-background/85 shadow-soft"
            onImageProcessError={() => {
              setGlobalNotice({
                id: `image-process-failed-${Date.now()}`,
                type: 'warning',
                message: t('chat.imageProcessFailed'),
              });
            }}
            onSubmit={async ({ displayText, contentBlocks }) => {
              if (!workingDir) {
                setGlobalNotice({
                  id: `notice-workspace-required-${Date.now()}`,
                  type: 'warning',
                  message: t('welcome.selectWorkingFolder'),
                });
                return false;
              }

              const firstAttachmentName =
                contentBlocks.find((block) => block.type === 'file_attachment')?.filename ??
                undefined;
              const sessionTitle = getInitialSessionTitle(displayText, firstAttachmentName);
              const session = await startSession(
                sessionTitle,
                { displayText, contentBlocks },
                workingDir || undefined
              );
              if (session) {
                setSelectedTag(null);
                return true;
              }
              return false;
            }}
          />
        </div>
      </div>
    </div>
  );
}
