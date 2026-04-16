# Open Cowork 工作区 MEMORY 设计

## 1. 背景

当前仓库已经具备两块与本需求直接相关的能力：

- `SessionManager` 负责会话生命周期，删除会话走 `deleteSession(sessionId)`
- `ClaudeAgentRunner` 在新建 agent session 时统一拼装 `appendSystemPrompt`

这意味着本需求天然有两个稳定挂点：

1. 会话被删除时，可以在真正删库前提炼一次会话记忆
2. 新工作区会话启动时，可以把工作区级记忆注入 system prompt

本次需求的目标不是做数据库级长期记忆系统，而是引入一个以工作区根目录 `MEMORY.md` 为真实来源的轻量机制：

- 删除会话时，总结最近一次会话
- 提炼用户习性、偏好、可能正在进行的工作
- 将结果写入当前工作区的 `MEMORY.md`
- 以后每次在带有 `MEMORY.md` 的工作区下启动 cowork 时，把其中内容加载进 system prompt

## 2. 目标

本次设计目标如下：

- 在删除会话时，将该会话的有效文本历史提炼为工作区记忆
- 将工作区记忆持久化为工作区根目录下的 `MEMORY.md`
- 记忆内容同时包含：
  - 稳定的长期画像
  - 用户习性与偏好
  - 可能正在进行的工作
  - 最近若干次会话摘要
- 启动新工作区会话时，将 `MEMORY.md` 内容按预算注入 system prompt
- 自动更新只改系统托管区，人工手写内容必须保留
- 当前版本采用“模型生成”作为默认记忆生成方式，但保留后续切换生成策略的空间

## 3. 非目标

本次不包含以下内容：

- 不在每轮对话结束或进入 idle 时自动更新 `MEMORY.md`
- 不在切换会话、切换 tab、切换工作区时自动归档会话
- 不对已复用中的 agent session 热更新 system prompt
- 不实现数据库优先的 workspace memory 索引
- 不实现多工作区共享记忆
- 不实现记忆质量评估 UI、人工审核 UI 或记忆回放 UI
- 不做模型生成策略以外的规则版或混合版实现，但要为其留接口

## 4. 已确认约束

需求澄清阶段已确认以下行为：

- 只有在“删除会话”时才触发记忆归档
- `MEMORY.md` 采用混合式结构：
  - 有稳定的长期画像
  - 有少量最近会话摘要
- 记忆内容默认由模型生成
- 需要为未来替换生成策略预留边界
- 生成输入范围采用：
  - 完整文本历史
  - 默认排除工具输出、图片二进制、长附件内容
- `MEMORY.md` 允许人工维护内容
- 自动更新只维护固定托管区块，其它内容保留
- system prompt 注入策略采用：
  - 优先尝试注入整个文件
  - 文件过长时优先保留托管区块
  - 再尽量保留手写区块

## 5. 方案比较与最终选择

### 5.1 方案 A：最小侵入直连

做法：

- 在 `SessionManager.deleteSession()` 中直接总结并写 `MEMORY.md`
- 在 `ClaudeAgentRunner` 中直接读取 `MEMORY.md` 并拼 prompt

优点：

- 改动路径短
- 上线快

问题：

- 记忆文件解析、模型生成、Markdown 渲染、prompt 裁剪逻辑会分散在多个类里
- 以后切换规则生成器或修改文件格式时，耦合面会扩散

### 5.2 方案 B：独立 `WorkspaceMemoryService`

做法：

- 新增独立工作区记忆服务
- `SessionManager` 只负责在删除会话前调用“归档”
- `ClaudeAgentRunner` 只负责在新建 session 时调用“构造 prompt memory”
- 记忆文件解析、托管区更新、模型生成、长度裁剪都集中在服务内

优点：

- 边界清晰
- 后续替换生成策略成本低
- 更容易写单测

代价：

- 首期多引入一层抽象和几个辅助模块

### 5.3 方案 C：数据库为主，文件为镜像

做法：

- 先把 workspace memory 结构化存数据库
- 再同步渲染为 `MEMORY.md`
- prompt 注入优先读数据库

优点：

- 理论上更利于后续检索和统计

问题：

- 超出本次范围
- 与“工作区中的 `MEMORY.md` 是真实来源”的目标不一致

### 5.4 最终选择

本次采用方案 B：独立 `WorkspaceMemoryService`。

原因：

- 满足当前“删除会话写入工作区文件”和“启动时加载工作区文件”这两个明确挂点
- 能把模型生成策略、Markdown 托管格式、system prompt 裁剪策略集中管理
- 后续从“模型生成”切到“规则版”或“混合版”时，不需要改动 `SessionManager` 和 `ClaudeAgentRunner`

## 6. 总体架构

建议新增一条工作区记忆调用链：

1. `SessionManager.deleteSession(sessionId)`
2. `WorkspaceMemoryService.archiveSessionToMemory(...)`
3. `MemoryGenerator.generate(...)`
4. `WorkspaceMemoryService` 合并、渲染并写回 `MEMORY.md`

以及一条启动注入链：

1. `ClaudeAgentRunner` 在创建新的 `DefaultResourceLoader` 之前拿到 `effectiveCwd`
2. 调用 `WorkspaceMemoryService.buildPromptMemory(effectiveCwd)`
3. 将返回结果拼进现有 `coworkAppendPrompt`

该设计的关键原则是：

- `MEMORY.md` 是工作区级记忆文件
- `WorkspaceMemoryService` 是唯一入口
- 模型只生成结构化托管记忆对象，不直接改整份 Markdown
- 手写区永远不是模型直写目标

## 7. 模块边界

### 7.1 `WorkspaceMemoryService`

这是唯一的工作区记忆入口，负责四类职责：

1. `ensureMemoryFile(workspacePath)`
   - 确保工作区根目录存在 `MEMORY.md`
   - 文件不存在时创建最小骨架

2. `archiveSessionToMemory({ session, messages })`
   - 在删除会话前执行
   - 读取当前 `MEMORY.md`
   - 解析托管区与手写区
   - 生成新的托管记忆对象
   - 重写托管区并写回文件

3. `buildPromptMemory(workspacePath)`
   - 在新工作区会话创建时执行
   - 读取 `MEMORY.md`
   - 进行长度预算裁剪
   - 输出适合拼入 system prompt 的文本

4. 内部纯函数层
   - `parseManagedMemory(markdown)`
   - `renderManagedMemory(parsed)`
   - `trimMemoryForPrompt(...)`
   - `extractSessionMemoryInput(messages)`

### 7.2 `MemoryGenerator`

定义一层极薄接口，例如：

```ts
interface MemoryGenerator {
  generate(input: WorkspaceMemoryGenerationInput): Promise<ManagedMemoryPatch>;
}
```

当前默认实现由模型驱动，后续可以替换为：

- 规则生成器
- 规则 + 模型混合生成器
- 离线批处理生成器

`WorkspaceMemoryService` 只依赖接口，不依赖具体生成策略。

### 7.3 `SessionManager`

职责调整：

- 保持现有删除会话行为不变
- 在真正删库前，如果该会话存在明确 `cwd`，则调用 `WorkspaceMemoryService.archiveSessionToMemory(...)`

约束：

- 归档失败只记录日志，不阻塞删会话
- 无 `cwd` 的会话跳过归档

### 7.4 `ClaudeAgentRunner`

职责调整：

- 仅在创建新的 pi agent session 时调用 `buildPromptMemory(effectiveCwd)`
- 将结果作为附加上下文拼入 `coworkAppendPrompt`

约束：

- 已复用的 agent session 不热更新 system prompt
- 没有 `MEMORY.md` 时保持当前行为

## 8. `MEMORY.md` 文件结构

`MEMORY.md` 采用“自由手写区 + 系统托管区块”的单文件结构。

建议最小骨架如下：

```md
# MEMORY

## Manual Notes
这里是人工维护内容。
系统不会改这一段。

<!-- COWORK:MANAGED:START -->
## Workspace Memory

### User Profile

### Habits And Preferences

### Active Workstreams

### Recent Session Summaries
<!-- COWORK:MANAGED:END -->
```

### 8.1 结构规则

- `Manual Notes` 作为人工区，系统永不改写
- `COWORK:MANAGED` 区块是系统唯一可写区
- 文件不存在时创建最小骨架
- 文件存在但没有托管区块时，只追加托管区块，不动原文
- 托管区块标记损坏时，写回拒绝覆盖原文件

### 8.2 托管区块的内容结构

托管区块中包含四个固定部分：

1. `User Profile`
   - 稳定、低频变化的信息
   - 例如常见角色、工作方式、常处理任务类型

2. `Habits And Preferences`
   - 与协作行为直接相关的偏好
   - 例如语言偏好、回答风格偏好、执行倾向、测试或改动偏好

3. `Active Workstreams`
   - 对“用户最近可能正在推进什么工作”的保守推断
   - 语气必须保守，使用“可能”“近期似乎”等表述

4. `Recent Session Summaries`
   - 最近若干次会话摘要
   - 每条摘要短小，只记录后续协作真正需要的上下文

### 8.3 最近会话数量

最近会话摘要采用滑动窗口，默认只保留最近 `5` 条。

原因：

- 避免文件无限膨胀
- 让 prompt 注入更稳定
- 保留近期脉络即可，不追求完整历史

## 9. 删除会话时的归档流程

### 9.1 总体流程

删除会话时执行以下五步：

1. 收集输入
2. 提纯会话上下文
3. 调用模型生成托管记忆补丁
4. 合并更新托管记忆
5. 安全写回 `MEMORY.md`

### 9.2 收集输入

在 `SessionManager.deleteSession(sessionId)` 真正删库前，获取：

- `session`
- 当前会话全部消息
- 当前工作区已有 `MEMORY.md`

若 `session.cwd` 为空，则跳过归档。

### 9.3 提纯会话上下文

输入模型的会话上下文采用文本提纯版本：

- 保留 `user` / `assistant` 的文本块
- 保留与结果密切相关的少量文本化工具结论，但不保留原始大段工具输出
- 排除 `tool_result` 原始内容
- 排除图片二进制
- 排除文件 base64
- 排除长附件原文

目标是让模型看到：

- 这轮会话主要在推进什么
- 用户如何表达需求
- 用户在协作中体现了哪些稳定偏好
- 当前工作推进到了哪里

而不是让模型看到大量执行噪声。

### 9.4 超长会话处理

对单次会话输入设置预算。

建议策略：

- 优先保留最近若干轮文本
- 对更早的部分只保留简短说明，例如“更早还有若干轮围绕同一主题的讨论”

目的是控制删除大长会话时的成本和失败面。

### 9.5 模型生成输入

模型输入由三部分组成：

1. 现有托管记忆
2. 当前会话精简文本
3. 硬性输出约束

硬性约束包括：

- 用保守语气表达推断
- 只提炼对后续协作有帮助的信息
- 避免重复已有长期画像
- 最近会话摘要保持短小
- 不写入工具噪声、密钥、路径噪声、临时报错细节
- 输出结构化托管记忆对象，而不是整份 Markdown

### 9.6 模型输出形态

模型输出的是结构化对象，例如：

```ts
interface ManagedMemoryPatch {
  userProfile: string[];
  habitsAndPreferences: string[];
  activeWorkstreams: string[];
  recentSessionSummary: {
    title?: string;
    summary: string;
    signals?: string[];
    timestamp: string;
  };
}
```

服务端负责将该结果合并到现有托管记忆中。

### 9.7 合并规则

合并阶段由服务端完成，不交给模型：

- `userProfile`：按语义接近程度去重
- `habitsAndPreferences`：按语义接近程度去重
- `activeWorkstreams`：允许更新，但需保守措辞
- `recentSessionSummaries`：将本次新摘要插入顶部
- `recentSessionSummaries`：仅保留最近 `5` 条
- 手写区完全不变

### 9.8 安全写回

重新渲染完整 `MEMORY.md` 后一次性写回。

写回失败时：

- 记录日志
- 跳过本次归档
- 继续删除会话

归档失败不能阻塞主流程。

## 10. 启动时注入 system prompt 的策略

### 10.1 注入时机

只在创建新的 pi agent session 时注入。

原因：

- 当前 `appendSystemPrompt` 只在 session 创建时稳定生效
- 已复用 session 的 system prompt 不应在中途被热更新
- 这与“启动 cowork 时加载工作区记忆”的需求一致

### 10.2 注入流程

`ClaudeAgentRunner` 在创建 `DefaultResourceLoader` 之前：

1. 拿到当前 `effectiveCwd`
2. 调用 `WorkspaceMemoryService.buildPromptMemory(effectiveCwd)`
3. 得到裁剪后的记忆文本
4. 将其作为单独段落拼入 `coworkAppendPrompt`

建议使用独立标签包装：

```txt
<workspace_memory>
The following memory was loaded from MEMORY.md in the current workspace.
Treat it as contextual guidance, not absolute truth. More recent user instructions override it.

...memory content...
</workspace_memory>
```

### 10.3 为什么需要包装标签

这样做有三个作用：

- 让模型把它识别为工作区长期记忆，而不是本轮用户新指令
- 强化“记忆是辅助上下文，不是绝对真相”的定位
- 为后续注入更多工作区级上下文来源保留清晰边界

### 10.4 长度控制

采用双层预算：

1. 文件读取预算
   - 例如最多读取 `24 KB`
   - 防止极端大文件带来不必要 IO 和 prompt 压力

2. prompt 注入预算
   - 例如最终注入 `6k-8k chars`
   - 具体常量可后续按模型能力微调

### 10.5 裁剪顺序

若超出预算，按以下优先级裁剪：

1. 优先保留托管区完整内容
2. 再尽量保留手写区前部
3. 若仍过长，优先裁掉较老的最近会话摘要
4. 最后再做硬截断并附加 `[truncated]`

### 10.6 失败策略

- `MEMORY.md` 不存在：不报错，不注入
- 文件读取失败：记录日志，不阻塞会话
- 托管区解析失败：
  - prompt 注入时退回“全文原样 + 长度截断”
  - 写回时拒绝覆盖原文件

## 11. 错误处理与鲁棒性

### 11.1 归档阶段

- 模型超时：本次归档失败，继续删会话
- 模型返回结构非法：本次归档失败，继续删会话
- 文件写入失败：本次归档失败，继续删会话
- 托管区损坏：拒绝覆盖，继续删会话

### 11.2 启动注入阶段

- 文件不存在：直接跳过
- 文件读取失败：直接跳过
- 托管区解析失败：退回全文截断模式

### 11.3 日志原则

应记录：

- 归档是否触发
- 跳过原因
- 文件读取与写入失败
- 模型生成失败或超时
- prompt memory 是否注入、是否触发裁剪

不应记录：

- 整份 `MEMORY.md` 原文
- 用户完整敏感对话原文

## 12. 测试策略

### 12.1 `WorkspaceMemoryService` 单测

覆盖以下场景：

- `MEMORY.md` 不存在时创建最小骨架
- 文件只有手写内容、没有托管区时能追加托管区
- 有托管区时只重写托管区
- 手写区在更新后保持不变
- 托管区损坏时拒绝覆盖
- `buildPromptMemory()` 在超长场景下按“托管区优先、手写区其次”裁剪

### 12.2 `SessionManager.deleteSession()` 集成测试

覆盖以下场景：

- 删除带 `cwd` 的会话时会先触发归档
- 归档失败不阻塞删会话
- 删除无 `cwd` 的会话时跳过归档
- 原有删会话的数据库清理和缓存清理行为不回归

### 12.3 `ClaudeAgentRunner` 注入测试

覆盖以下场景：

- 新建 agent session 时会把 `MEMORY.md` 注入 `appendSystemPrompt`
- 没有 `MEMORY.md` 时保持现状
- 已复用 session 时不热更新 prompt
- 注入文本包含 `<workspace_memory>` 包裹和“新指令优先于记忆”的说明

### 12.4 生成器协议测试

不测试模型内容质量本身，而测试协议稳健性：

- 输入精简后的会话文本是否符合预期
- 输出缺字段时是否安全降级
- 模型报错、超时、返回非法 JSON 时是否安全失败

## 13. 验收标准

满足以下条件即可认为本次设计落地达标：

- 删除一个带工作区的会话后，工作区根目录出现或更新 `MEMORY.md`
- 自动更新不会覆盖手写区
- 托管区会包含：
  - 长期画像
  - 习性与偏好
  - 可能进行中的工作
  - 最近会话摘要
- 新开该工作区下的会话时，system prompt 会加载 `MEMORY.md`
- `MEMORY.md` 很长时，注入文本会裁剪，但优先保留托管区
- 归档失败、文件读取失败、托管区解析失败都不会导致删会话失败或会话启动失败

## 14. 实施建议

建议按以下顺序实现：

1. 先落 `WorkspaceMemoryService` 的文件解析与渲染能力
2. 再接入 `SessionManager.deleteSession()` 的归档调用
3. 再接入 `ClaudeAgentRunner` 的 prompt 注入
4. 最后补齐生成器协议测试和边界失败测试

这样可以先把文件托管和边界稳定住，再接模型和运行时路径。

## 15. 结论

本方案将工作区记忆明确收敛到 `MEMORY.md`，并通过独立 `WorkspaceMemoryService` 连接“删除会话归档”和“新会话启动注入”两条链路。

它满足当前需求的同时，保留了三种后续扩展空间：

- 切换记忆生成策略
- 调整托管区格式
- 扩展更多工作区级 prompt 来源

在不引入数据库中心化 memory 系统的前提下，这已经是与当前仓库结构最匹配、风险最低、可演进性最好的方案。
