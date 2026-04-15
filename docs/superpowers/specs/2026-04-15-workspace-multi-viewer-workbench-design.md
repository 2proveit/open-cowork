# Open Cowork 多类型工作台设计

## 1. 背景

当前仓库已经具备基础工作区能力和 Markdown 工作台能力：

- 左侧已有 [`WorkspacePanel`](/Users/lixinlong/Projects/open-cowork/src/renderer/components/WorkspacePanel.tsx)
- 右侧已有仅支持 Markdown 的 [`FileWorkbench`](/Users/lixinlong/Projects/open-cowork/src/renderer/components/FileWorkbench.tsx)
- 主视图仍以 [`ChatView`](/Users/lixinlong/Projects/open-cowork/src/renderer/components/ChatView.tsx) 为中心

这套结构已经能支撑“工作区 + 聊天 + Markdown”这一条主路径，但离目标体验仍有明显差距：

- 中间区域还不是稳定的主工作区
- 文件工作台只支持 Markdown，且状态模型针对单一文本类型设计
- 聊天与当前激活文件没有明确的文件级联动
- 左右侧栏缺少真正的 IDE 风格拉伸与折叠策略

本次设计目标是把现有 Markdown-only workbench 升级成统一的多类型工作台，使 Open Cowork 在交互层接近 Cursor：左侧文件树，中心多标签文件主区，右侧常驻对话，并支持在中心区打开和编辑 Markdown、Excel、代码三类文件。

## 2. 目标

本次设计目标如下：

- 将主界面明确收敛为三栏工作区：左侧文件树，中间主文件区，右侧对话区
- 中间区域成为默认主工作区，未打开文件时显示空状态
- 左右两侧都支持拖拽调宽和折叠
- 中间区域支持多标签打开文件
- 首期支持三类文件：
  - Markdown
  - Excel（`.xlsx`）
  - 常见代码文件
- Markdown 使用普通编辑态与 AI suggestion/diff 态双态工作流
- Excel 使用 Univer 进行渲染和编辑
- 代码文件使用 CodeMirror 进行编辑
- 右侧对话自动关联当前激活 tab，形成文件级联动
- 保存、脏状态、错误提示、工作区切换拦截等逻辑在统一 workbench 内核中管理，而不是分散在不同编辑器中

## 3. 非目标

本次不包含以下内容：

- 不做光标级、选区级上下文联动
- 不实现 Cursor/VS Code 级别的完整 IDE 功能，如 minimap、复杂 diff editor、符号导航、LSP 集成
- 不承诺支持所有文件类型，只覆盖 Markdown、Excel、常见代码文件
- 不实现 Office 全家桶预览与深度编辑
- 不做多人协作、实时协同或评论流
- 不在首期实现复杂文件冲突合并或三方 diff
- 不引入 iframe/webview 容器化编辑器架构

## 4. 已确认的产品约束

以下行为已在需求澄清阶段确认：

- 主布局接近 Cursor，但不是机械复制
- 左侧文件树固定为辅助导航区，可拉伸、可折叠
- 中间区域是主工作区，未打开文件时显示空状态
- 中间区域采用多标签模式
- 右侧为常驻对话区，可拉伸、可折叠
- 首期工作台支持 Markdown、Excel、代码三类文件
- Markdown 采用“双态模式”：
  - 平时普通编辑
  - 只有 AI 产出修改时进入 suggestion/diff 视图
- 右侧聊天与当前激活文件做文件级联动，不做选区级联动
- Excel 首期能力边界为接近在线表格的基础体验：筛选、排序、冻结、基础格式、公式编辑
- 代码编辑器优先使用 CodeMirror
- 架构方向采用“Workbench 内核 + ViewerAdapter”，不走组件内硬编码多分支

## 5. 方案比较与最终选择

### 5.1 方案 A：硬编码多编辑器

做法：

- 在现有 `FileWorkbench` 内按扩展名直接分支
- Markdown 挂 Tiptap
- Excel 挂 Univer
- 代码挂 CodeMirror

优点：

- 起步快
- 改动面看起来较小

问题：

- tab、保存、脏状态、错误处理会散在不同组件
- 后续再加文件类型会持续膨胀
- 聊天上下文提取无法统一

### 5.2 方案 B：Workbench 内核 + ViewerAdapter

做法：

- 引入统一的 workbench 外壳
- workbench 负责布局、tab、保存、脏状态、聊天联动
- 各文件类型通过 adapter 接入

优点：

- 结构清晰
- 后续扩展新文件类型成本可控
- 最符合“中心主工作区 + 右侧聊天 dock”的目标

代价：

- 首期需要多做一层抽象

### 5.3 方案 C：容器化编辑器

做法：

- 用 iframe 或 webview 隔离不同编辑器

优点：

- 理论边界最清晰

问题：

- Electron 中焦点、快捷键、主题同步、通信成本都会上升
- 当前仓库没有现成基础设施

### 5.4 最终选择

本次采用方案 B。

原因：

- 当前仓库已经有 workspace 和 markdown workbench 的基础，不必推倒重来
- 现有状态模型还不够厚，正适合在此时升级为统一 workbench 内核
- 该方案既能满足首期三类文件，也为后续扩展留出稳定接口

## 6. 总体信息架构

主界面调整为 `WorkspaceShell` 编排下的三栏结构。

### 6.1 左栏：WorkspaceSidebar

职责：

- 展示当前工作区名称与切换入口
- 展示文件树
- 展示可折叠的历史会话区
- 高亮当前选中文件与已打开 tab

关键规则：

- 左栏支持拖拽宽度
- 左栏支持折叠
- 左栏折叠后不影响中间当前文件或右侧聊天状态

建议结构：

- `WorkspaceHeader`
- `FileTree`
- `SessionHistorySection`

### 6.2 中栏：WorkbenchCenter

职责：

- 作为默认主工作区
- 管理多标签
- 管理工具栏、空状态、错误状态
- 挂载不同文件类型的 viewer/editor

关键规则：

- 未打开文件时显示空状态
- 中栏始终是默认主区域
- 左右栏折叠后由中栏占据剩余空间

建议结构：

- `WorkbenchTabs`
- `WorkbenchToolbar`
- `WorkbenchViewport`
- `WorkbenchEmptyState`
- `WorkbenchInlineError`

### 6.3 右栏：ChatDock

职责：

- 展示消息流与输入框
- 显示当前关联文件
- 自动读取当前激活 tab 的文件级上下文

关键规则：

- 右栏支持拖拽宽度
- 右栏支持折叠
- 不直接管理文件 UI
- 文件级上下文由 workbench 提供，而不是从编辑器组件内部直接读取

## 7. 组件边界与职责划分

建议新增一个 `WorkspaceShell`，作为三栏布局的唯一编排层。

### 7.1 WorkspaceShell

职责：

- 管理左栏宽度、右栏宽度
- 管理左栏折叠、右栏折叠
- 处理响应式退化
- 组合 `WorkspaceSidebar`、`WorkbenchCenter`、`ChatDock`

不负责：

- 文件内容渲染
- 文件保存逻辑
- 聊天上下文计算

### 7.2 WorkbenchCenter

职责：

- 管理 tabs 与 active tab
- 渲染工具栏和文档视图
- 根据 tab 类型选择 adapter
- 响应统一保存状态

不负责：

- 左右栏布局
- 对话逻辑

### 7.3 ViewerAdapter

职责：

- 为具体文件类型提供加载、渲染、脏状态、保存、上下文提取能力

不负责：

- 布局
- tab 管理
- 全局提示

### 7.4 ChatDock

职责：

- 使用当前激活文件的最小上下文
- 将“当前文件”明确反馈给用户
- 保持现有聊天行为不被工作台逻辑污染

## 8. 文件类型模型与 ViewerAdapter 抽象

建议引入统一文件类型枚举：

- `markdown`
- `spreadsheet`
- `code`

文件类型判定规则：

- `.md` -> `markdown`
- `.xlsx` -> `spreadsheet`
- 常见代码扩展名 -> `code`
- 其他类型 -> 首期不在中间区打开，仅提示不支持

常见代码扩展名建议包括：

- `.ts`
- `.tsx`
- `.js`
- `.jsx`
- `.json`
- `.css`
- `.html`
- `.py`
- `.go`
- `.rs`
- `.java`
- `.sh`

### 8.1 WorkbenchTab

建议 tab 抽象至少包含：

- `id`
- `path`
- `name`
- `kind`
- `workspacePath`
- `editorStateKey`
- `lastOpenedAt`
- `dirty`
- `saving`
- `saveError`
- `lastSavedAt`

### 8.2 ActiveDocumentContext

建议右侧聊天消费的最小文件上下文包含：

- `tabId`
- `path`
- `kind`
- `title`
- `summary`
- `isDirty`

### 8.3 ViewerAdapter 接口

每个 adapter 提供统一能力：

- `load(path) -> runtime`
- `render(runtime) -> ReactNode`
- `getDirtyState(runtime) -> boolean`
- `save(runtime) -> SavePayload`
- `dispose(runtime)`
- `getChatContext(runtime) -> ActiveDocumentContext`

必要时可补充：

- `canAutosave()`
- `supportsSuggestions()`
- `getDisplayTitle()`

## 9. 三类适配器设计

### 9.1 MarkdownAdapter

首期能力：

- 普通编辑态
- suggestion/diff 态
- AI 修改建议接受/拒绝
- 自动保存与手动保存

首期设计：

- 普通态使用 Tiptap 作为富文本 Markdown 编辑器
- 只有 AI 返回建议时进入 `tiptap-diff-suggestions` 模式
- 接受或拒绝建议后文档进入 dirty 状态
- 不让 suggestion 成为常驻模式

### 9.2 SpreadsheetAdapter

首期能力：

- 打开 `.xlsx`
- 多 sheet 切换
- 单元格编辑
- 公式输入与显示
- 筛选
- 排序
- 冻结
- 基础格式
- workbook 级保存

技术方向：

- 使用 Univer 作为 spreadsheet runtime

约束：

- 保存单位为 workbook，而不是 sheet
- 首期不承诺复杂协作能力、宏、批注兼容性

### 9.3 CodeAdapter

首期能力：

- 常见语言高亮
- 行号
- 基础快捷键
- 括号补全
- 缩进
- 自动保存与手动保存

技术方向：

- 使用 CodeMirror 作为默认代码编辑器

约束：

- 首期不实现 IDE 级高级功能
- 语言支持按扩展名映射，避免过度设计

## 10. 状态模型

建议将现有 [`src/renderer/store/index.ts`](/Users/lixinlong/Projects/open-cowork/src/renderer/store/index.ts) 中的工作台状态升级为三层。

### 10.1 WorkbenchShellState

负责 shell 层布局状态：

- `leftPaneWidth`
- `rightPaneWidth`
- `leftPaneCollapsed`
- `rightPaneCollapsed`
- `openTabs`
- `activeTabId`

### 10.2 DocumentRuntimeState

负责每个文档实例的运行态：

- `runtimeByTabId`
- `dirtyByTabId`
- `savingByTabId`
- `saveErrorByTabId`
- `lastSavedAtByTabId`

这里的 runtime 可以是：

- Tiptap editor 实例引用
- Univer workbook runtime 引用
- CodeMirror editor state / view 句柄

必要时只在 store 中保存可序列化 key，将重对象放在组件层或 service 层缓存。

### 10.3 WorkbenchUiState

负责中间工作台 UI 态：

- `emptyState`
- `loadingTabId`
- `inlineErrorByTabId`
- `unsupportedFileNotice`
- `suggestionBannerState`

## 11. 保存策略

保存逻辑必须由统一 workbench 内核调度，而不是每个编辑器各自维护一套。

统一保存流程如下：

1. adapter 报告文档已变更
2. store 标记 tab 为 `dirty`
3. workbench 调度防抖自动保存
4. adapter 产出待写入内容
5. 主进程统一落盘
6. 成功后清理 `dirty`
7. 失败则保留 `dirty` 并记录 `saveError`

### 11.1 Markdown 保存规则

- 默认自动保存
- 保留显式保存按钮
- suggestion 接受/拒绝后进入 dirty

### 11.2 Code 保存规则

- 默认自动保存
- 保留显式保存按钮

### 11.3 Excel 保存规则

- 采用短防抖自动保存
- 避免每次击键直接写盘
- 以 workbook 为统一保存单位

## 12. 聊天联动设计

本次只做文件级联动，不做选区级联动。

### 12.1 联动规则

- 右侧 `ChatDock` 自动读取当前激活 tab
- 发消息时默认附带当前文件的最小上下文
- 聊天头部明确展示当前附带文件

### 12.2 状态切换规则

- 切换 active tab 时，聊天默认上下文跟随切换
- 若关闭的是当前上下文文件，则聊天上下文切到新的 active tab 或清空
- 左右栏折叠与展开不改变聊天上下文

### 12.3 上下文边界

首期上下文只包含：

- 文件路径
- 文件类型
- 当前内容摘要或最近快照
- 是否存在未保存修改

首期不包含：

- 选区
- 光标位置
- 单元格坐标
- 结构化 patch 对位信息

## 13. 关键交互流

### 13.1 打开文件

1. 用户在左侧文件树点击文件
2. 系统按扩展名判定文件类型
3. 若为支持类型，则创建或激活 tab
4. 中间区挂载对应 adapter
5. 右侧聊天上下文更新为当前激活文件

### 13.2 重复打开已打开文件

1. 用户再次点击已打开文件
2. 不新建 tab
3. 切换到已有 tab

### 13.3 关闭文件

1. 若无未保存内容，直接关闭
2. 若存在未保存内容，弹确认
3. 可选择保存后关闭或直接关闭

### 13.4 工作区切换

1. 用户切换工作区
2. 若存在脏文件，弹统一拦截确认
3. 用户可选择继续、取消、或先保存
4. 切换成功后重建文件树与工作台状态

## 14. 异常处理

异常处理采用 workbench 级统一规则。

### 14.1 打开阶段

- 文件打开失败：tab 不创建，弹全局错误提示
- 文件类型不支持：不创建 tab，只给出明确提示
- adapter 初始化失败：中间区显示内联错误态，不让整个 shell 崩溃

### 14.2 保存阶段

- 保存失败：保留 dirty 状态
- 保存失败：记录 `saveError`
- 保存失败：不丢用户内容

### 14.3 外部变更

- Markdown 与代码文件：可先做“文件已在外部变化”的告警
- Excel：首期重点是避免静默覆盖
- 首期不实现复杂 diff 合并

## 15. 响应式与布局规则

布局规则建议明确如下：

- 中栏永远是默认主区域
- 左右栏都有最小宽度限制
- 左右栏都支持折叠按钮
- 折叠后中栏占据剩余空间
- 窗口缩小时优先压缩左右栏，最后才压缩中栏

建议不要让“无 active session”改变三栏结构。即使没有选中会话，中心仍应保持工作台主区逻辑，右侧聊天可显示空会话态或启动提示。

## 16. 对现有代码结构的影响

建议重点调整以下现有部位：

- [`src/renderer/App.tsx`](/Users/lixinlong/Projects/open-cowork/src/renderer/App.tsx)
  - 从“WorkspacePanel + main + FileWorkbench”升级为统一 `WorkspaceShell`
- [`src/renderer/components/WorkspacePanel.tsx`](/Users/lixinlong/Projects/open-cowork/src/renderer/components/WorkspacePanel.tsx)
  - 逐步拆成 `WorkspaceSidebar` 相关子组件
- [`src/renderer/components/FileWorkbench.tsx`](/Users/lixinlong/Projects/open-cowork/src/renderer/components/FileWorkbench.tsx)
  - 从 markdown-only 组件升级为统一 workbench 中心区
- [`src/renderer/store/index.ts`](/Users/lixinlong/Projects/open-cowork/src/renderer/store/index.ts)
  - 从路径到字符串草稿模型升级为 tab + runtime + shell 状态模型
- [`src/renderer/types/index.ts`](/Users/lixinlong/Projects/open-cowork/src/renderer/types/index.ts)
  - 扩展 tab、文档种类、上下文类型

## 17. 测试策略

至少覆盖以下四组测试。

### 17.1 Store / Unit

- tab 生命周期
- active tab 切换
- dirty / saving / saveError 状态流转
- 聊天上下文跟随 active tab

### 17.2 Component

- 三栏折叠与宽度状态
- 中间空状态
- 不同 kind 挂载不同 adapter

### 17.3 Integration

- `.md`
- `.xlsx`
- 常见代码文件

上述三类文件都需覆盖从文件树打开到中间区渲染、保存与关闭的主链路。

### 17.4 Regression

- 现有聊天体验不因三栏改造而回退
- 现有 markdown-only workbench 行为在新架构下仍成立
- 现有工作区切换、未保存拦截能力仍成立

## 18. 风险与取舍

### 18.1 技术风险

- Univer 集成可能带来较高包体积与初始化成本
- Tiptap 与 suggestion 插件需要明确和现有 Markdown 数据格式的转换边界
- CodeMirror 语言包选择若过多，会推高首屏成本

### 18.2 取舍

- 首期优先统一 workbench 内核，而不是追求单个编辑器的极致能力
- 首期只做文件级上下文联动，避免把范围扩大到光标级智能体交互
- 首期不做复杂冲突合并，优先保证不丢数据

## 19. 结论

本次需求应被视为一次“统一工作台重构”，而不是对现有 Markdown workbench 的局部补丁。

最终方案为：

- 使用 `WorkspaceShell` 统一编排三栏
- 使用 `WorkbenchCenter` 作为中心多标签文件主区
- 使用 `ChatDock` 作为右侧常驻对话区
- 使用 `ViewerAdapter` 统一接入：
  - Tiptap / diff suggestions
  - Univer
  - CodeMirror
- 使用统一保存、脏状态、错误处理、聊天上下文模型支撑三类文件

该方案能在不推倒现有 workspace 基础的前提下，把 Open Cowork 的主交互升级为更接近 Cursor 的桌面工作区体验，并为后续增加更多文件类型或更强 AI 联动保留稳定边界。
