# Gemini Ultra CLI 安装与分发

需要 Node.js
**22.19 或更新版本**；推荐当前 LTS。运行时使用 Node 内置 SQLite，因此不支持 Node
20。Windows、Linux、macOS 均通过同一个 npm 包分发；完整终端能力按系统选择可选 PTY 依赖。

## 安装发布包

当前预览源码在
[codex/ultra-agent-portable 分支](https://github.com/emstudio010-hub/gemini-ultra-cli/tree/codex/ultra-agent-portable)。[GitHub三平台构建](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/workflows/ultra-package.yml?query=branch%3Acodex%2Fultra-agent-portable)提供对应系统的Artifact，下载并解压后得到tgz和.sha256文件。已验证的runner为Windows
x64、Linux x64和macOS arm64，Node
v24.22.2；校验场景使用本地模型fixture，真实逆向工具需另行配置。

取得维护者提供的 `gemini-ultra-cli-*.tgz`（发布后也可从此项目 GitHub
Release 下载），执行：

```sh
npm install -g ./gemini-ultra-cli-1.0.0-preview.26.tgz
gemini-ultra --version
gemini-ultra
```

`gemini-ultra-cli`
是同一个入口的别名。安装时不需要源码仓库、开发机盘符或 Obsidian。用
`npm uninstall -g gemini-ultra-cli` 卸载。配置存放在当前用户的
`~/.gemini`，不会随安装包分发。

## 首次使用

输入框可能先于命令发现完成显示。启动期输入的斜杠命令会等待本地命令表就绪再处理；不会因暂时未找到命令而把
`/effort`、`/language` 等输入发给模型。

1. `/language` 选择中文或英文；也可 `/language 中文`、`/language 英文`。
2. 首次启动选择「配置外接供应商」即可录入端点与密钥，无需先登录 Google。进入会话后也可使用
   `/provider`
   管理。支持抓取模型列表或手动填写模型名称；兼容 Chat、Responses、Anthropic 和 Gemini。Google 原生登录仍可单独选择。
3. `/effort` 选择六档推理强度；`/team auto` 自动决定协作，`/team team 3`
   使用最多三个并发任务，`/team single` 串行执行。
4. `/drill setup` 检查本机逆向环境。`binary_triage`
   的静态初筛不依赖 IDA 或 Ghidra。深入反编译需要用户安装至少一种对应工具。
5. `/drill` 或 `/演练台`
   打开本地控制中心，管理提示词、规则、模型与协作状态。`/drill stop` 关闭。

## 可选输出上限

进入 /provider，选择「输出上限」即可按供应商设置正整数 Token 数。留空恢复现有默认行为；任务自己指定的上限优先。可用范围依模型和供应商而定，此设置不代表该供应商已支持任意长度。设置保存在个人供应商配置中，安装或升级不会覆盖它。

## 外接模型上下文容量

进入 `/provider`
→「上下文容量」，填写供应商实际支持的上下文 Token 数。此值对该供应商下的模型共同生效；容量不同的模型可分开配置供应商，或填写共同适用的较小容量。留空恢复原默认值，不会更改输出上限。

主 Agent、子 Agent、自动压缩、超限判断和界面用量显示会读取同一容量。修改立即用于后续计算；达到压缩阈值后，系统仍按原流程提炼历史并保留近期工具结果。设置只在本地用于预算，不会向 API 发送额外字段，也不会扩大网关实际支持的容量。

未配置时仍使用原有模型默认值，未知模型默认为 1,048,576。请按模型或网关的实际说明填写；CLI 不会根据模型名字猜测第三方网关容量。

## 流响应长时间没有进展

外接供应商默认允许等待完整数据事件最多 120 秒。普通 SSE 注释心跳以及 ping、heartbeat、keepalive 命名事件不会延长此等待；思考、正文、工具参数等完整数据事件会刷新期限。完成后的用量收集仍有独立的短暂等待，不会被心跳无限延长。

如确需调整，可设置 GEMINI_ULTRA_STREAM_IDLE_MS，单位毫秒，最小 1000；未设置或非法时使用默认值。model.requestTimeoutMs 管理响应头等待，与这个流进展期限不同。

外接 HTTP 错误会保留状态码，并遵循现有的有界重试策略；临时 429/5xx 可重试，400 等请求错误直接报告。请求完成、超时或取消时会终止对应网络流，包括 DevTools 日志的响应副本，避免旧连接持续占用。

非交互 HTTP 错误的 JSON 保留完整状态码（error.code）；系统退出状态在不同平台可能被截断。报错后完成清理并让关闭回调排空，再以非零状态结束。

## DeepSeek 工具对话的推理续接

/provider
→「推理续接」提供自动、启用、关闭三档。自动按模型名称识别 DeepSeek；启用用于其他支持 reasoning_content 的 Chat 端点；关闭适用于拒绝回传该字段的网关。新接收到的原始推理按供应商、端点、协议与模型绑定保存，并在携带工具的同一模型请求中回传。最终正文与普通 Gemini 请求分开处理。

旧会话只保存显示摘要时，原始推理无法回填；对要求完整推理的端点，可先 /compress 或建立新会话继续。此设置属于 Chat 协议兼容选项，与 /effort 的六档推理强度分别控制。

## 跨电脑逆向环境

支持从 PATH 查找工具；也可将命令包装器加入 PATH。建议：Ghidra +
JDK、radare2/rabin2、Python；Android 分析可加 JADX；调试工具依平台选择。IDA 是可选商业软件，由用户提供合法安装与许可。不会把开发机安装的工具、密钥、授权、样本、记忆库或 MCP 配置复制给其他用户。

本机需要自定义工具路径时运行 `/drill setup`
查看环境变量说明。每台电脑独立配置模型、工具路径和演练授权。外部网络测试应明确目标与授权范围；Bypass 仅表示审批方式。

## 从源码生成分发包

功能分支尚未合并到master，首次检出请使用：

```sh
git clone --branch codex/ultra-agent-portable https://github.com/emstudio010-hub/gemini-ultra-cli.git
cd gemini-ultra-cli
```

```sh
npm ci --ignore-scripts
npm run package:ultra
```

产物位于 `artifacts/ultra-release/`。包内包含 CLI
bundle、策略、内置技能、文档和第三方声明。打包脚本只复制明确列出的发布资源；不会扫描用户主目录。GitHub
Actions 的 `ultra-package`
工作流可手动生成并下载构建产物，并在 Windows、Linux、macOS 分别检查隔离安装后的入口、静态初筛、笔记归档与查询。模型响应使用本地 fixture，不连接真实供应商；不会自动发布 npm 或 GitHub
Release。每个安装包附带 `.sha256` 文件，便于传输后核对。

Windows PowerShell 校验安装包：

```powershell
Get-FileHash ./gemini-ultra-cli-1.0.0-preview.26.tgz -Algorithm SHA256
Get-Content ./gemini-ultra-cli-1.0.0-preview.26.tgz.sha256
```

macOS 使用
`shasum -a 256 -c gemini-ultra-cli-1.0.0-preview.26.tgz.sha256`；Linux 使用
`sha256sum -c gemini-ultra-cli-1.0.0-preview.26.tgz.sha256`。

## 自定义逆向工具路径

可用变量包括
`GEMINI_ULTRA_TOOL_R2`、`GEMINI_ULTRA_TOOL_RABIN2`、`GEMINI_ULTRA_TOOL_JADX`、`GEMINI_ULTRA_TOOL_ANALYZEHEADLESS`、`GEMINI_ULTRA_TOOL_JAVA`
和
`GEMINI_ULTRA_TOOL_PYTHON3`。变量值填写完整文件路径；Linux/macOS 文件还须有执行权限。设置后重启 CLI，运行
`/drill setup` 查看实际路径。无效路径会显示缺失，不会中断其他工具检查。

Windows PowerShell 示例（替换为自己机器的实际路径）：

```powershell
$env:GEMINI_ULTRA_TOOL_R2 = 'D:\Tools\radare2\bin\r2.exe'
$env:GEMINI_ULTRA_TOOL_ANALYZEHEADLESS = 'D:\Tools\ghidra\support\analyzeHeadless.bat'
gemini-ultra
```

Linux/macOS 示例：

```sh
export GEMINI_ULTRA_TOOL_ANALYZEHEADLESS='/opt/ghidra/support/analyzeHeadless'
gemini-ultra
```

以上示例只对当前终端及子进程生效；长期使用可写入系统用户环境或 shell 配置。CLI 内置技能会使用检测返回的实际路径。路径变量用于发现工具，不会自动安装工具或加入 PATH。只有本机 IDA
MCP 服务可用仍不足以建立连接，需要用户通过 `/mcp` 配置自己的服务。

## 原生二进制结构检查

模型可调用 `binary_inspect`
读取实际文件信息、导入表、节区、依赖库与符号，使用本机 radare2 中的 rabin2，不执行或改写样本。把 rabin2 加入 PATH 或设置
`GEMINI_ULTRA_TOOL_RABIN2`，然后运行 `/drill setup`。Windows请指向原生
`rabin2.exe`。

`view` 可选 `info`、`imports`、`sections`、`libraries`、`symbols`；默认
`info`。数组默认最多200项，可用 `maxItems`
调整为1–1000项；结果明确报告总量和是否截断。任务可取消，20秒超时，原始输出上限4
MiB。缺工具、异常JSON、超时或溢出均返回错误，不伪装成分析完成。

`binary_triage` 的 `highRiskApis` 仅为字符串候选；应使用 `binary_inspect`
的实际导入表复核。该工具也可供只读子代理和计划模式调用；静态元数据不等于完整反编译或行为验证。

## 已核对的原生工具安装

Windows x64、Debian 12 x64和macOS arm64已使用官方radare2
6.2.2完成已安装CLI的原生导入读取、归档和查询；模型响应为本地fixture，样本未执行。包不携带radare2，其他发行版和架构应选择相应安装方式。

Debian 12 x64示例，从官方发布页下载并核对本轮实际使用的包：

```sh
curl -fL -o radare2_6.2.2_amd64.deb https://github.com/radareorg/radare2/releases/download/6.2.2/radare2_6.2.2_amd64.deb
printf '%s  %s\n' '09234e4139bf8dfcbb7fc1fdb2519859ad516e63c19d3c27d92aaecdf463b1ad' 'radare2_6.2.2_amd64.deb' | sha256sum -c -
sudo dpkg -i ./radare2_6.2.2_amd64.deb
rabin2 -v
```

macOS
arm64可从[官方6.2.2发布页](https://github.com/radareorg/radare2/releases/tag/6.2.2)下载
`radare2-arm64-6.2.2.pkg` 并安装。本轮核对的SHA-256为
`6d674844aacb3c72de0fd1e01353d6dd03d4235a3629b607d1fe74c98e2a5f24`；安装后用
`rabin2 -v` 和 `/drill setup`
检查当前电脑的实际路径。Windows选择原生rabin2.exe，安装位置不固定。

Node 22.19.0的Linux x64原生链也已单独核对；三平台runner使用Node
24.22.2。这些记录属于preview.8运行时代码，本轮后续版本的修复与验收见目标池。

## 笔记与事实查询

`drill_record_fact` 的 `note`
单独保存技术观察，不会生成带有假哈希的二进制工件。`binary` 用于样本，`vuln`
用于发现；`info` 严重度仍属于发现。笔记正文和证据分别保留，演练台同时显示。

数据库被占用或写入失败时，归档工具会返回结构化错误，按失败记录；释放写锁后可重试，不把未落盘的事实计为成功。

`drill_query_facts` 的 `currentSessionOnly`
同时约束普通列表与关键词搜索。没有全文索引或关键词不是合法全文表达式时，使用字面搜索；无匹配时返回空列表。普通列表按时间返回最新50条。

旧版本误存的记录不自动改写，因为数据库无法可靠区分真正的二进制记录与误归档笔记。安装包仅包含产品文档，工程交接、目标池和本机参考笔记保留在源码目录。

## 验收边界

本地构建与隔离目录安装不等于另一台实体电脑或各操作系统均已验收。各平台实际工具安装、商业许可、真实供应商调用和完整逆向任务须单独记录。预览包不会声称具备尚未验证的硬件/工具/生产能力。

## 配置恢复与协作额度

`ultra-runtime.json` 或 `ultra-prompts.json`
损坏时，CLI 会显示一次恢复提示并使用默认设置，保留原文件。修正文件后再次读取即可恢复。也可通过
`/team auto` 或演练台重新保存；保存前会将旧文件备份为同路径
`.bak`。提示不会输出文件中的私有正文。配置文件需为普通 JSON，兼容 UTF-8
BOM；过大的配置同样会提示恢复。

`/team` 的并发额度适用于同一会话的所有本地子代理，包括多个 `spawn_subagents`
批次和直接
`invoke_agent`。超额任务先排队，获得额度后才记为执行中；等待时取消会退出队列。`single`
模式下直接调用也串行执行。运行中的任务需完成或完成取消清理后才释放额度。远程代理走单独的连接与确认流程，不计入这一项本地额度。

## 供应商配置可靠性

供应商配置也会检查字段、模型列表和唯一 ID；损坏配置给出恢复提示并保留原文。支持缺少可选字段的旧记录，协议可从完整端点推断。此配置在进程内缓存，手动修复文件后请重启 CLI。文件上限为 4
MiB。

保存供应商、删除供应商、切换模型和修改强度都会先验证候选配置，备份旧文件为
`.bak`，原子替换成功后才更新会话内状态。保存失败会保持旧配置。删除默认模型会选择剩余模型；清空生图列表会清除旧的生图默认值。不同名称生成相同 ID 时会分配新 ID；按名称明确更新同名供应商的旧命令仍兼容。

## 外接模型用量与输出上限

外接路由单独接入用量日志；原生通道保留已有记录方式。Chat、Responses、Anthropic 的输入、输出、缓存、思考用量会映射到 CLI 统计与上下文元数据；Gemini 协议保留原生用量字段。思考 Token 从候选输出中拆出，避免重复计数。

只有供应商报告的数据才能用于实际用量统计。端点没有返回用量时会提示，零计数不代表未消耗；统计不等同于账单。Chat 会请求尾部用量，收到结束标记后最多再等两秒，避免不关闭的端点让会话卡住。

这两秒是结束后的固定期限；网关继续发送注释、保活或其他尾部字节不会延长期限，期限内到达的用量仍保留。未结束的正常生成仍沿用空闲超时。中途断流会报告不完整，不把它当作正常完成；之后可重试请求。

请求中的 `maxOutputTokens` 会映射到 Chat 的输出限制字段、Responses 的
`max_output_tokens`、Anthropic 的
`max_tokens`；较小的 Anthropic 上限会相应缩减或关闭思考预算。具体模型仍需支持对应协议和上下文大小。

## 协议输入和响应校验

字符串、Part 列表与完整 Content 会按 SDK 语义转换，保留原始 thought 标志与签名；Chat/Anthropic 发送普通历史时隔离思考正文。工具结果和同一消息中的用户补充都会保留。没有原生调用 ID 的历史会生成稳定 ID，并与相应工具结果配对。

网络 JSON 会先校验实际使用的字段，Gemini 响应的未知扩展元数据继续保留。无效文本、错误结构和损坏的工具参数会给出清晰错误，工具不会执行。旧版 SDK 工具 Schema 的嵌套大写类型会转成 JSON
Schema 标准小写。

## 回复期间输入命令

模型回复时，可继续输入 `/effort`、`/language`
等本地斜杠命令。普通命令会排队，待回复结束后按输入顺序逐条执行；支持并发的命令仍可即时处理。相邻普通消息会合并提交，斜杠命令始终保留独立边界。

启动期间输入的命令会等待命令表就绪，本地命令无需等待 MCP 连接。清空队列后，尚未开始的输入不会继续执行；已开始的操作需要单独取消。Shell 命令仍不能在回复期间排队。

## 子 Agent 中断与阶段结果

子 Agent 达到时间或轮数上限后，可用最后一轮提交已有发现和未完成工作。该阶段只允许
`complete_task`，其他工具不会执行。提交阶段总结后仍保留 `TIMEOUT` 或
`MAX_TURNS`，终端与协作批次按失败显示，父 Agent 可读取部分结果并决定后续工作；会话摘要也保留中断标记。

仅遗漏
`complete_task`、且未耗尽执行额度时，补交有效结果仍可正常完成。用户在最后一轮取消时保持取消状态，不会记成成功或限制失败。

## 内置快速搜索

安装包内置固定版本 Ripgrep
15.2.0，Windows、Linux、macOS 的 x64/ARM64 文件随包提供；搜索时自动选择本机版本，无需另装
`rg`。构建时按清单校验二进制，包内保留来源、SHA-256 和许可证。Windows 生成的包也保留 Unix 可执行权限，便于跨系统传递安装包。

运行时不会下载二进制或为此扫描文件。`grep_search`
仍遵循工作区与忽略规则；显式关闭 `tools.useRipgrep`
时保留原搜索回退。其他逆向工具仍通过 `/drill setup`
在本机配置。实际运行的系统/架构范围以目标池记录为准。

## 连续工具任务的上下文与协作额度

同一任务持续读文件、搜索或调用其他工具时，压缩可在已完整返回的工具组之后进行，不必等下一条用户消息。尚未返回的并行调用及最新工具结果保留在同一段历史里；支持带ID和无ID的工具协议，不产生孤立的工具响应。

会话并发额度降低后，下一次准入使用新额度；已经运行的任务继续收尾，等待任务不会趁某个旧槽位释放而越过新上限。子 Agent 的完成工具使用自己的结果定义，避免从父代理重复继承和覆盖。
