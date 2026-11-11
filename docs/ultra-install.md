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
npm install -g ./gemini-ultra-cli-1.0.0-preview.63.tgz
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

`/team`、`/redteam` 与 `/drill` 的命令说明和反馈随当前语言切换， `/演练台 状态`
等中文别名仍可使用。事实正文、工具路径、哈希和时间等原始数据保持原文。

`/provider use <名称或ID>`
同时切换持久化选择与当前会话模型，后续请求立即使用新供应商。 `/provider use`
的补全只列供应商 ID，每个供应商一项。命令说明和反馈随 `/language` 切换。
`/provider add <名称> <URL> <Key> [模型]`
手填模型时跳过模型列表请求；更新已有供应商时保留其他已配置模型。省略模型则尝试获取列表；列表为空或失败时保留原配置，提示手填模型或进入
`/provider` 编辑。

网关模式启动时，未另行指定模型会直接采用已配置的活跃供应商与模型，避免先调用 Gemini 自动分类器。CLI 参数、环境变量和设置文件中的显式模型继续优先；Google 原生登录保留自动模型选择。

## 可选输出上限

进入 /provider，选择「输出上限」即可按供应商设置正整数 Token 数。留空恢复现有默认行为；任务自己指定的上限优先。可用范围依模型和供应商而定，此设置不代表该供应商已支持任意长度。设置保存在个人供应商配置中，安装或升级不会覆盖它。

## 手动压缩与取消

- `/compress`：生成摘要后进行第二轮复核。
- `/compress fast`：只做一轮摘要，跳过第二轮复核，减少等待；网络错误仍遵循既有重试策略。
- `/compress cancel`：取消当前手动压缩的网络请求，保留原上下文。自动压缩可按 Esc 取消当前请求。

也支持 `/压缩 快速`、`/压缩 取消`，以及 `/compact`、`/summarize`
别名。普通消息会等压缩结束再继续处理；取消后可再次提问或重新压缩。压缩期间切换会话时，旧摘要会被丢弃，避免覆盖新上下文。

模型只回复确认语、返回截断或缺字段的快照时，不会直接替换原会话。复核结果无效会保留首轮有效摘要；两轮都无效则保留原历史并提示未应用压缩。自动压缩失败后不反复请求摘要，可显式使用
`/compress` 或 `/compress fast`
重试。只保留快照正文，去除快照外的思考与复核文字；格式检查仍不代表摘要的事实和语义已经完整验收。

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
Get-FileHash ./gemini-ultra-cli-1.0.0-preview.49.tgz -Algorithm SHA256
Get-Content ./gemini-ultra-cli-1.0.0-preview.49.tgz.sha256
```

macOS 使用
`shasum -a 256 -c gemini-ultra-cli-1.0.0-preview.49.tgz.sha256`；Linux 使用
`sha256sum -c gemini-ultra-cli-1.0.0-preview.49.tgz.sha256`。

## 自定义逆向工具路径

可直接在CLI保存本机工具路径，下次启动继续使用，无需修改shell配置。演练台的「本机工具链 → 配置工具路径」也可选择工具、粘贴完整路径并保存，或清除/重新读取已保存路径。界面无需给路径加引号；使用与CLI相同的配置、备份和校验。保存后点击「查看就绪状态」重新巡检；每次点击读取当前配置，同时点击只合并正在进行的巡检。CLI忙碌时会拒绝修改。

```text
/drill tools
/drill tools r2 "D:\Tools\radare2\bin\r2.exe"
/drill tools rabin2 "D:\Tools\radare2\bin\rabin2.exe"
/drill tools analyzeHeadless "D:\Tools\ghidra\support\analyzeHeadless.bat"
/drill tools reset r2
```

Linux/macOS同样使用完整绝对路径，例如`/drill tools r2 /opt/radare2/bin/r2`。路径有空格时可加一层引号，保存即时生效。`tools`列出支持的工具及保存位置，`reset`只移除该工具的已保存路径，不删除工具文件。设置保存在当前用户的`~/.gemini/ultra-tools.json`；`GEMINI_ULTRA_TOOLS_FILE`可指定独立配置文件。迁移到其他电脑时重新选取当地路径，不复制开发机的绝对路径设置。

工具优先选择`GEMINI_ULTRA_TOOL_*`环境变量，其次已保存路径，最后PATH。Java额外保留`JAVA_HOME`优先级：显式Java变量→JAVA_HOME→保存路径→PATH；无效高优先设置不会悄悄回退。r2/rabin2/java须原生可执行文件，Windows不接受bat/cmd，POSIX文件须可执行。保存只检查文件可访问及权限，不执行工具、不下载、不证明版本兼容。巡检和二进制工具使用同一份发现逻辑。

有效配置更新前生成唯一`.bak`备份，写入采用同目录临时文件替换；保存失败保留原配置。损坏、超大或链接配置文件会明确报错并保留，修复原文件后再保存；不会自动清空。此配置仅记录工具路径，供应商、MCP与演练授权仍分别配置。

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

## 函数、指令与调用引用

模型可调用 `binary_analyze`，使用本机 radare2 的原生 `r2` 读取静态分析结果：

- `view=functions`：用 `aa` 分析入口与符号并列出识别到的函数。
- `view=instructions`：读取一个指令窗口，默认从入口开始；可传此前返回的数值虚拟地址。
- `view=xrefs`：用 `aaa` 分析调用和引用，必须指定目标数值虚拟地址。

工具已提供给只读子 Agent 和计划模式。先通过 `binary_triage` / `binary_inspect`
确认文件格式和架构，再按需查看函数与引用；本地指令窗口不等于完整函数覆盖，空引用不证明没有调用者。这是反汇编分析，反编译仍需 Ghidra、JADX 或已连接的 IDA。

每次调用最多 30 秒、4 MiB 输出、64
MiB 样本；可取消。超时或 JSON 不完整时明确报错，不将部分输出当作完成。地址只接受整数、十进制字符串或
`0x`
十六进制字符串，不接受命令和表达式。返回项默认 100、最多 500，并明确报告截断。分析进程忽略用户启动脚本和外部插件，只读打开，不执行或修改样本。

在新电脑安装 radare2 后，把原生 `r2` 加入 PATH，或设置
`GEMINI_ULTRA_TOOL_R2`。Windows 指向 `r2.exe`，不要指向 `.bat` 或 `.cmd`
包装器；缺失时工具会显示该配置方法，可用 `/drill setup`
查看实际发现路径。CLI 包不捆绑 radare2，也不依赖开发机目录。

preview.28 已分别在 Windows x64、Linux x64 和 macOS arm64 调用原生 r2
6.2.2，完成生成 ELF 的函数、指令和 CALL 引用读取，并写入/查询 SQLite 笔记。Linux/macOS 复用了原 CI 安装包，源提交和包 SHA 均已核对。模型响应为本地 fixture，样本未执行；该记录验证静态分析接线，不代表复杂反编译或真实模型理解能力。macOS
arm64 读取 x86-64 ELF 属于跨架构静态解析。

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

## Teamwork、Boost 与需求访谈

参照 Google
Antigravity 的公开工作流概念，使用本 CLI 的模型、权限、子 Agent 与本地状态实现；不需要安装 Antigravity 或复制开发者配置。

- `/boost <任务>`：直接启动两条只读调查，再由一个 coder 实施、独立 auditor 检查。每个里程碑最多两轮修正和审查，最后另做整体审查；未通过则保留结果并阻塞，不自动无限重试。
- `/teamwork <目标>`：在只读计划模式中对齐范围、约束和验收条件，保存里程碑草案。`/teamwork approve`
  确认当前草案后调用原生执行链；已完成的里程碑在恢复时跳过。
- `/teamwork prepare <目标>`：零模型创建任务并进入只读计划模式。先用
  `/teamwork model <角色> <供应商ID:模型ID>`、`/teamwork budget <请求数> <失败阶段数> <实施轮数>`
  和 `/teamwork workspace on` 配置，再 `/teamwork resume`
  对齐需求和保存草案；resume不会批准执行。审阅草案后显式 `/teamwork approve`
  才启动成员。
- `/grill-me <需求>`（别名 `/grillme`、`/需求对齐`）：先读代码，再通过现有
  `ask_user`
  逐题提问，推荐答案在前。无参数时先澄清当前工作区的目标。对齐后保存草案，`/grill-me finish`
  结束访谈并把约定交给主 Agent 继续处理。

三者均支持
`status`、`resume`、`cancel`。状态和取消子命令在模型忙碌时也可使用。取消保留已返回报告，等已启动子任务结束清理后才释放工作区；另一个 CLI 进程中的任务需在其原会话取消。进程被强制结束后，可显式
`resume`
从已持久化的阶段恢复；中断阶段可能重新调查，但已完成的里程碑不会再次实施。

状态位于项目临时目录的 `agent-workflows/<ID>.json`，`status`
显示 ID 与里程碑。草案不会自动批准自身；模型的 draft 工具不能启动执行。访谈结束或取消时恢复进入访谈前的权限模式；若原本就在计划模式，该模式仍适用。`/team`
继续设置会话并发额度；新工作流遵循该额度。

调查有独立上下文，可以并行；实现阶段串行运行，跨 CLI 进程也使用工作区锁。首轮前可显式启用
`workspace on`，整个任务共用一份隔离 Git 工作树，详见下文；成员不各自创建并行分支。独立审查员只能读取工件，采用结构化通过/不通过判定；没有证据的明确验收条件应判不通过。模型判定仍需真实任务验收，不能仅凭结构化字段宣称生产就绪。每次原生执行有20分钟上限，达到上限保留进度并阻塞，可由用户显式恢复。

原始阶段报告按项目保存，主会话只接收有长度上限的近期摘要与原始记录路径，避免大量并行报告撑满上下文。测试范围始终遵循用户要求，只运行必要检查。

成员以普通文本结束而未调用完成工具时，会进入最终提交回合。如果这次提交被参数校验拒绝，允许在同一个60秒期限内修正一次，只能提交完成结果，不能继续执行工作工具。参数仍需通过严格校验；再次失败则阻塞。达到轮数或时间上限不会因此获得额外修正，也不会被改记为完成。

参考：[Teamwork](https://antigravity.google/docs/teamwork/)、[Boost](https://antigravity.google/docs/boost/)、[Grill me](https://antigravity.google/docs/commands/grill-me/)。本项目为独立实现。

## Swarm 具名蜂群

`/swarm <任务>`
将当前对话作为协调者，为不同问题或文件范围分配具名成员，并安排独立验证成员。成员的公开任务、提问与结果都追加到同一个留言板，`@成员`
或 `@all`
可唤醒等待成员。空闲成员不轮询模型；协调者等待运行中的成员时使用原生事件等待。

- `/swarm board`：实时终端留言板与成员状态，每秒刷新；↑↓查看历史，Esc返回。
- `/swarm status`：查看状态和留言板保存位置。
- `/swarm message @成员 <补充>`：公开追加指令并唤醒对应成员；运行中的成员在当前轮收尾后处理新的提及。
- `/swarm resume`：恢复已保存的蜂群；中断成员保持暂停，由协调者明确提及后继续。已经移除的成员名称不会复活。
- `/swarm cancel`：停止成员并保留留言和结果；不删除用户文件。

消息发送者由运行时分配，成员不能冒充协调者或其他成员。只有当前修改版本通过独立验证，且没有运行、排队或暂停未处理的成员，蜂群才能标为完成；后续成员工作会使旧验证失效。

调查成员可并行，写入与验证成员串行执行，并遵循 `/team`
的会话并发上限。成员默认继承会话模型，也可在首轮前用
`/swarm model researcher 供应商ID:模型ID` 配置角色，或用
`/swarm model @成员 供应商ID:模型ID` 预设具名成员；`inherit`
清除当前层覆盖。`/swarm model`
显示本地已配置模型目录，不探测端点、不显示密钥。运行中的成员不能改模；显式成员调用失败不会偷偷换全局模型。

`/swarm prepare <任务>` 零模型创建，随后可配置模型和 `/swarm workspace on`，再
`/swarm resume`
开始。Boost 和 Teamwork 同样支持 prepare/model/workspace；Teamwork
resume 仍只对齐草案，须显式 approve 才执行。

workspace
on 必须在第一轮前启用，要求当前目录是已有HEAD的Git仓库根目录。它捕获实际工作文件及非忽略未跟踪内容，保留原暂存区/HEAD；整个任务共用一份隔离工作树，writer/verifier仍串行，成员文件工具和shell
cwd在隔离目录。Git忽略的依赖/缓存不复制，当前不支持submodule及超过64MiB的快照。不是每成员并行分支，也不是OS安全沙箱。

`workspace status|export|apply|remove`
均是本地命令。完成独立审查后，显式apply先检查冲突再整体回写，不改变原暂存区；未审查、审查后被改动、原目录冲突时保留成果。remove不强制删除；存在ignored文件时也明确拒绝清理，需自行保留/处理后重试。补丁与记录留存。跨进程工作区锁只约束本CLI原生工作流，外部编辑仍需自行协调。

每个蜂群最多12名成员、每成员最多20次唤醒、每轮最多10分钟，留言最多500条/4MiB；达到边界会暂停并保留结果，不无限消耗模型。状态按项目保存在临时目录的
`swarms/<ID>/`，原CLI进程仍在运行时应在原会话发送指令；另一会话可查看板面。进程退出后，显式恢复会把中断成员标为暂停。

参考：[Antigravity Swarm](https://antigravity.google/docs/swarm/)。本项目独立实现共享留言板和事件唤醒机制。

## Ghidra 单函数静态反编译

preview.40 新增原生工具
`binary_decompile`，研究及红队分析成员也可调用。先安装官方 Ghidra 和兼容 JDK；Ghidra
12.1.4 需要 JDK21或更高的受支持版本。每台电脑设置自己的
`GEMINI_ULTRA_GHIDRA_HOME`（Ghidra安装根目录），以及 `JAVA_HOME`（JDK目录）或
`GEMINI_ULTRA_TOOL_JAVA`（原生Java可执行文件）。也可通过 PATH 或
`GEMINI_ULTRA_TOOL_ANALYZEHEADLESS` 找到标准发行版的support目录。`/drill setup`
显示依赖是否被发现，实际JDK兼容性在调用时检查。巡检与反编译统一按
`GEMINI_ULTRA_TOOL_JAVA` → `JAVA_HOME/bin/java` → `/drill tools` 已保存路径 →
PATH 选择 Java。高优先级配置不存在、不可执行或指向批处理包装时会明确报错，不会由 PATH 中的另一个 Java 掩盖；修正或清除对应环境变量后再运行巡检。路径可以包含空格。无需IDA或开发机路径，Ghidra/JDK不随CLI包分发。

工具参数为本地 `filePath`、可选十六进制虚拟 `address` 和
`maxChars`。先用 binary_inspect/binary_analyze 确认格式和函数；没有address时选入口或首个本地函数。PIE/共享库可能被Ghidra重定位，务必核对返回的imageBase和地址；文件偏移不能直接当虚拟地址。地址找不到时不会静默反编译别的函数。

样本仅复制到临时分析项目，不执行或修改。直接启动原生Java，不将路径交给shell或批处理；固定内置脚本导出一个函数。每次最多64MiB输入、1GiB
Java堆、60秒自动分析、30秒单函数反编译、120秒进程上限；错误/超时保留日志，不标为完整。

结果包含函数名/地址、语言/编译器、样本SHA、伪代码SHA和工件路径。完整伪代码保存在项目临时目录
`decompilations/<ID>/decompiled.c`，附report.json及analysis.log；`maxChars`只截断返回预览，不丢弃完整工件。伪代码是工具推导，不等于原始源码、全文件分析或真实运行结果。未恢复原始类型或调用约定时，需结合指令及证据进一步确认。官方Ghidra通用包不包含macOS和Linux
ARM的部分原生组件。只有Java与Utility.jar不足以反编译；巡检会检查对应平台的decompiler。在这些电脑上按Ghidra
GettingStarted.md安装C/C++工具链后，到Ghidra安装目录的support/gradle运行 ./gradlew
:Decompiler:buildNatives，成功后Ghidra会优先使用build/os下的组件。CLI不会擅自编译或改动本机工具安装。

## 保存和读取工作流报告

演练台新增「原生 Agent 任务」：点击「读取项目任务」，再选择 Teamwork、Boost、Grill
me 或 Swarm。目录每页20项，按需刷新；所选详情在演练台可见时每4秒更新。可查看成员状态、最近共享留言、里程碑、当前阶段、用量与结果预览，并取得该任务的完整 status/reports 命令。长结果附全文档案路径；面板显示预览和路径，完整正文校验与导出仍使用 reports。旧任务用量缺失时显示未知，坏记录保留并标注；查看沿用当前批准和活动任务选择。任务控制继续使用终端里的原生命令。

用 `/teamwork list`、`/boost list`、`/grill-me list` 或 `/swarm list`
查看当前项目的同一份 Agent 任务目录；四种任务一起列出，按保存时间排序，每页20项。`/swarm list 2`
查看第二页，目录中的完整命令可直接用于查看对应任务。
`/teamwork status <ID>`、`/boost status <ID>`、`/grill-me status <ID>` 和
`/swarm status <ID>`
查看指定任务；工作流的模式必须匹配。列表和按 ID 查看状态均为本地只读操作，保留活动任务选择、记录、累计用量与批准状态。

`/teamwork resume <ID>`、`/boost resume <ID>` 和 `/grill-me resume <ID>`
可恢复指定工作流，模式须匹配；不带ID仍选最近任务。未批准的 Teamwork 草案继续在计划模式中对齐，只有显式 approve 才执行。恢复沿用所有权和累计预算检查，其他待处理工作流未结束时会拒绝切换。已经 completed 的工作流只返回本地提示和任务ID，保留结果、预算与原批准模式，不重新运行或调用模型。Swarm 的 resume 继续使用当前绑定，历史目录不自动选择其执行任务。

目录每页读取正文最多16MiB，坏记录或未加载详情会单独标注；原文件保留，可用相应任务 ID 进一步查看或导出。目录不创建缺失的历史预算，也不把未知用量显示为零。界面标签随语言切换，任务原文保留。

Boost、Teamwork 和需求访谈的长阶段结果完整保存在项目临时目录
`agent-workflows/<ID>.reports/`。超过16000字符的正文先完整归档，工作流JSON只存短预览、哈希和长度；后续成员需要中段证据时读取完整文件，避免把预览当作全文。归档属于运行记录，请勿编辑或提前删除；缺失、变更或校验不符时，交接和导出会报错，需保留现场并恢复原文。单份归档最多8MiB，超出上限或保存失败会阻塞任务，不会默默丢弃尾部并报成功。旧版本已经截断的内容无法恢复。现有100份阶段记录窗口保留；Swarm成员结果沿用其原有存储边界。

使用 /boost reports [ID]、/teamwork reports [ID]、/grill-me reports [ID]
或 /swarm reports [ID]
可在本地生成已保存报告索引，不调用模型。无ID查看当前项目最近记录，显式ID取历史任务；输出indexPath指向全部已保存阶段正文/成员结果，附任务快照和逐份哈希，Swarm附公开留言。中文/英文跟随/language，原正文不翻译。导出保留完成/受阻/取消等原状态，不恢复、审批或回写；源记录和预算不变，相同快照复用，改过的导出文件不覆盖。正文提到的外部源文件/工具工件仍在原路径，不自动复制或重新验证；私有任务信息由你决定是否分享。
