# Rich Prompt Composer Design

- Date: 2026-04-15
- Status: Approved in conversation, pending user review of written spec
- Scope: Add Cursor-style `@` file mention, `/` skill mention, and keyboard-first selection to the chat composer

## Problem

The current message composer in [src/renderer/components/ChatView.tsx](/Users/lixinlong/Projects/feat-at/src/renderer/components/ChatView.tsx) and [src/renderer/components/WelcomeView.tsx](/Users/lixinlong/Projects/feat-at/src/renderer/components/WelcomeView.tsx) is based on a plain `textarea` plus separate file attachment handling. That model is sufficient for free-form text, pasted images, and manual file selection, but it cannot support:

- inline file mentions triggered by `@`
- inline skill mentions triggered by `/`
- chip-style structured tokens mixed with normal text
- `Tab` and `Enter` driven candidate acceptance while the suggestion panel is open
- stable deletion and history rendering of atomic mentions

Trying to extend the existing `textarea` with overlays would create persistent complexity around selection, cursor mapping, IME composition, and chip deletion. The requirement is large enough to justify a dedicated rich composer model.

## Goals

- Support `@` to search and select workspace files from the current workspace.
- Support `/` to search and select skills from the installed skill list.
- Render selected files and skills as inline chips inside the composer.
- Use keyboard-first interaction:
  - `Up` and `Down` move the highlighted candidate
  - `Tab` accepts the highlighted candidate
  - `Enter` accepts the highlighted candidate while suggestions are open
  - `Shift+Enter` inserts a newline
  - `Enter` submits only when the suggestion panel is closed
- Preserve structured mention data through submission, persistence, and message rendering.
- Reuse the same composer in chat and welcome entry points.

## Non-Goals

- No file content preview in the suggestion panel for the first version.
- No automatic insertion of file ranges or symbol-level references in the first version.
- No support for arbitrary rich text formatting beyond mention chips and line breaks.
- No adoption of a heavyweight editor framework such as Lexical, Slate, or ProseMirror in this phase.

## User Decisions Captured

- File selection via `@` must both display a visible mention and send real structured file context.
- Skill selection via `/` must create a structured mention with metadata, not only plain text.
- File candidates should search across the full workspace, with ranking rather than a narrow recent-only source.
- When the suggestion panel is open:
  - `Up` and `Down` move highlight
  - `Tab` accepts
  - `Enter` also accepts
- Selected mentions should render as inline chips, not plain text.

## Recommended Approach

Build a shared `RichPromptComposer` using a controlled `contentEditable` surface backed by a lightweight internal document model. The document model, not the DOM, is the source of truth for text, line breaks, and mention chips. Candidate lookup is delegated to specialized providers for workspace files and skills. Submission serializes the document into:

- displayable message text for human-readable history
- structured `ContentBlock[]` payload for the current message pipeline
- backend-expanded prompt and attachment information at send time

This approach fits the current Electron and React architecture, preserves existing attachment and session flows, and avoids introducing a large editor dependency for a narrowly scoped composer problem.

## Alternatives Considered

### 1. Recommended: custom rich composer with `contentEditable`

Pros:

- Matches the requested Cursor-style inline chip interaction.
- Keeps the editing surface local to this feature.
- Allows precise control over submission serialization and keyboard behavior.
- Reusable across chat and welcome flows.

Cons:

- Requires careful handling of selection, DOM sync, and IME behavior.
- Introduces a new document model that must stay in sync with rendering.

### 2. Rejected: keep `textarea` and fake chips with an overlay

Pros:

- Appears cheaper initially.

Cons:

- Fragile cursor and selection behavior.
- High risk around line wrapping, IME, click selection, and chip deletion.
- Two overlapping sources of truth: raw text and visual overlay metadata.

### 3. Rejected for now: adopt a third-party editor framework

Pros:

- Mature abstractions for rich editing.

Cons:

- Integration cost is too high for the current scope.
- Adds a broad dependency surface for a focused composer need.
- Would slow delivery before the product value is validated.

## Architecture

### Component Structure

Introduce a shared composer component, tentatively under `src/renderer/components/composer/`, with this split:

- `RichPromptComposer`
  - top-level shared composer used by chat and welcome views
  - renders the editable surface, attachments, chips, suggestion panel, and submit controls
- `ComposerEditor`
  - owns the `contentEditable` surface and caret interactions
- `ComposerSuggestionPanel`
  - renders ranked candidates and highlighted selection
- `ComposerChip`
  - renders file and skill mention chips consistently
- `composer-model.ts`
  - lightweight document model and helper transforms
- `composer-mentions.ts`
  - token detection, query extraction, and candidate selection logic
- `composer-serialize.ts`
  - submission serialization to display text and `ContentBlock[]`

`ChatView` and `WelcomeView` should both consume the shared composer rather than maintaining separate text, attachment, and submission logic.

### Document Model

The internal document model should represent the editable message as ordered segments:

- `text`
- `file_mention`
- `skill_mention`
- `line_break`

Each mention segment is atomic. The user can navigate across it, select it as a unit, and delete it as a unit. The model must support:

- DOM rendering into inline text and chips
- reverse lookup from caret position to segment index
- deterministic serialization into message blocks
- stable recovery after candidate acceptance or deletion

This avoids treating the raw DOM tree as the authoritative state.

### Candidate Providers

Two providers are required:

- `workspace file provider`
  - returns all searchable workspace files for the current working directory
  - ranks results by exact prefix match, file name match, path fragment match, recent use, recent modification, and open-tab status
- `skill provider`
  - loads available skills from `window.electronAPI.skills.getAll()`
  - filters to enabled or otherwise selectable skills
  - ranks by exact prefix, name match, then description match

These providers are independent from the editor DOM and operate on plain query text.

## Data Model and Message Protocol

### New Content Blocks

Extend `ContentBlock` in [src/renderer/types/index.ts](/Users/lixinlong/Projects/feat-at/src/renderer/types/index.ts) with:

- `file_mention`
  - `path`
  - `name`
  - `workspacePath`
  - `source` (`workspace`, `recent`, or `open_tab`)
  - optional `line`
  - optional `column`
- `skill_mention`
  - `skillId`
  - `name`
  - optional `description`
  - optional `path`

These blocks represent explicit user intent and must not be reduced to plain text before message persistence.

### Submission Outputs

Composer submission produces three useful forms:

1. Display text
   - human-readable text form for message readability
   - example: `请查看 @src/renderer/components/ChatView.tsx 并使用 /brainstorming`
2. Rich message blocks
   - ordered `ContentBlock[]` with text, mentions, attachments, images, and line breaks represented structurally
3. Backend-expanded message inputs
   - generated in the main process from the structured blocks before dispatching to the agent

The backend expansion step should remain outside the composer so the UI only owns user intent, not agent-specific prompt construction.

### Main Process Expansion

Add a preprocessing stage in [src/main/session/session-manager.ts](/Users/lixinlong/Projects/feat-at/src/main/session/session-manager.ts) before or alongside `processFileAttachments()`:

- normalize incoming blocks
- expand `file_mention` into agent-usable file context
- expand `skill_mention` into agent-usable skill activation context
- preserve the original mention blocks in the saved user message for history rendering

`file_mention` expansion should reuse existing file attachment pathways where practical. `skill_mention` expansion should inject the selected skill by identifier or path at send time. The message block must only persist metadata, not an inlined copy of `SKILL.md`.

## Interaction Design

### Trigger Rules

Suggestions open only when `@` or `/` appears at a token boundary:

- start of line
- after whitespace
- after a line break

This avoids false triggers for email addresses, shell fragments, or ordinary path text.

### Suggestion Panel

When active, the suggestion panel shows up to 8 to 10 ranked results with:

- icon
- primary label
- secondary context text

Display guidance:

- files: base name plus relative path
- skills: name plus short description

The panel should initially be anchored to the composer in a stable position. If caret-anchored positioning proves robust later, it can be added as an enhancement rather than a launch dependency.

### Keyboard Behavior

When the suggestion panel is open:

- `ArrowUp` and `ArrowDown` move the highlighted item
- `Tab` accepts the highlighted item
- `Enter` accepts the highlighted item
- `Escape` closes the panel
- `Shift+Enter` inserts a newline

When the suggestion panel is closed:

- `Enter` submits
- `Shift+Enter` inserts a newline

IME composition must continue to suppress submit and candidate acceptance until composition ends.

### Chip Behavior

Accepted mentions render as inline chips.

Required chip behavior:

- visually distinct from plain text
- included inline with normal text flow
- focusable as an atomic unit
- removable as an atomic unit with `Backspace` or `Delete`
- traversable with left and right arrow navigation

### Duplicate Handling

The editor may visually contain repeated mentions, but serialization should de-duplicate generated structured payloads where appropriate:

- same file path -> one structured file mention or one backend file attachment unit
- same skill ID -> one structured skill mention

Display order remains user-authored; deduplication is applied at serialization or backend expansion, not by silently rewriting what the user sees while typing.

### No-Result and Fallback Behavior

- If there are no candidates, show an empty suggestion state and continue allowing plain input.
- If the user types `@foo` or `/bar` but never selects a candidate, it remains plain text.
- The system must never infer a structured mention from an unconfirmed token.

## Performance Strategy

### Workspace Files

Do not rescan the filesystem on every keystroke.

Instead:

- expose a workspace file index from the main process
- rebuild or invalidate it when the working directory changes
- enrich it with recent files and open-tab signals
- filter in memory on the renderer side while typing
- debounce query filtering only if needed, around 100 to 150 ms for large workspaces

This preserves responsive typing in large repositories.

### Skills

- load skills lazily on first `/` trigger or initial composer mount
- cache the results in the renderer
- refresh only when skill storage changes or settings operations invalidate the cache

## Error Handling

- If the workspace file index fails to load, the `@` provider should surface a non-blocking error and allow normal text entry.
- If the skill list fails to load, the `/` provider should surface a non-blocking error and allow normal text entry.
- If mention expansion fails in the main process, the message should not be silently corrupted. The user should receive an explicit error via existing renderer notice or message error flows.
- If a selected file no longer exists by send time, the backend should fail that mention expansion explicitly rather than pretending it succeeded.

## Message Rendering

Extend [src/renderer/components/message/ContentBlockView.tsx](/Users/lixinlong/Projects/feat-at/src/renderer/components/message/ContentBlockView.tsx) so persisted messages can display:

- file mention chips
- skill mention chips

Backward compatibility rules:

- old messages without mention blocks continue to render as they do now
- new messages retain original mention blocks for history, even if the backend also expands them into attachments or prompt instructions

## Testing Strategy

### Renderer Tests

Add focused tests for:

- opening the suggestion panel on valid trigger boundaries
- not opening on invalid trigger boundaries
- ranking and filtering file candidates
- ranking and filtering skill candidates
- `Tab`, `Enter`, `Escape`, `ArrowUp`, and `ArrowDown` behavior
- chip insertion and atomic deletion
- IME composition safety
- `Enter` submit only when no panel is active

### Serialization Tests

Add tests for:

- converting document segments into ordered `ContentBlock[]`
- preserving display text readability
- deduplicating repeated mentions in the serialized structured payload
- leaving unmatched `@foo` or `/bar` as plain text

### Main Process Tests

Add tests for:

- expanding `file_mention` into attachment or prompt-ready file context
- expanding `skill_mention` into skill activation context
- preserving original mention blocks in saved messages
- handling deleted files or invalid skill references cleanly

### Regression Coverage

Protect existing behaviors:

- pasted images still work
- manual file attachments still work
- welcome view can still start a session
- chat view can still continue a session

## Rollout Plan

Implement in small stages:

1. Extract a shared composer shell used by chat and welcome views.
2. Add the internal document model and base `contentEditable` editing surface.
3. Add `@` file mention support end to end.
4. Add `/` skill mention support end to end.
5. Add persisted message rendering for mention blocks.
6. Refine ranking, empty states, deduplication, and keyboard polish.

Each stage should be independently testable and should avoid changing unrelated message, session, or sandbox behavior.

## Open Decisions Resolved in This Spec

- Use a custom `contentEditable`-based composer rather than extending the current `textarea`.
- Represent mentions as structured blocks, not embedded magic text.
- Keep backend expansion in the main process instead of pushing agent-specific knowledge into the renderer.
- Treat chip mentions as atomic units in the editor and in message history.

## Acceptance Criteria

The feature is considered correctly designed when the final implementation can satisfy all of the following:

- A user can type `@` and select a workspace file with keyboard-only input.
- A user can type `/` and select a skill with keyboard-only input.
- Selected files and skills render as inline chips in the composer.
- While suggestions are open, `Tab` and `Enter` accept the highlighted candidate instead of sending the message.
- Submitted messages retain structured mention blocks in history.
- The main process can expand those blocks into agent-usable file and skill context without losing the original display intent.
- Chat and welcome entry points both use the shared composer.
