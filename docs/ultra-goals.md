# Gemini Ultra CLI 持续目标池

目标：形成可分发、可持续使用的完整 Agent。参考本地 DSH-purge
1.1.71；保留已有修改，只做改动必要的检查。

状态中的「本地完成」表示已有实现与对应本地证据，不等同于生产或跨平台验收。持续目标仍开启。

| 优先级 | 目标                                        | 状态                     | 已有依据 / 剩余工作                                                                                                |
| ------ | ------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| P0     | 缩短启动，避免父子进程重复加载核心依赖      | 本地完成                 | preview.11默认监督进程完整ConPTY观察：5,182ms输入框、6,290ms本地命令执行，0模型请求；单台Windows，其他机器仍需记录 |
| P0     | 加载卡住时可取消、有超时和错误恢复          | 本地完成，持续观察       | 修复结束后保活不断重置收尾期限，安装HTTP场景6,511→2,046ms且usage保留；启动期斜杠等待当前命令表，E-033至038         |
| P0     | `/language` 中文/英文选择与六档唯一推理强度 | 本地完成                 | 显式切换、即时刷新、持久化；终端与浏览器中英文各六档，别名仍可输入                                                 |
| P1     | 模型配置便捷可靠                            | 本地完成                 | 新增不覆盖旧供应商、端点规范化、手动模型、密钥清空与掩码、外接供应商可独立初始化；真实供应商待验收                 |
| P1     | 多 Agent 有界排队、取消与结果可见           | 原生编排通过，实战待验收 | E-119五阶段native链/E-122三平台Swarm；模型fixture；真实无人介入任务与引用准确性仍待验收                            |
| P1     | Teamwork / Boost / Grill me                 | 原生命令与流程接线完成   | E-116/117/119：访谈/批准/里程碑/独立复核及已安装CLI五阶段链；非Google专有编排服务                                  |
| P1     | Swarm具名成员、共享留言与实时看板           | 三平台原生链通过         | E-120/122/123/151：@提及唤醒、事件等待、终端看板、任务工作树及显式回写；真实自主交付待验收                         |
| P1     | 内置红队工作流                              | 本地分析闭环通过         | 临时授权下redteam-analyst真实分析生成样本并归档，E-016；复杂逆向与外部目标未验收                                   |
| P2     | 演练台 Morphicons 交互图标与强度动效        | 本地完成                 | 使用 Morphicons 2.0.2；浏览器确认六档、图标、移动布局、减少动态效果与隐藏暂停                                      |
| P0     | 安装到 CLI 本身并生成可分发安装包           | 本地完成                 | 当前preview.39 Windows CI包，424文件匹配；E-151/152；成员独立模型与任务工作树                                      |
| P1     | 其他电脑可以开展本地逆向                    | 三平台原生静态链通过     | preview.28的Windows/Linux x64、macOS arm64实际r2函数/指令/引用及SQLite归档通过E-107/111/112；复杂反编译待补        |
| P1     | GitHub 三平台分发验收                       | 已通过至preview.39       | preview.39/run42909725723三平台success；多模型、任务worktree/回写/ignored保护及安装身份通过E-151/152               |
| P1     | 真实供应商与长会话上线验收                  | 未完成                   | E-124真实Swarm报告未交付，隔离8192两次length，观察者停下第三轮；原失败保留，完整自主交付仍未通过                   |

## 证据记录

- `agent-product-verification.json`：六组定向验证，包含本机真实浏览器界面操作。队列与模型响应使用 fixture。
- `installed-cli-team-result.json`：已安装独立 CLI
  → 本地 HTTP 协议 → 两个 researcher 子代理 → 父代理汇总；不是供应商实测。
- `installed-cli-reverse-result.json`：已安装独立 CLI → 本地 HTTP 协议 →
  binary_triage → 返回哈希与文件类型；样本为人工最小文件。
- `isolated-install-result.json`：隔离目录 npm 安装及帮助入口通过。不是另一台电脑验收。
- 以上原始记录位于当前开发会话产物目录，不随安装包分发；阶段交接保存到 Obsidian。

## 接续顺序

1. 已核对最终分发包与全局安装一致；安装交接已写入 Obsidian。
2. 三平台构建/安装与基础原生链已完成；后续按平台相关改动选择检查，不重复未受影响的场景。
3. 结合实际供应商与真实工作任务处理后续问题，维护此目标池，不反复运行已通过且未受改动影响的检查。

## 2026-11-10 协作结果修复

- 普通执行器和会话执行器仅将 GOAL 标成完成；TIMEOUT、MAX_TURNS、ERROR 和缺少 complete_task 的终止标成失败，保留部分结果。
- 批量协作读取子代理结构化状态，成功、失败、取消分别统计；取消后排队任务不再启动，迟到返回不算成功。
- 终端在排队、开始和结束时更新任务数量。
- 定向证据：两个执行器的 16 个选定用例通过，另有 agent-outcome-verification.json 四组验证；没有真实模型调用。
- 更新分发版本为 1.0.0-preview.2；本阶段安装结果见 Obsidian 交接。

## 后续可靠性目标

- 本地完成 P0：损坏的运行与提示词配置可恢复，保留原文并显示诊断；E-007/008。
- 本地完成 P1：多个批次与直接调用共用会话额度，排队取消与状态转换已验证；E-007。
- 记录 E-006：preview.2 已安装 CLI 的一成功、一 HTTP
  400 子任务故障路径通过，本机模拟端点，约 2,078 ms。

## 2026-11-10 配置恢复与会话并发

- 损坏、格式错误、过大的运行与提示词配置不再阻断初始化或模型请求，提示恢复并保留原文；重新保存前备份为 .bak。
- 并发额度移至真实代理执行入口，直接调用与多个批次共用；排队取消移除等待项，运行状态在获得额度后才更新。
- runtime-scheduler-verification.json 四组验证通过；代理入口、批次与状态代码实际运行，底层执行器为受控 fixture。
- 分发版本更新为 preview.3；安装后的证据与剩余边界记入本阶段 Obsidian 交接。

## 2026-11-10 供应商可靠性

- 对持久化记录做字段校验、旧记录规范化与损坏恢复；保留源文件，显式保存前备份。
- 保存改为先验证候选配置、原子落盘成功后再更新内存；切换、删除和强度设置均适用。
- 默认模型与模型列表同步，供应商切换不沿用上一家的模型，生成 ID 冲突不会覆盖不同供应商。
- 修复生图编辑对象与活跃供应商设置；推断模型目录请求的协议，避免报错回显私有请求内容。
- 分发版本为 preview.4；必要验证和最终安装结果见本阶段交接。

- E-009：供应商配置定向 7/7，覆盖模型与身份同步、坏配置和保存失败保持原状态。
- E-010：preview.4 已安装 CLI 使用旧记录完成本机端点请求，约 1,969
  ms；供应商仍为 fixture。
- 远程只读核对：仓库 PUBLIC，当前账号 ADMIN，默认 master；本地工作流尚未推送，GitHub
  runner 仍待执行。

## 2026-11-10 真实模型证据

- E-011：首次真实调用工具成功，但模型缩写 SHA-256，完整字段检查未通过；原记录保留。
- E-012：明确完整字段后的真实调用通过，SHA-256 与本地计算一致，25,164
  ms；不代表复杂逆向验收。
- P1 本地完成：外接用量日志与 usageMetadata 已接入；preview.5 当前真实 Chat 服务统计已恢复，E-013/014。
- P1 本地完成：四协议输出预算已核对，Chat/Responses/Anthropic 映射和 Gemini 透传通过定向 fixture，E-013。

## 2026-11-10 外接用量与输出预算

- 外接路由接入独立日志，记录真实端点；原生请求不重复计数。
- Chat/Responses/Anthropic 用量映射，Gemini 原样保留；思考与缓存计数按各协议语义处理。
- Chat 读取尾部用量，结束后等待有界；无用量时提示未知，不把零计数当作免费调用。
- 输出上限映射到各协议；Anthropic 思考预算适应较小的输出上限。
- 4 个用量边界用例与5组协议适配 fixture 通过；完整适配器仍有历史 any 类型 lint 债务，尚未宣称全仓库 lint 通过。
- 分发版本 preview.5，安装与真实端点结果见本阶段交接。

- E-014：preview.5 真实模型工具闭环通过，2次请求、总用量13,174
  Token，其中缓存6,144；不是账单金额。
- P2 本地完成：Universal整文件及协议边界模块严格ESLint退出0，移除any/不安全断言，E-015。

## 2026-11-10 协议类型边界

- Universal适配器移除any与不安全断言，网络JSON进入运行时结构校验；严格ESLint和TypeScript通过。
- 修复字符串输入丢失、混合工具结果与用户补充丢失、无原生ID的调用配对、Anthropic起始帧工具参数丢失。
- 损坏工具参数在执行前拒绝；旧SDK嵌套Schema类型规范化；thought标志与签名保留。
- provider-codec-preview6-result.json与provider-protocol-preview6-result.json各5组通过，均为fixture。
- 更新分发版本preview.6，实际安装与协作结果见本阶段交接。

- E-016：preview.6 真实双代理＋红队角色归档通过，6次工具全部成功、7次模型请求0错误、约24,472ms；限生成样本。
- 首次真实协作因本地代理连接超时未通过，原记录保留；当前成功不代表长会话网络稳定性已验收。
- P1 已修复：preview.7 将 note 单独归档；E-017/018。旧记录不自动推测改写。

## 2026-11-10 笔记隔离与跨平台分发

- `note` 独立持久化，保留正文与证据；`info`
  严重度仍属于漏洞发现。终端和演练台按真实类别显示。
- 修复关键词检索忽略会话范围、字面回退忽略关键词的问题；普通列表按时间限制为最新50条。
- 产品文档使用发布清单，不打包工程报告、目标池与本机 DSH 参考记录；保留安装指南和工具文档。
- E-017：三个定向 SQLite/工具入口用例通过，覆盖重开持久化、会话隔离和缺失索引回退。
- E-018：Windows 已安装 preview.7，实际 CLI 执行初筛、笔记归档、当前会话查询；3次工具成功，约2,479ms；本地模型fixture。
- E-019：独立 Linux
  x64/Node24 容器从源码和锁文件安装1384个依赖、完成TypeScript/bundle、打包及隔离安装；同一三工具链通过，约1,628ms。源码不带开发机 node_modules 或构建目录。
- E-020：把Windows生成的同一个preview.7安装包传入另一个Linux容器，隔离安装后三工具链通过，约2,533ms。支持本次包跨系统传输，不代表实体电脑或所有外部工具已验收。
- CI 增加产品文档核查与有界工具链，三平台互不提前取消、最多20分钟；定义仍在本地，未宣称远端已执行。
- 保留首次容器代理连接失败及校验脚本的JSON解码失败日志；修正验证环境/解析后通过，不把它们当作生产网络已修复。
- 当前发布包仍是预览版；macOS、另一台实体电脑、复杂逆向工具、真实服务长会话和远程发布继续留在目标池。

## 2026-11-10 原生静态结构读取

- 新增 `binary_inspect`：通过当前电脑PATH或 `GEMINI_ULTRA_TOOL_RABIN2`
  调用rabin2，读取info、imports、sections、libraries、symbols，不执行/改写样本。
- 固定只读参数、独立argv与绝对样本路径，20秒超时、可取消、4
  MiB原始输出上限；数组默认200项、可调1–1000项，明确返回总量与截断状态。
- 工具注册、计划模式、只读策略和只读子代理已接入；只读子代理也可用drill_preflight发现工具。local-reverse技能优先使用结构化工具。
- binary_triage的API字段仅代表字符串候选，描述与归档备注已明确，实际导入应使用结构读取复核。
- E-021：4个边界用例、TypeScript与受影响模块/脚本严格ESLint通过；覆盖参数、路径、调用限制、条数、缺工具、取消、超时/溢出与异常JSON。
- E-022：已安装preview.8实际调用本机rabin2
  6.2.2解析1536字节生成PE的真实ExitProcess导入，随后归档与查询；4次工具成功、5次fixture请求、约2,986ms，样本完整哈希未变。
- E-023：构建后的同一工具实现实际读取五种视图，确认PE32、ExitProcess、.text、kernel32.dll、符号数组，样本未变。其余视图不是分别通过已安装CLI验收。
- 本机rabin2目前不在PATH，真实链使用本机路径覆盖；该路径不写进分发包。其他电脑仍须自行安装和配置radare2。POSIX原生rabin2、复杂反编译与真实长会话继续留在目标池。
- preview.7的Windows/Linux跨系统安装证据保留；不将它写成preview.8新增原生能力的Linux验收。

## 2026-11-10 GitHub三平台验收

- 源码分支：[codex/ultra-agent-portable](https://github.com/emstudio010-hub/gemini-ultra-cli/tree/codex/ultra-agent-portable)，功能提交
  `64ef758852ae2cfe06b679e35e0b15525e3c76a9`；master保持原提交，没有合并或正式Release。
- E-024：108个选定源文件、内置技能与产品文档提交并推送。常见凭据模式无命中；用户配置、事实库、工程报告及本机case未提交。该检查不保证识别所有形式的秘密。
- E-025：[实际运行42724176448](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42724176448)已completed/success，三个全新GitHub
  runner均成功，未运行全仓库或冒烟工作流。
- Windows x64、Linux x64、macOS arm64均使用Node
  v24.22.2；每个平台4次本地模型fixture请求、实际3次工具成功、1个binary和1个note记录。链路耗时分别1,265/1,008/1,075ms，仅指该安装校验场景。
- 三份tgz及.sha256已下载并核对；工件中的安装报告与平台一致。`github-portable-artifacts-result.json`保存完整哈希与结果，仍位于开发会话证据目录。
- E-026：本机CLI使用GitHub Windows工件重新安装，版本仍preview.8；工件SHA-256为
  `8da4168761fdadf359c4c48f8c74edf2d1eef1112d1a518864681d91f7237948`。此前本地构建preview.8及其历史哈希保留，不能混用。
- runner模型响应为fixture，nativeInspection=false；不会把这些结果写成真实供应商、POSIX
  rabin2或复杂反编译验收。继续推进这些实际缺口。

## 2026-11-10 POSIX原生与归档故障

- E-027：GitHub Linux
  preview.8工件在独立Debian12/Node24.22.2容器中安装官方radare2
  6.2.2，实际4工具原生导入/归档/查询链通过，1,689ms。
- E-028：同一工件和原生工具在精确最低Node22.19.0独立容器通过，2,139ms。验证脚本自身导入node:sqlite会显示实验性提示，不能据此宣称所有入口无警告。
- E-029：[macOS原生任务42726298902](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42726298902)已成功，复用preview.8
  macOS工件，官方6.2.2 arm64
  pkg校验后安装，4工具链通过，1,221ms；未重跑三平台构建。
- 上述三项与已有Windows证据共同覆盖三个平台的生成PE原生导入链；模型响应仍为fixture，样本不执行，非完整反编译/行为验收。
- F-010/E-030：归档落盘失败缺少结构化error，可能被统计为成功。新增真实SQLite写锁用例，修前失败、修后通过且ROLLBACK后可恢复；只运行受影响用例和lint。
- E-031：[preview.9运行42727194094](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42727194094)三平台构建/安装success，功能提交
  `ec409342062ecf488db1e73e8256dd0c0f30c1d4`。Windows/Linux/macOS链耗时1,451/668/806ms，每平台3工具成功，模型fixture。
- E-032：本机已安装该Windows
  preview.9工件，两个命令一致、入口匹配。实际写锁场景4次fixture请求、3次工具中2成功1失败，归档2次中1成功1失败，最终仅1条笔记，1,950ms；原失败不会记成成功。
- Windows preview.9包SHA-256
  `14f6e6113ce9e02a6c3dbb128fa72c9aa373dce75bce5b3b7af42dda420cf2d9`，Linux
  `8c9100175e96ac542668feeb9a72c39a84087a459a6976e92f829c9c29ad7b5e`，macOS
  `3c457acb81103609d7c9462371dd8993c386b641c6ec48d8500ba866178531d0`；三份均已核对。
- 原生三平台证据为preview.8，preview.9只改归档失败上报及文档/版本，未无理由重复全部原生检查。复杂任务、真实供应商长会话及其他平台组合继续保留为待验收。

## 2026-11-10 流收尾与启动命令竞态

- F-011/E-033：Chat完成后每次读到保活会重置收尾等待，已改为固定deadline。公共适配器2用例修前1失败、修后2通过；完整适配器及测试严格lint通过。
- E-035：已安装preview.9真实HTTP基线结束到断开6,511ms；preview.10修后2,046ms，总用量130保留。两次均为loopback模型fixture，失败原记录保留。
- E-034：preview.10三平台run42728545311全部成功，工件核对并安装后取得上述HTTP证据。
- F-012/E-036：完整交互观察发现输入框早于命令表就绪，/effort在启动队列中误发1次模型。命令表现在记录对应config初始化状态，直接提交与队列均等待areCommandsReady；处理器加载中也不回落模型。
- 2个受影响hook用例通过（其他60项未运行），核心/CLI
  TypeScript与五个UI文件严格lint通过。本地bundle完整交互0模型请求；AppContainer测试mock同步标记命令已就绪。
- E-037：[preview.11运行42729986807](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42729986807)三平台completed/success，应用提交
  `1c50b9fac927afc5d3161270ffa26634c7270826`，三份工件均已下载核对。
- E-038：本机安装Windows CI preview.11，默认监督进程→输入框→/effort
  low确认→/quit，退出0、0模型请求；输入框5,182ms，命令确认6,290ms，总7,805ms（含200ms分离按键与退出等待），不是跨电脑冷启动基准。
- 首次ConPTY同包输入被判为粘贴，分离按键后才实际复现产品竞态，失败记录均保留。最终CLI正常退出后，node-pty观察脚本仍持有管道，已仅停止该观察进程；没有遗留CLI/观察进程或临时用户目录。
- 当前Windows包SHA-256
  `f4ed59f5e7f464feef07bb07ae37dc537b530f50a2cd446cb02ec67976de3771`，Linux
  `9dc45a3aef155edf88a5ebf2a96913045f4072ee6c450268946fc71963fad9fe`，macOS
  `47a5300b67869d9790e2599d827a22f3a0a7ce784401513eed5d9e6030ac2566`。
- preview.11继承已验收的流收尾实现，未重复未受UI改动影响的HTTP/原生工具场景；整体目标仍active。

## 2026-11-10 回复期间命令排队

- F-013：输入框原本禁止普通斜杠排队；底层 App 直接提交 busy 斜杠会被流处理器忽略，队列又会把多条斜杠合成一个参数串。现贯通三个入口，普通斜杠等待空闲后逐条执行，仅相邻普通消息合并；等待每次提交完成，保留清空和错误反馈。
- E-039：队列3个、App busy/compression
  2个、输入框5个定向用例通过；受影响文件严格lint和核心/CLI
  TypeScript通过。未运行全量或冒烟。
- E-040：本地bundle真实Windows
  ConPTY在一次loopback回复期间输入三条命令，按序得到high/en/low确认，最终low/en、仅1次模型请求、退出0，9,791ms。原失败日志保留：早期输入框明确拒绝排队；后续脚本首次Enter只接受补全导致多条文本黏连，修正脚本为分离的两次Enter后通过，未为脚本改动产品补全逻辑。
- 版本推进preview.12，三平台构建和安装后的同场景结果另记；整体目标保持active，复杂真实多Agent任务与长会话仍待验收。

- E-041：[preview.12运行42732399585](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42732399585)三平台completed/success；功能提交178f41e0d792b9b634046f2cc2522fae8bc24717。三个工件的版本、平台及SHA-256下载核对通过。
- E-042：本机两个命令安装Windows CI
  preview.12，入口与工件一致；同一完整ConPTY场景三命令按序high/en/low、最终low/en、仅1次loopback请求、正常退出0，总9,794ms（含启动/模拟键入/回复/退出）。
- Windows包SHA-256
  `6f813afb1ea8370608d5a50984ee2f8c1cf572d74de36b90fd524432040c9964`；Linux
  `8ae417613df6a4bbf429e2ef5d4614311663678328dd02a136cbee9bd73113a8`；macOS
  `3a4b4084c757f4c2a4c27864014e2296b46d7a8c145b250d731c28234a9c374f`。
- 本轮没有主分支合并或正式Release，没有真实供应商调用。原生三平台链沿用未受改动影响的既有证据；下一阶段聚焦复杂真实任务和长会话，整体目标active。

## 2026-11-10 子 Agent 执行限制与阶段总结

- F-014：TIMEOUT/MAX_TURNS后的最后一轮原本会把阶段总结改记为GOAL；这一轮还可执行工作工具，取消也可能被旧限制状态覆盖。现保留中断原因与部分结果，摘要带中断标记；最后一轮只允许complete_task，用户取消保持ABORTED。仅协议漏报的补交仍可正常完成。
- E-043：七个定向用例通过，覆盖轮数、正常/抛异常超时路径、最后一轮取消、额外工具阻断、协议恢复对照及摘要/遥测。原六项修前5失败1通过，额外工具用例另行修前失败，失败日志保留。核心/CLI
  TypeScript与两个受影响文件严格lint通过；未运行全量或冒烟。
- E-044：已安装preview.12在隔离配置下运行三个真实本地子Agent、七次loopback模型请求：正常reviewer成功；受轮数限制的researcher误记GOAL；coder最后一轮确实写入了临时文件。退出0但验证不通过，1,733ms，原记录installed-preview12-agent-limits-isolated-before-result.json保留，临时文件已清理。这不是实际供应商或复杂逆向任务验收。
- 首次默认监督入口观察在发出HTTP请求前连接loopback超时（0请求），未用于证明当前缺陷；改用无重启的实际CLI进程后取得上述基线。该监督入口现象单独保留待查，不能写成已修复。
- 版本推进preview.13，等待三平台工件与安装后同场景结果。整体目标保持active。

- E-045：[preview.13运行42734023367](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42734023367)三平台completed/success，功能提交3dc72db73b748dc897c2ccbd7c3c82c6f8e6d2db；三份工件的版本、平台和SHA-256下载核对通过。
- E-046：本机两个命令已安装Windows CI
  preview.13，入口与工件一致；同一三Agent场景2,189ms通过，正常任务GOAL、限额结果MAX_TURNS/FAILED且保留部分发现，超限文件未创建，7次loopback请求、退出0。默认监督入口单独复核1,760ms也通过；此前0请求超时原因未知，未将成功复核表述为网络根因修复。
- Windows包SHA-256
  `d2878db3258e047b4685b6a81706ceafa4aff2881294cee3a903526fdc72de5c`；Linux
  `6c7ee252d3b9b72500d820c20ea030d9827f2bde8afa06a4c30f89ed74fda7fa`；macOS
  `8d994d5eaadc51503f04a6231302b989a84d9280bcf9eac87af0afcacbb60354`。
- 下一阶段：核对安装包搜索性能。当前安装CLI提示Ripgrep不可用，源码发布脚本未见vendor/ripgrep拷贝；需确认实际工件、各平台二进制来源和解析路径，再修复，不扩大系统PATH信任范围。复杂真实逆向、多Agent长任务及长会话目标仍active。

## 2026-11-10 搜索二进制分发缺口

- F-015：源码有Ripgrep二进制，发布脚本未拷贝，安装后提示不可用并回退搜索。preview.13安装目录缺少bundle/vendor/ripgrep，定向核对记录installed-preview13-search-before.log；这是工件缺失，不是仅PATH设置问题。
- 现发布包带六个平台/架构的官方Ripgrep15.2.0二进制、清单和许可证。构建核对二进制SHA-256，并将最终tgz中可执行权限固定为0755，避免Windows打包后Unix无法执行。运行时不增加下载、哈希扫描或扩大PATH信任。
- 官方六份档案均已对照GitHub公布digest及各自.sha256核对；解出的二进制哈希写入清单。来源证据ripgrep-15.2-source-verification.json。维护下载脚本改为按固定清单恢复并验证档案和二进制。
- 三平台既有安装链加入一次真实grep_search：检查清单与全部哈希，执行本机rg，再通过实际CLI搜索生成文本；不增加全量或冒烟测试。版本preview.14，构建和安装最终结果另记。
- E-047/048：preview.13工件缺失已确认；官方15.2.0六档案及二进制来源核对通过。本地完整preview.14打包完成；424个tar条目的文件内容哈希与权限处理前一致，六个原生文件mode=0755。暂存bundle实际CLI搜索链通过，5次loopback请求、4工具成功、2,578ms，无Ripgrep回退；该项不是npm安装证据。首次异步tar重打包在Windows以未完成await退出，改用同一tar公开同步API后通过，原日志保留。

- E-049：[preview.14运行42736463249](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42736463249)三平台completed/success，功能提交6a6c2ef38821787bdca8cc8e6c1c5967d1f57416。各平台实际rg15.2.0和CLI
  grep_search通过，5次fixture请求、4工具成功；三个工件内六个二进制的hash和0755权限均核对通过。
- E-050：本机两个命令已安装Windows CI
  preview.14，入口与工件一致；同一完整CLI搜索/分析/归档链通过，2,625ms，无Ripgrep回退。npm安装本次约2分钟，日志明确PTY依赖请求网络重试后用缓存，不与上述工具链耗时混淆。
- Windows包SHA-256
  `4edd59a76a750f9388b63736d3a71803b2f35710cdffe283482290e23a4ab4bf`；Linux
  `552c1f5dd691d4282411262e5d16b3791c59d18f3f2a0fe0ec8446cdc9767f53`；macOS
  `fa8b5d60a75f09e09ad18843223c726c2d85393f48654a1e1cc727b28925a10d`。
- F-015搜索分发已完成本轮修复；仅Windows x64/Linux x64/macOS
  arm64取得实际搜索运行证据，其他三种架构为官方文件与hash核对。下一阶段推进复杂真实多Agent任务及长会话，目标继续active。

## 2026-11-10 真实协作、压缩恢复与连续工具链

- E-051：preview.14当前Ess/DeepSeek真实服务，三个角色审查四份运行时源码副本并均以GOAL返回；自主父代理在两个4分钟观察窗口内仍追加检索，未完成报告，原失败记录保留。人工收束为写报告/归档后交付；不能记为无需介入的全自动收尾通过。
- 从检查点导入会按设计创建新sessionId；随后在同一新ID下两次原生--resume通过。强制低阈值压缩后和再次重启后，随机会话代码、原审计范围和报告路径均保留，两阶段均0工具调用。压缩请求有1次响应头超时，自动重试成功，原错误保留；不是长时间压力验证。模型审计草稿中的候选另行人工复核，不能作为已验证漏洞。
- F-016/E-052：单个用户任务连续工具调用时，旧切分器只找下一条用户文字，导致有完整旧工具组也一直NOOP。现允许在已闭合工具组后切分，保留近期调用/响应及角色顺序；2项修前失败，修后13个相关边界/压缩用例通过。已安装preview.14的HTTP同场景也不压缩、不移除旧负载，失败基线保留。
- F-017/E-053：真实审查提出的并发动态下调候选，经人工追踪和定向用例确认：已有会话等待队列在释放时沿用旧上限。现每次drain读取当前额度，释放旧槽位不会越过新额度；修前失败记录runtime-limit-before.log。
- F-018：真实协作每个子代理都打印complete_task重复注册。子代理现在跳过继承父完成工具，仍注册自己的强类型完成定义；两个既有声明用例通过，不新增低影响测试。
- preview.15准备分发。长期自主收尾、更多供应商与复杂逆向范围继续留在目标池；不重复已通过且未受改动影响的真实模型/原生工具场景。

- E-054：子代理完成工具声明的两个既有用例通过，F-018从父注册表跳过继承、仍注册本代理专用schema；受影响模块严格lint、核心/CLI
  TypeScript通过。本轮合计仅16个相关用例，无全量或冒烟。
- E-055：[preview.15运行42747619687](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42747619687)三平台completed/success，功能提交be2110992343cb9b1aef79cd6102b98196a3ee77。三个工件版本、安装报告、SHA-256与rg文件hash/mode核对通过。
- E-056：本机两命令已安装Windows CI
  preview.15，入口匹配；连续工具任务实际CLI/HTTP场景通过，3次主请求、2次压缩请求、2,906ms，旧负载移除且最新结果/调用配对保留。修前preview.14同场景0次压缩，原记录保留。用量是fixture阈值触发，不当作百万Token或真实模型准确率验证。
- Windows包SHA-256
  `b6dd624041d04943b6a1cbff2c3b50714fb72b343654a9312c906cec232e47d2`；Linux
  `13cf7b9fd7d64fdd7c4454c90bbf23d836dd1f7190c4e329f904d87cc3aad0ea`；macOS
  `7d0b3872a3161e1a88a9fd4286b002a585d9b7a9ffea21b03cba94e14c97eaf5`。
- 本机已有缓存离线安装11秒，三平台默认隔离安装另有CI证据；不承诺新电脑无缓存离线安装。下一阶段继续完整任务自主交付，不能用人工收束后的压缩恢复成功替代该项。整体goal保持active。

## 2026-11-10 协作结果交接

- F-019/E-057：批次工具原先再次JSON序列化子代理Part数组，产生多层转义；现在优先使用结构化执行结果，解开内置单字段response包装，向父代理提供可读文本、每项状态和完成/失败/取消数量。额外JSON字段与非文本Part保留，中断原因和部分结果保留，统计语义不变。
- 三个定向用例修前失败、修后通过；四个受影响文件严格ESLint、核心/CLI
  TypeScript通过。没有全量或冒烟检查。
- 协作提示增加整合交付与复用证据；只读角色不得将快照缺少依赖当作产品缺失。这是交接改进，不据此宣布父任务自主收尾已修复。
- E-058：preview.16开发bundle、当前Ess/DeepSeek真实服务，八份源码副本、三个真实产品Agent、并发2；researcher/reviewer超时失败，redteam-analyst以GOAL完成并归档note。父代理保留正常工具权限，自行补查并写出报告（距会话开始474,530ms），但480秒观察器终止前无最终JSON，整体验证仍未通过；不能称为交付后卡死或正常收尾已通过，也不是旧四文件任务的严格速度对照。
- 会话、源码快照、报告及原失败JSON均保留。原JSON的subagentsRan=false因最终统计缺失，已另用三份子会话和实际批次结果证明真实执行；不覆盖原记录。笔记清理前SELECT成功，保存主库漏WAL、没有note表，不可作为可重放数据库证据；后续观察脚本改用SQLite
  backup，未重复真实任务。
- 模型报告的混合批次总error、协议补交和取消后worker回调候选经人工复核均属既定语义，不认定为新缺陷。对象形式工具注入仍待核实。另发现真实timeout抛普通Error而恢复分支仅识别AbortError，下一阶段定向追踪，不先宣布根因成立。
- E-059：[preview.16运行42754395069](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42754395069)三平台completed/success，功能提交4ccc2c6423ddf0e9a16b997cf8c782a63cd59530。版本、安装报告、三个包SHA-256与内置六个rg文件hash/0755核对通过。
- E-060：本机两个命令已安装Windows CI
  preview.16，入口SHA-256与工件一致。一个成功/一个HTTP400失败的实际CLI协作交接通过，4次loopback请求、3,948ms、退出0；父代理收到1
  completed/1 failed/0
  cancelled、未多层转义的多行结果、GOAL与失败原因。模型响应为fixture，无重复付费模型/压缩/原生链检查，没有全量或冒烟。
- Windows包SHA-256
  `bf3abb8561ff88d9ad1122010093ba08bb7c376244ccabd5865d283d4c64a062`；Linux
  `88cc49fcef52fdb1a5fe3dd95e2a6a39da49cf1ec5da54d2b57aa44438fc1287`；macOS
  `57f276257ee988298c5e04bb17d0e2e24d2e6602d74bf5566646207967f073ad`。本机已有缓存离线安装12秒，不代表无缓存新电脑可离线安装。整体目标保持active。

## 2026-11-10 真实deadline与对象工具边界

- E-061/F-020：DeadlineTimer的abort携带普通Error，fetch可原样拒绝该reason；旧runInternal只识别AbortError，跳过TIMEOUT阶段总结。四个定向对照修前1失败3通过，preview.16已安装实际fetch场景也不发总结请求、只返回普通错误（4,999ms，失败基线保留）。现在识别定时器的同一reason对象或AbortError，仍要求内部deadline已触发且非用户取消；不吞掉无关错误。总结保持TIMEOUT/FAILED和部分发现，不升级成功。14个恢复/超时相关用例通过。
- E-062/F-021：可信程序化工具实例分支原先只排除complete_task，漏过Kind.Agent和update_topic，而名称分支已过滤。一个定向用例修前失败；现在共用过滤条件，保留浏览器显式实例与状态，不强制克隆。4个相关实例/声明/执行用例通过。此为递归与父会话控制规则的一致性修复，未宣称外部可利用漏洞。
- 两个受影响文件严格ESLint通过；核心/CLI
  TypeScript在deadline修复后通过，最终三平台构建亦完成新增对象过滤改动的类型构建。共18个选定用例，没有全量或冒烟。
- E-063：preview.17开发bundle、当前Ess/DeepSeek、八份只读副本、三个产品Agent/并发2，633,710ms自行结束，未触及720秒观察器。researcher/redteam-analyst
  GOAL，reviewer TIMEOUT，父代理准确收到2 completed/1 failed/0
  cancelled；该超时的总结没有成功捕获。父模型最终INVALID_STREAM（只有思考、无最终正文），无报告、整体失败；CLI却退出0（F-022待修）。35次API请求、57工具调用，均有最终统计；不作旧版速度对照，不把退出0当成功。
- 会话、源码快照、原失败结果和一致性SQLite备份已保留；笔记在清理前查询成功，保存库亦重开查到note表及一条记录。不覆盖preview.16漏WAL的旧证据。下一阶段先用fixture追踪错误退出码、核对已有thinking-only重试/nudge路径，不重跑整套付费任务。
- E-064：[preview.17运行42756282770](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42756282770)三平台completed/success，功能提交1b52d4217e1d2fb763d4645f69b77921fea92e7e。三个包版本/安装报告/SHA-256、六rg
  hash/0755核对通过。
- E-065：本机双命令preview.17、入口与Windows
  CI包一致。实际fetch等待响应头直到deadline的场景得到5次loopback请求、9,818ms、退出0，发起总结且保留TIMEOUT/FAILED与完整部分发现。最初脚本将JSON包装的部分结果误按裸多行文本匹配，原false结果保留；单独解码同一捕获的内置response结构后所有语义断言通过，没有重跑CLI或模型。不是新一轮真实模型验证。
- Windows包SHA-256
  `55b704db9c4a59a07fe1ec3cbd81ca8aacc1a1dde6216168511240609c9b598e`；Linux
  `3b29d231773c154b4a12afc12c9143c0f73225927dd4ad2584cbae23b367eaa0`；macOS
  `97b464dd6cacbe03905ade045672d4d7e084753ba02aa0e9d5642324877bc986`。本机已有缓存offline安装26秒，不代表无缓存新电脑离线安装。整体目标active，完整上线仍未验收。

## 2026-11-10 无正文错误与退出状态

- E-066/F-022：两个非交互路径的InvalidStream原先只输出错误；主入口又无条件将exitCode重置为0。现错误分支设置非零退出状态，主入口仅在未设置状态时默认成功，保留现有错误输出及异步清理。八个既有TEXT/JSON/stream-json与自定义错误用例新增退出状态断言后，修前8失败、修后8通过；五文件严格ESLint、格式和核心/CLI
  TypeScript通过。
- E-067：开发bundle七个实际CLI/HTTP场景完成定向核对：三格式持续thinking-only、ADK持续失败、默认监督入口失败均退出1；普通与ADK恢复场景均在既有重试/nudge后真实write_file落盘并退出0。请求次数分别2与3（general.maxAttempts=2），证明本地有界重试，不是实际供应商长任务验收。
- 首次七场景里5通过，两个在连接本地端口前ETIMEDOUT、0请求；仅这两项改用固定空闲端口45679复核通过，原false记录保留，不宣称修复本机网络根因。preview.17基线另有一次重试前TypeError及Windows
  CRLF被脚本误按LF匹配，原记录亦保留，未用其推断产品没有重试。
- E-068：[preview.18运行42758828025](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42758828025)三平台completed/success，功能提交9a4c4628767afcc7dd6d1f9c225699f4b713a702。三个包的版本、安装报告、SHA-256及六个rg文件hash/0755核对通过。
- E-069：本机双命令preview.18、入口与Windows
  CI包一致。安装后两个重点实际CLI/HTTP场景通过：持续无正文2请求/3,036ms、JSON明确INVALID_STREAM、退出1且无伪造产物；首次无正文后既有nudge重试到write_file，3请求/2,590ms、实际文件落盘、最终正文正确且退出0。general.maxAttempts=2为隔离验证配置，不是修改产品默认重试策略。
- Windows包SHA-256
  `9348630f2b3cf8eed640bb2002b8932599bd42733831a69d68f83e807370347e`；Linux
  `249d47afcb5b810a21ce28db990f237e371f2a985b9f34242e261118e8e0caae`；macOS
  `7252e931a07ff66d2061d870b7219be913c5b179d1e57495cc79b7dff2675e7b`。本机已有缓存offline安装14秒，不代表无缓存新电脑离线安装。本阶段没有重跑E-063整套付费任务；真实完整交付与复杂逆向仍未完成，整体目标active。

## 2026-11-10 原生恢复与流式终止标记

- E-070：preview.18已安装CLI恢复原隔离目录、八份原源码快照、原会话与一致性笔记库，原生--resume保持442e90eb-db6c-4ebd-b6ca-b10843721b53，未导入新ID。358,103ms自行结束，未触及480秒观察器；8次主请求、0新子代理请求，仅补读一文件，原笔记1条未重复、源码及用户供应商配置未变，checkpoint原始前缀保留。仍因thinking-only
  INVALID_STREAM未生成报告，退出1正确；恢复连续性有证据，交付仍未通过。原数据全部保留，不用恢复机制成功掩盖报告失败。
- E-071/F-023：人工追踪发现OpenAI
  Chat/Responses/Anthropic中间思考和文本块都被builder标为STOP。现中间块不带finishReason，协议真正结束后才发送一个包含完整工具调用和尾部usage的终止块，即使只有正文、没有usage也显式结束。三个协议×有/无工具的6个定向用例修前失败；修后加原固定尾部deadline和截断恢复对照共8项通过，受影响两文件严格lint与核心/CLI
  TypeScript通过。
- 开发bundle实际HTTP场景通过：思考→多段正文→分片write_file参数→工具结果→多段最终正文，两次请求、2,177ms、退出0，文件实际落盘、usage保留、没有误触重试。此为协议适配修复，尚未证明它是E-070真实thinking-only的根因；本阶段没有继续重复付费恢复任务。
- E-072：[preview.19运行42761930268](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42761930268)三平台completed/success，功能提交07173eb57df0a5f686bf62aa10beb338fa32554b。三个工件版本、安装报告、SHA-256及六个rg文件hash/0755核对通过。
- E-073：本机双命令preview.19、入口与Windows CI包一致。已安装OpenAI Chat HTTP
  fixture上述分片链通过，2请求/2,149ms/退出0，真实落盘、最终正文及usage完整、无重试。使用deepseek/deepseek-v4.1-flash模型名称但端点为本地fixture，不是真实服务。观察到两次默认主请求均未发送显式max_tokens/max_completion_tokens；供应商默认上限是否导致无正文仍是假设，后续先核对输出预算及实际终止信息，不凭此直接归因。
- Windows包SHA-256
  `2b5d433cc3d1717b68fde6bed314e0166569900c9c34120bcd80b6450586d0d3`；Linux
  `76df20ebecb8c10e471c3a39e6922fd311bfb578b3a772b708891f54f47520a6`；macOS
  `ca340b7731f51ab732ba130159263c7d8cfe5c4ce577164c3bf72c6a4dca172a`。本机已有缓存offline安装11秒，不代表无缓存新电脑离线安装。完整交付与复杂逆向仍未验收，整体目标active。

## 2026-11-10 可选输出上限

- E-074：新增按供应商保存的 maxOutputTokens 和 /provider「输出上限」菜单。留空沿用现有默认，任务显式上限优先；普通参数编辑及演练台保存未传此字段时保留旧值，明确 undefined 清除。严格校验正安全整数，拒绝非法值时内存与原文件不变。两个公开生成入口统一注入，不改变四协议的参数命名与既有 Anthropic 推理预算。
- 12项必要定向检查通过，覆盖保存/重载/保留/清除/非法值，以及四协议、Chat两种Token参数、流式/非流式的默认和覆盖行为；六个改动TypeScript文件严格lint、核心/CLI类型构建通过。首次两个Anthropic断言把现有高强度默认24192误写为8192，已修正检查预期，产品默认未改。原检查日志保留。
- 开发bundle的实际Windows
  ConPTY输入通过：打开菜单、0就地报错、32768保存、重开读回、留空清除、正常退出，10,789ms。没有模型请求；不新增首次供应商创建步骤、不做全量或冒烟。
- preview.20分发与安装尚待本阶段后续核对；真实thinking-only是否与输出预算有关仍未证实，不根据本地参数检查宣布真实交付修复。整体目标active。

- E-075：preview.20运行42764054577三平台success，功能提交1f98705a6ebc6be9dde5a036d3d4dc8527644d6e；独立构建/安装报告/工件SHA与六rg
  hash/0755核对通过。
- E-076：本机双命令preview.20，入口8e7153b32b4d37eaafb3bc961a3dcce99d57333b98ac43721be8b9600c762ebc匹配Windows
  CI包，已有缓存offline安装9秒。安装后实际HTTP工具链2请求、2,566ms、退出0，均发32768、分片write_file落盘、正文与usage完整、无误重试；响应为fixture。
- E-077：仅一次当前Ess/DeepSeek原生续接，使用E-070最新会话/数据库和E-063源码快照，隔离配置32768、maxAttempts=2、maxSessionTurns=8、240秒观察器。167,219ms自行结束、退出1、INVALID_STREAM，无报告；4主请求/0新子代理/1成功read_file。会话同ID与字节前缀、原note整行、源码和用户配置保留。总Token195,654，其中缓存46,080，非账单金额。
- 四个真实请求参数均为32768、HTTP200，返回思考长度2072/4188/5178/3969，正文长度全部0；仅第二个有tool_calls结束原因，其他未提供finish_reason。未保存原始网络流或盘点DONE，不断言模型/供应商/超时/适配器根因。提高上限未解决真实失败，停止原样重复付费续跑；下一阶段离线定位流终止与timeout链。交接已写源码docs、工程目录和Obsidian，整体目标active。

## 2026-11-10 心跳导致流无限等待

- E-078/F-024：readSse原先每次reader.read成功都重新给足idleMs，注释心跳可使尚未完成的模型流无限等待。定向修前两个场景失败、持续数据场景通过；现进展deadline仅由完整非心跳SSE数据事件刷新，忽略注释及ping/heartbeat/keepalive命名事件，保持完成后固定尾部deadline。
- 修后5项定向检查通过：无数据/部分思考后持续心跳会超时，持续有效数据可跨越多个idle窗口，尾部keepalive不延长用量等待，截断后后续请求可恢复。本阶段没有付费模型调用，未证明F-024是E-077真实无正文的根因。
- 离线追踪确认model.requestTimeoutMs通过updateGlobalFetchTimeouts只改headersTimeout，bodyTimeout保留既有值；不能把E-077三次约48秒的正常HTTP流结束归因于该45秒设置。真实响应根因仍未定位。
- preview.21分发与安装待本阶段后续完成。整体目标active。

- E-079：preview.21运行42765709416三平台completed/success，功能提交0dccf3aa79663c96faabb396aace0efae0bb6877。三个工件版本、隔离安装报告、SHA-256与六rg文件hash/0755核对通过。
- E-080：本机双命令preview.21、入口3c770160bc7f7698fc2ca6a86e9d2f8a30f263bbe91a71e446dbc2e6d18d2c6c匹配Windows
  CI包，已有缓存offline安装10秒。实际ConPTY/HTTP同进程：持续ping/注释在1秒配置下1,079ms触发可见错误、原连接在后续请求前关闭；用户带标记的下一提问收到完整响应，正常退出0，2请求/9,526ms/未触及观察器。模型为fixture。
- 已安装preview.20同故障基线在9秒观察器终止前无超时提示，原passed=false保留；其ConPTY被终止返回0不算成功。F-024独立缺陷有修前/修后证据，不认定它是E-077真实无正文根因。无新增付费调用；下一阶段离线核对超时/断连恢复分类与取消清理，仍不原样重跑真实任务。交接已写源码docs、工程目录和Obsidian，整体目标active。

## 2026-11-10 外接请求取消与HTTP状态

- E-081/F-025：readSse清理原先等待reader.cancel，底层取消不结束时完成路径可被阻塞；只取消读取器也不能保证fetch响应副本关闭。四协议现在各有请求内部AbortController，与调用方signal组合，结束/错误时终止该请求并尽力取消、释放读取锁，不等待不受控的cancel
  Promise，也不反向abort调用方。
- 四个取消清理用例修前失败；修后与六个HTTP入口及原尾部/截断恢复共12项定向通过，严格lint/格式和核心/CLI类型构建通过。已安装preview.21实际DevTools故障基线证实可见错误及后续提问仍可完成，但原HTTP连接未在后续请求前关闭；9秒观察器触发和AttachConsole辅助错误均保留，不把它夸大为整个终端无响应。
- F-026：六个HTTP入口只抛普通Error文本，status丢失，使既有重试器无法识别429/503。六入口定向用例修前失败；现保留status、沿用现有策略与次数，400仍不重试。旧preview.21已安装实际HTTP503恢复场景只发1请求就退出1，原失败基线保留。
- preview.22分发与安装后确认待本阶段后续完成；本阶段没有真实模型调用，不将两处独立修复当作E-077无正文根因。整体目标active。

- E-082：preview.22运行42767446602三平台success，源码a6305d075377ee1b59f7c75d7fc6e7bbf0fc1753，三个工件版本、安装报告、SHA和六rg
  hash/0755核对通过。本机双命令preview.22与Windows工件匹配，offline缓存安装10秒。
- E-083：已安装preview.22启用真实DevTools日志分支（127.0.0.2、活动头可见）的HTTP心跳超时场景通过：1,079ms报错，原连接在后续提问前关闭，同终端下一提问成功并正常退出0，2请求/9,866ms，观察器未触发。HTTP429→200恢复通过；503→200在127.0.0.2复核2请求/2,601ms/退出0。首次503恢复0请求ETIMEDOUT原记录保留；400仅1请求并返回结构化错误/退出400，脚本误按退出1且只从stdout解析，修正检查契约，不改产品来迎合断言。
- F-027：持续503场景两次在输出完整错误JSON后触发Windows libuv
  UV_HANDLE_CLOSING断言、退出3221226505；其中一次127.0.0.1复核仅收到1个HTTP503，不能作为严格2请求场景通过。原失败均保留。错误收尾仍直接process.exit，绕过既有自然排空路径；非交互两入口现用reportError保留错误输出和exitCode，重型入口catch亦在清理后设置exitCode，保留5秒清理超时的兜底。
- E-084：19项选择用例通过，覆盖JSON/stream-json报告不强制退出、旧即时错误包装行为和两个非交互入口的普通/结构化/自定义退出码；受影响文件严格lint、格式及核心/CLI类型检查通过。首次六个旧用例仍要求process.exit，迁移预期后通过，原日志保留。开发bundle持续503实际JSON场景2请求/2,890ms/退出503，TEXT场景2请求/2,472ms/退出1，均无原生断言；不推断所有Windows原生退出异常都已修复。等待preview.23三平台及安装后重点核对。

- E-085：preview.23运行42769345563三平台completed/success，功能提交08665e45ff97515b284a180d7ebbbc6e80ad0298；版本、安装报告、三个包SHA及六rg
  hash/0755核对通过。
- E-086：本机双命令preview.23，入口38478ccfd5e012b6d279154f8a576209c1283b242e76fdc220acfaa8ba772d23匹配Windows工件，已有缓存offline安装10秒。安装后持续503三格式分别JSON
  2请求/3,116ms/退出503、TEXT 2请求/2,495ms/退出1、stream-json
  2请求/2,544ms/退出503，输出完整且无原生断言；400仅1请求/1,458ms/退出400，错误码保留。均loopback
  fixture、maxAttempts=2，无付费调用，不声称各平台所有原生错误路径均已验收。
- F-025/F-026实际DevTools取消与429/503成功恢复证据对应preview.22，相关实现保留在preview.23；未重复未受改动影响的场景。F-027原始Windows断言与检查脚本首次假设错误、0请求ETIMEDOUT均保留，不用最终通过覆盖原失败。交接写入源码docs、工程目录和Obsidian。
- 下一阶段优先结合本地DSH-purge参考及保存会话，离线重建E-077最后请求的角色/工具交接载荷，寻找明确兼容性差异，不盲目重跑八文件付费任务。真实thinking-only、复杂逆向与完整自主交付仍未验收，整体目标active。

## 2026-11-10 DeepSeek推理续接

- E-087：使用生产JSONL加载器、GeminiChat恢复及公共Universal入口离线重建E-077历史部分：32条会话消息、31个历史turn、41个Chat消息，23调用/23结果配对、无重复/孤立ID；原文件SHA保持。保存了747个思考显示片段（41,942字符），出站reasoning_content为0。未获得原始system/tools/retry请求，不能声称完整HTTP逐字重放。
- 本地DSH-purge
  1.1.71/core.js的69/72补丁面向宿主系统提示历史，不含通用reasoning_content适配，不执行宿主补丁。DeepSeek官方Thinking
  Mode文档明确携带tools的后续请求需要完整推理回传，第三方网关兼容性存在差异；这确认一个独立契约缺口，不证明它是E-077的根因。
- F-028：Chat适配器现给可续接原始推理加供应商/端点/协议/模型绑定标记，核心仅对成功回合保留原始内容及空白，持久化和原生恢复保留；携带tools且同绑定时通过reasoning_content回传。普通思考摘要不冒充原始数据，原生Gemini请求剥离外部标记及数据；关闭和无tools请求不回传。/provider新增自动/启用/关闭，自动识别DeepSeek；未改创建供应商流程，旧编辑保留配置。恢复UI使用明确displayContent（含空串）避免把传输思考标记当正文。
- E-088：10项必要选择用例通过（6协议/存储与绑定、2显示、2签名清理），受影响文件严格lint/格式及核心/CLI类型构建通过。已安装preview.23基线在write_file后第二请求因缺少推理字段被本地协议fixture拒绝，退出400，失败原文保留。
- 开发CLI实际HTTP四请求通过，5,634ms；首次write_file后同ID
  --resume再read_file，所有已知assistant原始推理逐字回传、4份原始内容落盘，最终正文未混入思考。thinking-only对照2请求/2,935ms仍退出1/INVALID_STREAM、无文件且不提交无效思考。实际ConPTY中英菜单三档保存/重开/语言切换通过，10,799ms。均fixture，无付费调用。等待preview.24分发与安装后核对；整体目标active。

- E-089：preview.24三平台运行42773610840全部success，功能提交719c8a93ba26d3df91441635f028731451a65dc1；三个工件版本/安装报告/SHA及六rg
  hash/0755核对通过。
- E-090：本机双命令preview.24，入口01006cf67216c202596505453276b196a06bad0ba867741681232d45e57887d1匹配Windows工件，已有缓存offline安装12秒。首次fixture恢复连接前ETIMEDOUT、0个恢复请求，原false保留；仅该场景新记录复核4请求/4,767ms通过，同ID与4份原始推理精确保存、后续回传1/2/3个assistant推理通过。
- E-091：当前真实Ess/DeepSeek新隔离会话read_file→write_file→最终回复，3请求均HTTP200、17,974ms自行结束/退出0，内容一致；第三请求回传1个assistant的55字符推理获接受，实际供应商配置hash未变。仅隔离maxAttempts=2/maxSessionTurns=6/输出8192，90秒观察器未触发。观察器响应clone的AbortError来自正常清理，不判为上游截断，也不把未完成观察的数字0当真实用量。
- 本阶段交付preview.24，真实短工具链兼容性通过；E-077原长任务失败仍保留，旧摘要不能补造原始推理。下一阶段先利用已保存子结果离线收束/检查载荷，必要调用有界，不重跑旧八文件整套付费任务。详见docs/ultra-preview24-handoff.md；整体目标active。

## 2026-11-10 外接上下文容量

- E-092/F-029：外接模型上下文预算原先统一沿用未知模型1,048,576且无容量配置。新增按供应商保存的可选contextWindow，严格正安全整数校验，省略保留/显式清除、失败不改内存或文件；/provider第11项可编辑，中英文，退出移至12项，不增加首次录入步骤。
- tokenLimit通过当前ContentGenerator的可选容量能力读取实际路由；不引入全局磁盘读取或猜测模型容量。主Agent、子Agent、自动压缩、上下文超限、工具输出预算、用量显示和模型列表共用；Logging/Recording包装器透传。未配置沿用旧默认，不将本地容量字段发送API。此为独立预算缺口，不证明E-077根因。
- 10项必要选择用例通过：配置/路由/包装3、实际压缩阈值1、界面2、模型列表4。原界面检查的精简Config缺getSessionId导致失败，改用完整fakeConfig后通过，未修改产品适配错误mock。
- E-093：preview.24已安装基线不识别容量、未压缩（4请求/4,289ms），原记录保留。开发实际CLI复核6请求/3,195ms，同ID恢复的read_file后按60,000/100,000容量触发两次摘要，快照落盘并继续最终正文，文件正确，字段未发送API。首次开发场景恢复首请求把模拟用量降成1000，未触发阈值；修正fixture的用量保持条件，仅重跑该场景，原false保留。
- 真实ConPTY上下文容量0就地报错、100000保存/重开、切换中文、清空恢复默认、正常退出通过（14,906ms），无模型任务。不是长任务或真实压缩内容质量验收。本阶段无真实模型调用，等待preview.25分发与安装后重点核对；goal
  active。

- E-094：preview.25功能提交3cca4cb691f827b6cf86129ce0b1a17e9574070b，运行42776699623三平台completed/success，三个工件版本/安装报告/SHA及六rg
  hash/0755核对通过。
- E-095：本机双命令preview.25，入口f29b03b70a2a865576132bb34f636f860977e51d8f898e4ca0244e115aac9a95匹配Windows工件，已有缓存offline安装12秒。安装后6请求/3,929ms同ID恢复/read_file后自动压缩两次摘要、快照持久化并用于最终请求通过；文件与正文正确，无额外API容量字段。均fixture，没有付费模型调用。
- 受影响文件严格ESLint、格式及核心/CLI类型构建通过；交接写入源码docs、工程目录和Obsidian，goal
  active。WI-048原长任务交付继续未验收；不以本地压缩流程通过替代真实摘要质量和复杂逆向。

## 2026-11-10 有界压缩续接与取消分类

- E-096：preview.25当前真实服务原生恢复E-077同ID、原八份源码和一致性笔记库，隔离容量64000/阈值0.5/输出8192，180秒观察器结束进程，180,185ms，无最终JSON/报告。前两次非流式压缩请求明确UND_ERR_HEADERS_TIMEOUT，来自隔离45000ms响应头设置；第三次HTTP200/36,703ms返回7,566字符首轮摘要，复核未完成，未持久化新快照。不把观察器截止当CLI自行崩溃。
- 原checkpoint前缀和SHA不变，保存会话header保持原ID，原note整行比较一致、源码及真实供应商配置未变。原aggregate因缺最终JSON将sameSessionId/twoCompressorRequests置false，独立analysis从保存数据核实会话连续性；不将缺统计解释为未开始复核。general.maxAttempts=2仅限制主聊天，工具性BaseLlmClient默认5次，非全局2请求上限。已完成响应报告32,528
  Token；超时及在途请求用量未知，不按0计费。
- E-097/F-030：复用原researcher的Aborted子串候选，在当前两个本地调用入口确认普通Error文字含Aborted会误发CANCELLED并抛出。2个定向对照修前失败、正常错误2项通过；现按调用方signal.aborted或标准AbortError分类，错误正文不触发取消。批次catch有独立分类，不据此宣称旧批次完成/失败数量错误。
- 默认重试策略、原超时/取消终止原因未改；有界真实续接失败保留，不再原样重跑。10项必要选择检查、严格lint和核心/CLI类型构建通过；新增取消断言首次缺SubagentState导入，原失败记录保留，补齐后全部通过，preview.26准备交付；goal
  active。

- E-098：preview.26功能提交2b2f348000439251b257f06977539a7cd2215e05已推送；GitHub
  API/TLS与外部状态通道连接失败，尚未取得本次run
  ID/状态，没有重启工作流。本地同提交package:ultra成功，版本/包SHA与六rg
  hash/0755核对通过。不能当作三平台CI工件。
- E-099：两个命令已安装本地preview.26，已有缓存offline安装9秒，424个包内文件逐一与本地工件一致，入口0b7ae4baa69fbc565e71f66fbcc635239048f22d9502f85247776053506dfffb，包SHA
  c5699b1a7d28646f47398ecbc844707378b15e3855b6436eeba045a8de53383d。未重复未受影响的模型流程，不宣称安装后完整子代理运行或跨平台通过。
- F-030必要10项检查、受影响文件严格lint/格式和核心/CLI类型构建通过；E-096真实任务仍无报告，观察器截止而非CLI自行崩溃。源码/工程目录/Obsidian交接已写；继续核对同提交CI和非流式压缩预算，goal
  active。

- 最终文档已在本地提交，推送因GitHub
  TLS失败待重试；功能提交2b2f348000439251b257f06977539a7cd2215e05先前已成功推送。Obsidian已写入最新状态，不因CI未知重启构建。

## 2026-11-10 手动压缩取消与快速模式

- E-100/F-031：手动/compress原先未传入取消信号，后台任务持续占用pending状态；实际已安装preview.26在等待摘要时输入/compress
  cancel，没有释放连接，11,641ms观察器终止，原false保留。
- 新增/compress
  cancel（/压缩 取消），按当前GeminiClient保存手动AbortController并传入核心；仅取消子命令可并发执行，普通压缩继续排队。取消和会话切换后的迟到摘要在应用前丢弃，保护当前上下文。
- 新增/compress
  fast（/压缩 快速）显式单轮摘要，跳过第二轮复核；默认与自动压缩仍保留复核，网络重试规则不变。恢复/compact、/summarize别名，中英提示说明当前模式与取消方法。
- 14项必要选择检查通过（核心5、命令9），受影响文件严格lint/格式与核心/CLI类型构建通过。首次取消检查把mock实施排在旧mockResolvedValueOnce队列后，未实际触发取消；清理该测试队列后单项复核通过。首次HistoryItem新对象的类型错误已按原HistoryItemCompression类型补齐，原日志保留。等待preview.27终端流程及打包安装，goal
  active；没有新增付费调用。

- E-101/102：preview.27同提交本地候选ConPTY真实HTTP链5请求/9,804ms通过，取消连接240ms关闭、原上下文继续提问、fast单轮摘要及后续快照使用成立。CLI退出0后辅助ConPTY进程句柄残留，单独清理并记录，不当CLI挂死；未重复未改动场景。先本地包安装9秒/424文件一致。
- E-103：网络恢复后确认preview.26原运行42778862788三平台success，三个工件版本/安装报告/SHA及六rg
  hash/0755核对通过，没有重启该运行或降级安装。
- E-104：preview.27已安装本地包，当前真实Ess/DeepSeek，原八文件和原会话先产品命令/compress
  fast，再正常同ID续接，73,466ms/退出0/无观察器触发，1摘要请求+2主请求/1次write_file，原报告落盘，无新子代理，原note1条逐行一致、原始checkpoint前缀/源码/真实供应商配置未变。原reviewer
  TIMEOUT如实保留。这是用户式恢复交付，不把原无人介入失败改成成功。已报告用量85,634Token，不等于账单。
- E-104首次终端辅助脚本在resume尚未完成时输入命令，150秒观察器结束、没有压缩请求记录，原false保留；afterNoteRows=0是早退未赋值，独立analysis重开保存SQLite核实原note完整。只修正脚本输入时序后复核，非重复付费审查。模型报告机器检查通过但人工核对发现若干引用锚点错位；原稿保留，docs/ultra-recovered-audit-review.md单独更正。引用准确性未被扩大验收。
- E-105：preview.27原功能提交03c926a3975f4c960c10ff9cd2b8c866f4f7a9ea已推送，运行42865743087三平台completed/success，三个工件/版本/安装报告/SHA与六rg
  hash/0755核对通过；本机替换为Windows
  CI包，offline已有缓存安装6秒，双命令preview.27，424包内文件逐一匹配，入口c819ba34679ccab7e7d8d5f0c9c7466d8c8fa5ec599f6bd2f0edf2f748e3f86b。local包与CI包来源分别保留。
- 目标池维护至E-105；复杂逆向、当前源码完整无人介入协作和自动引用可靠性未完成，goal
  active。后续不再反复续接已交付的旧任务，聚焦实际工作中的剩余能力。

## 2026-11-11 原生函数与指令分析

- E-106：新增binary_analyze静态工具，使用当前电脑PATH或GEMINI_ULTRA_TOOL_R2原生radare2，functions(aa/aflj)、instructions(pdj窗口)、xrefs(aaa/axtj)三个视图；只读/无shell/忽略用户启动脚本和外部插件/不执行样本。数值地址规范化，拒绝命令表达式，30秒/4MiB输出/64MiB样本上限，结果项严格校验/计数/截断，空结果不推断不存在。接入真实注册表、只读子Agent、计划模式和随包local-reverse技能。
- 新增5项必要选择用例通过，受影响文件严格lint及核心/CLI类型构建通过；首次lint三处one-var已格式修正，无实现语义变动。真实r2
  6.2.2读取生成ELF得到两个函数和helper的CALL引用，样本未执行；安装后的完整工具链待preview.28工件核对。静态反汇编不等于反编译或复杂逆向验收。
- preview.28准备三平台构建与安装；本阶段不新增付费模型调用，使用隔离HTTP模型fixture验证真实本机r2与SQLite归档链。整体goal
  active。

- E-107：已安装preview.28实际CLI/native-r2/SQLite链通过（6请求/2,515ms/退出0）：生成ELF的functions、instructions、xrefs三个视图各一次成功，两个函数/常量42的指令/实际CALL引用核实，note写入和查询成功、样本哈希未变。模型仅loopback
  fixture；native执行限Windows x64，无样本执行或付费调用，不作为复杂反编译验收。
- E-108：功能提交eace895008859c4787ffa6033557c1e951db9dce，运行42868353559三平台completed/success，三个工件版本/安装报告/SHA和六rg
  hash/0755核对通过；Linux/macOS本轮未运行新native-r2分析路径。
- E-109：双命令preview.28，Windows
  CI已有缓存offline安装6秒，424包内文件逐一一致，入口59f6a36c271c6b39a09e4b91a004596a4bf36755666e7584247af157afae1f1f。新工具原生链与包身份分别记证据；源码/工程目录/Obsidian交接已写，goal
  active。

## 2026-11-11 新原生分析链跨平台核对

- E-110：新增便携scripts/verify-ultra-native-analysis.mjs和专用工作流，去除作者目录/固定端口，校验原产品run42868353559的源提交/成功状态及工件SHA；在隔离runner安装SHA固定的官方radare2
  6.2.2，再调用已安装preview.28，未重新构建产品。验证分支codex/ultra-agent-native-analysis，脚本/工作流提交77d4cbf6c5939703b98a43f65ba8745fae0ce53e，运行42869801303。脚本语法/格式/lint/YAML检查通过，首次Node全局导入/空catch
  lint错误已修正并保留日志。
- E-111：Linux x64已实际通过，Node24.22.2/native-r2
  6.2.2，6请求/1,425ms/退出0；functions/instructions/xrefs三视图+SQLite笔记写入/查询成功，样本hash不变。报告sourceCommit和包SHA匹配原Linux工件。模型loopback
  fixture，无付费调用，无样本执行，不作跨系统性能对比。
- E-112：macOS arm64原排队任务正常开始并成功完成，Node24.22.2/native-r2
  6.2.2，6请求/1,814ms/退出0；与Linux一样三视图及SQLite笔记写入/查询成功、样本hash不变，原包SHA和产品源提交均匹配。整次run42869801303为completed/success，跨平台证据脚本退出0；三平台新静态分析路径均已实际核对。模型fixture及生成ELF范围不扩大为反编译/真实供应商验收。
- WI-058：Linux成功记录出现cleanup_ops启动遥测生命周期告警，后续离线核对，不据此推断卡顿。本机双命令仍为preview.28，不为本阶段重复安装；整体goal
  active。

## 2026-11-11 后台清理与启动指标

- E-113 /
  F-032：Linux原成功证据中的cleanup_ops两条告警由后台清理晚于startupProfiler.flush结束引起：flush清除未完成阶段，finally再end缺失标记。移除此后台工作的启动计时，保留原清理、catch错误报告及非阻塞语义；不增加启动await，不改变正常阶段指标。
- 受影响文件严格lint、core/cli类型构建、格式和diff检查退出0。低影响删减不新增测试、不跑全量/冒烟、不重跑真实供应商任务或native-r2链。
- preview.29候选准备分发，本机此刻仍preview.28；包与安装结果待记录。完整无人介入协作、引用可靠性和复杂逆向仍待完成。

- E-114：preview.29功能提交d27525b22e405392c260d19ffd599a679afc0924，run42871470118三平台completed/success。三个工件的版本/源提交/SHA/安装报告和六个rg二进制hash及Unix权限核对通过；本次仅沿用分发所需的隔离fixture，不重复实际r2或付费模型任务。
- E-115：Windows
  CI包offline缓存安装7秒，两个命令均preview.29，424包内文件逐一匹配。核对全部49个已安装JavaScript模块，cleanup_ops阶段名称已不存在，实际运行时块保留原清理错误报告。首次只读加载入口的初步记录保留，不作为运行时块结论。
- WI-058本阶段交付完成；当前版本preview.29，三平台原生r2三视图证据来自preview.28，本次工具代码未变、不重复执行。交接与目标池写回源码/工程目录/Obsidian。整体goal保持active，不合并master、不发布正式Release。

## 2026-11-11 Teamwork / Boost / Grill me

- E-116：按Antigravity公开文档概念新增/teamwork、/boost、/grill-me及原生执行链；Teamwork/访谈先只读对齐、草案保存、显式批准，Boost直接调查/实施/结构化独立复核。阶段结果项目级持久化；每里程碑两轮修正上限+最终审查，失败阻塞不伪造完成；取消等待已发起子任务清理后释放工作区锁，已完成里程碑恢复时跳过。共享工作区串行写入，未声称实现隔离Git
  worktree。
- 4个状态机和2个命令用例通过，受影响lint与类型构建通过；不跑全量/冒烟、不调用真实模型。当前本机preview.29，preview.30候选包和已安装协议链待核对；真实自主协作/模型引用准确性仍未扩大验收。

- E-117：原preview.30源17a630f/run42874678575分发completed/failure；新审查员展开Generalist导致toolConfig
  getter在注册表初始化之前求值，实际CLI启动失败。已改为延迟访问；补一个初始化顺序回归用例，5个core工作流用例通过，原2个CLI用例保留，相关lint/类型通过。原失败及两平台日志保留，未将失败包安装到本机。

- E-118/119：preview.30修订run42875429446三平台success；本机Windows
  CI包7秒安装，双命令版本及424文件一致。实际native工作流12请求/1814ms/退出0，5阶段与实际文件/状态通过。辅助fixture曾误用verdict键及Windows
  CRLF判定，原false保留，修正脚本后通过，未改产品或调用付费模型。

## 2026-11-11 Swarm具名蜂群

- E-120：用户追加Swarm，新增独立具名成员、公共追加式留言板、@提及唤醒、原生无模型轮询等待、成员暂停/移除/恢复与实时终端板。共享工作区串行writer/verifier，研究并行；身份运行时分配，不能由模型参数冒充；旧验证随成员新工作失效，未处理成员或缺当前审查不得完成。
- 3项定向语义用例通过；受影响lint/type检查完成。候选preview.31准备三平台新增native-Swarm协议链核对，不重新跑旧r2/真实付费任务。未实现自动Git工作树隔离或跨模型成员配置；目标继续active。

- E-121：离线实际读取复现合法中文Swarm361,483字节/工作流2,405,881字节因读取上限过小无法恢复。修为2MiB/8MiB并保留Schema/总量限制，相同记录修后均可恢复；不调用模型。原Swarm候选run42878996969三平台native链success，最终包改用含此修复的新源提交，不安装已知有恢复限制的旧候选。

- E-122：最终f107ffff5457986fcdc2ad28407e61277b0f0650/run42879834989三平台completed/success；原包SHA/版本/安装报告/六rg
  hash权限及native
  Swarm报告核对通过。Windows/Linux/macOS各20请求，1237/833/1162ms，均退出0，3具名原生执行器、公开身份、实际读写、@唤醒第二轮、当前独立验证和最终完成均通过。模型fixture，不作供应商/生产或性能对比验收。
- E-123：本机Windows
  CI包offline已有缓存6秒安装，双命令preview.31，424文件一致；终端板渲染/刷新/控制符剥离/Esc共1个定向用例通过。四个命令入口已交付；未更改个人模型配置/数据库/逆向工具，未合并master或正式Release。
- WI-059/060本轮原生工作流与Swarm接线交付完成。WI-054真实模型无人介入收尾和引用准确性、WI-056复杂反编译继续；当前不以fixture扩大验收，整体goal
  active。下一阶段从当前小范围真实任务验证开始，不反复续接原旧八文件审查。

## 2026-11-11 真实Swarm与错误交接

- E-124：preview.31实际ConPTY
  /swarm两源码静态报告未交付，229400ms/15请求（9主6coder）；隔离8192上限两次finish
  length且正文0。作者第3轮超出一轮修正约束，观察者主动停止本隔离CLI；原active/working失败保留，非产品自行崩溃。无旧八文件重跑，真实配置/源码hash不变。
- 14个用量响应共276458Token，另1个请求中断用量不完整，不是账单；不自动再次做相同付费审查。源码快照从原Git提交重建并核实hash，脱敏会话和原板保留。
- E-125/F-033：本地执行器将捕获错误放在llmContent，新Swarm/Boost/Teamwork适配器漏读，成员只剩No
  structured
  result。两个边界用例修前失败，统一提取诊断后修复；3项故障/成功门控检查、严格lint/type通过。preview.32候选准备分发和实际离线错误链；自然语言修正次数遵从和真实自主交付仍未完成。

- E-126：preview.32源72ef7ad310ffe5efa6af3c7bea731f6d067b357a/run42884758726三平台completed/success；三个工件/源/版本/SHA、安装记录、六rg权限hash和每平台20请求native
  Swarm正常链通过。
- E-127：Windows
  CI包已有缓存offline安装6秒，双命令preview.32，424文件匹配。已安装CLI一次实际执行器离线长度错误链4请求/1781ms/退出0，原始output
  token
  limit具体诊断进入成员/板/协调者；成员paused且Swarm仍active，不误记completed。没有再次真实调用，E-124失败保留。
- WI-062本阶段错误交接修复交付完成。下一步先完善可执行的修正/请求预算及失败收尾，避免只依赖模型遵守自然语言轮数；真实自主交付、引用可靠性、复杂逆向仍待完成，goal
  active。

## 2026-11-11 Swarm原生累计预算

- E-128/F-034：默认120次模型调度、2次失败轮次、40次成员唤醒，所有名字/恢复共用持久化计数；保留原20轮/成员和10分钟/轮。触限blocked并中止成员，主/子/辅助生成入口预留额度，不伪装HTTP重试/费用统计。
- 本地/swarm
  budget修改数值，不发模型请求、不清零、不作为模型工具；提高后resume，状态和板显示额度与停止原因。取消释放本会话限制，恢复旧任务仍查旧计数。
- 17 core+2
  CLI定向用例、严格lint/type构建通过；源码bundle实际native故障链3个loopback请求/1816ms，CLI自行退出1，blocked/paused/具体错误保留。第1请求创建隔离状态，后2请求计入任务额度；超额前置拒绝。没有付费调用，不代表真实任务完成。
- preview.33准备分发；WI-063
  Swarm本地预算实现，Teamwork/Boost独立请求累计预算后续补齐，不把任意自然语言轮数宣称已强制。WI-054真实自主交付/引用与WI-056复杂逆向未完成，整体goal
  active。

- E-129：preview.33源8ede6b1e45c5749f622f17c3ac56867c3b9160a4/run42887993551三平台success，工件版本/SHA/安装/六rg身份核对。每平台原生正常20请求链及新增预算触限3请求链通过；预算场景CLI自行退出1、blocked/paused，非业务交付成功。提前工件核对的ENOENT日志保留，待原下载结束后通过，未重启CI。
- E-130：本机offline缓存安装7240ms/退出0，双命令preview.33，424包内文件逐一匹配Windows
  CI包；旧包保留。不重跑相同fixture，无付费调用，未改真实供应商/数据库/逆向工具。
- WI-063
  Swarm任务预算交付；WI-064后续统一Teamwork/Boost请求累计额度与恢复门控。WI-054真实完整自主交付/引用、WI-056复杂逆向和隔离工作树/成员独立模型仍未完成。目标active，Obsidian/源码/工程交接同步，不合并master/正式发布。

## 2026-11-11 工作流累计预算

- E-131/F-035：修复Teamwork/Boost恢复后重新获得两轮实施额度；独立预算账本默认240次模型调度、4个失败阶段、每里程碑2次累计实施。主/子/辅助共享入口，状态/报告分开保存防止并行覆盖，取消不清零，完成关闭绑定；旧报告迁移可观察到的轮数与失败，历史请求量不伪造。
- /boost budget、/teamwork
  budget及访谈模式本地额度命令，不调用模型；提高上限后显式resume。原生跨模式任务互斥，活拥有者在修改前拒绝。预算触限与用户取消区分，原诊断保留。
- 28项相关core和4项CLI定向用例、受影响lint/type/格式通过；源码正常五阶段12请求/2064ms/退出0，预算3请求/1825ms/退出1，无writer/工件，blocked/paused且部分报告保留。全程loopback，无付费/全量/冒烟。
- WI-064本地实现完成，preview.34准备分发安装。WI-065预算状态损坏的可取消恢复继续；WI-054真实无人介入交付/引用、WI-056复杂逆向及隔离工作树/成员独立模型仍未完成。goal
  active。

- E-132：preview.34源5f37e00a2de5f303b03e3909b44200bf56d95af1/run42891302374三平台completed/success；工件版本/SHA/安装/六rg身份与权限核对通过。每平台Swarm正常20请求/预算3请求、工作流正常12请求/预算3请求通过；正常账本closed/10次成员调度，触限blocked/paused/2次累计调度，CLI自行退出1。仅模型fixture，不是实战交付。
- E-133：offline缓存安装7038ms/退出0，双命令preview.34，424包内文件逐一匹配Windows
  CI包；旧包保留，无付费/全量/冒烟。WI-064交付，整体goal active。
- E-134/F-036：生成的隔离坏JSON账本会同时阻断cancel与调度，原ready记录和坏字节保留、0模型请求，证据workflow-budget-corruption-before.json。WI-065下一步允许保留坏账本后显式取消，并防止未知旧用量通过resume静默重置；尚未修复。WI-054真实自主交付/引用、WI-056复杂逆向及隔离worktree/成员独立模型继续。

## 2026-11-11 工作流损坏预算恢复

- E-135/F-036：显式cancel保存坏预算/坏绑定字节；工作流记录独立保存跟踪版本/拥有进程/未知用量标记。跟踪账本缺失或关键计数字段缺失不再按新预算补0。未知用量在状态中为null，旧任务不能resume或调大额度；健康账本绑定修复不丢累计值，I/O错误不被吞掉。
- E-136/F-037：非交互本地斜杠命令不再fall
  through发给模型；真实输入错误使用既有退出42。23项core+2项选定headless检查、lint/type通过；实际CLI取消0/恢复42/正常会话0，两坏文件原字节保留，全场景2个loopback请求/7162ms，无真实调用。
- 初辅助断言误期望FatalInputError退出1；保留原false并按源码既有42重评同一记录，不重复场景。preview.35准备分发安装，WI-065本地完成；WI-066继续Swarm
  members.json/绑定和原workflow记录本体损坏恢复。真实自主交付/引用、复杂逆向、隔离工作树和成员模型继续，goal
  active。

- E-137：preview.35源510c8657ffe80082f041ec3d1739a03604aaf6d1/run42894747215三平台completed/success；工件版本/SHA/安装和六rg身份/权限核对，原生Swarm/工作流正常及预算链通过，新增坏状态恢复链每平台2个loopback请求，取消0/恢复42/普通会话0，坏文件字节保留，旧用量未知且任务cancelled。
- E-138：offline缓存安装7039ms/退出0；两个命令preview.35，424文件逐一匹配Windows
  CI包，旧包保留，未重复fixture/付费任务。WI-065交付，goal active。
- E-139/F-038：Swarm隔离状态2次预留后缺requests字段会读成0，非法字段使取消被拒绝，0模型请求，原坏字节未变。证据swarm-state-corruption-before.json。WI-066继续Swarm坏状态/绑定取消和计数严格读取，再处理workflow记录本体损坏；真实自主交付/引用、复杂逆向、工作树/独立模型仍未完成。

## 2026-11-11 Swarm计数与损坏状态恢复

- E-140/F-038：budget存在必须有六个合法字段，缺计数/错误UUID/超大或非法状态拒绝分发；独立owner与budgetVersion防止跟踪预算消失时按旧格式补0。明确/swarm
  cancel
  ID绕过坏索引，保存未知标记后备份原状态与索引，原板不改；未知旧任务不能resume/调大预算，摘要null/看板未知。
- 活拥有者拒绝，本进程活成员先请求中止并收尾后再取消恢复；健康成员仅索引坏时保留已知计数。旧版JSON可提取合法ownerPid，所有拥有者信息丢失则拒绝猜测。21相关core+3
  CLI、lint/type通过；实际CLI恢复链7227ms/2个loopback请求，cancel0/resume42/普通会话0，无真实调用/交付工件。
- WI-066本地完成，preview.36准备分发安装；WI-067继续workflow记录本体损坏恢复。真实自主交付/引用、复杂逆向、隔离工作树/成员模型仍待完成，goal
  active。

- E-141：preview.36源5c3ac52db14af282852ee4e5fb04cd3859be6554/run42897457849三平台completed/success；包版本/SHA/安装和六rg身份/权限核对。Swarm正常20请求/预算3/恢复2，工作流正常12/预算3/恢复2通过；新增Swarm取消0/恢复42/普通会话0，坏成员/索引字节与板保留，只loopback模型。
- E-142：offline缓存安装6932ms/退出0；双命令preview.36，424文件逐一匹配Windows
  CI包，旧包保留。未重复相同fixture/付费任务，WI-066交付，goal active。
- E-143/F-039：生成的坏workflow记录本体使cancel和无关teamwork查询失败，原预算/拥有者完整；原字节保留/0模型请求，证据workflow-record-corruption-before.json。WI-067继续指定ID保留取消与坏历史记录查询隔离。真实自主交付/引用、复杂逆向、隔离worktree/成员独立模型继续。

## 2026-11-11 原工作流记录恢复

- E-144/F-039：坏历史记录不再阻断其他模式查询；CLI提示ID。同模式当前坏任务禁止静默回落，旧任务恢复不能覆盖其他活绑定。/boost|teamwork|grill-me
  cancel
  ID绕过latest先核对独立账本的模式/拥有者；保存recordUnavailable标记再备份原记录，cancelled占位不伪造原需求/报告/完成。
- 已知累计预算保留，原记录不可用的旧任务禁止resume或新增额度；运行中保存先核对原磁盘记录，调查期损坏不会被旧内存覆盖，成员收尾后再恢复。28相关core+4
  CLI、lint/type/格式通过；实际CLI恢复链7599ms/2个loopback请求，cancel0/resume42/普通会话0；2调度/1失败/1实施的fixture预置值未重置，无真实调用/业务交付。
- WI-067本地完成，preview.37准备分发安装。WI-068下一步推进成员独立模型选择与配置便利性，工作树隔离仍保留；真实自主交付/引用、复杂逆向继续，goal
  active。

- E-145：preview.37源7d56d192195a3bb50cd16a0307653607ebf6f3a2/run42899518945三平台completed/success，工件版本/SHA/安装与六rg身份/权限核对；Swarm与工作流正常/预算/恢复链均通过，新增原记录恢复2个loopback请求，cancel0/resume42/普通会话0，已知2调度/1失败/1实施保持原值，原坏记录/绑定字节保留。
- E-146：offline缓存安装7153ms/退出0；双命令preview.37，424文件逐一匹配Windows
  CI包，旧包保留，不重复fixture/真实付费任务。WI-067交付，goal active。
- WI-068下一步成员独立模型与配置便利性：ProviderManager已有provider:model路由，LocalAgentExecutor通过alias/overrideScope解析；需调用内隔离，不能并发改全局activeModel/注册表别名，并覆盖session/subagent两入口与预算。尚未实现；隔离工作树、真实自主交付/引用、复杂逆向继续。

## 2026-11-11 协作成员独立模型

- E-147/WI-068：调用内AsyncLocalStorage路由覆盖原生执行器/压缩容量/最终生成器，两种本地调用入口均可分配不同provider:model或native:gemini模型；不改全局activeModel/注册表别名/供应商文件。中文名称、角色/具名预设与inherit，运行中禁止改模；显式成员错误不触发全局换模，丢失供应商明确失败。
- /swarm prepare和/boost
  prepare先零模型创建任务；model命令显示安全本地目录，配置角色/预定@成员，resume再开始。角色/成员与阶段报告保留modelsUsed实际分发尝试路由，共享累计预算，权限scope不变。
- 23相关core+10CLI、严格lint/type通过；源码bundle
  Swarm/工作流×两调用入口四链20/20/12/12请求均通过，三个不同loopback供应商路径/模型ID、实际读写/独立审查、主路由不变。最后补齐prepare/具名预设/429隔离由定向用例和最终CI核对，未重复源码四链；无付费/全量/冒烟。
- preview.38准备分发/安装；WI-068本地完成，WI-069下一步可选Git工作树隔离/回收/整合。真实自主交付/引用、复杂逆向继续，goal
  active。

- E-148：preview.38源a823805998c3c9a300f43fca37346d33661ee041/run42903510083三平台completed/success；包版本/SHA/安装报告/六rg身份权限通过。最终源码四条原生多模型链Swarm20/20、工作流12/12均退出0，两入口实际命中研究/实施/审查不同loopback路径与模型ID，主路由保持；modelsUsed与18/10累计预算核对，既有预算恢复链通过。
- E-149：offline缓存安装7081ms/退出0；双命令preview.38，424文件匹配Windows
  CI包，旧包保留，不重复fixture/付费任务。WI-068交付，goal active。
- WI-069下一步可选Git工作树隔离/结果整合：scoped-config只有额外目录上下文覆盖，不等于cwd/项目根隔离，需同时核对shell/file工具路径、预算归属、清理与整合冲突、保留未提交变更。真实自主交付/引用、复杂逆向仍未完成。

## 2026-11-11 协作任务 Git 工作树

- E-150/WI-069：Swarm/Boost/Teamwork 新增 workspace
  on|status|export|apply|remove。私有索引捕获工作文件及未忽略未跟踪内容，原暂存区/HEAD不变；成员调用内同时改变真实文件根、WorkspaceContext及shell
  cwd，storage/预算归属不变。任务级共享一份隔离工作树，writer/verifier仍串行，不是OS沙箱或每成员并行分支。
- 独立审查前后及完成前核对tree，缺必需清单拒绝回落原目录；只有completed且当前成果经审查才允许本地apply。先check后整体apply，不改source
  index，冲突保留；清理无force，保留补丁及状态，cleanupHead支持拒绝后的重试。64MiB、submodule、符号链接目录有明确边界，ignored依赖不复制。
- 24相关core、严格lint/type/格式通过；最后审查者选择收尾后Swarm7项通过。源码CLI工作树链21个loopback请求/22254ms/退出0，实际shell
  cwd和文件工具、独立审查、回写与回收通过；prepare/配置/回写不加模型请求，原staged/unstaged/untracked及index保持。最终补齐由CI同源包核对，不重跑相同源码链、付费任务或全量/冒烟。
- WI-069本地完成，preview.39准备三平台及安装。本机仍preview.38；真实自主交付/引用、复杂逆向继续。docs/ultra-agent-worktree-handoff.md为本阶段交接；goal
  active，仅codex分支，不合并master/正式Release。

- E-150/F-040收尾：Git原生remove无force仍删除ignored文件，临时仓库实证退出0；新增显式ignored预检拒绝清理，保留内容和HEAD，用户自行处理后重试。已并入既有工作树6项且通过，严格lint通过；同一21请求CLI链增加一次本地拒绝清理，无新增模型调用。取消旧run42906998485，最终同源包另跑，不把取消当完成。证据worktree-ignored-cleanup-probe.json及agent-worktree-ignore.log/junit。

- E-150/F-041：最终CI42907564263 Linux成功，Windows workspace
  on根目录大小写身份误判，macOS仅shell
  cwd原始路径字符串断言false。改为realpath+平台path.relative身份比较，脚本预先保存规范目录和实际cwd；Windows混合盘符输入并入既有快照用例。原失败日志保留，不称交付；准备修复后的同源三平台包。

- E-150/F-041根因：42908273604
  Linux/macOS通过、Windows仍失败。临时仓库实证8.3短名经fs.realpathSync保持，而Git返回长名，native解析能展开；最终source/身份及fixture
  shell路径用realpathSync.native+平台relative。既有Windows用例改为真实cmd短名+混合盘符。worktree-path-alias-probe.json证明，保留旧失败，不无改动重跑。准备修正后的最终包。

- E-150验证代码收尾：42909110107打包类型构建拒绝execFileSync的windowsVerbatimArguments类型，取消该候选。改用spawnSync原生支持项，保留实际短名用例；补查该单项、严格lint及core/CLI完整类型构建后再分发。错误属于新增验证实现，不当作跨平台业务通过。

- E-151：preview.39源7582e873f53a679764540dd07cb73e9fbf6fa5d2/run42909725723三平台completed/success；版本/SHA/源/安装及六rg身份权限核对。每平台任务worktree链21请求、19累计调度、退出0；实际shell
  cwd/文件工具、审查封存、显式回写、原index/用户改动保留、ignored清理退出42保护后重试回收及补丁保留通过。Windows短名和macOS别名通过最终包实证；同源多模型两入口及预算恢复链通过，仅loopback。
- E-152：offline缓存安装7050ms/退出0；双命令preview.39，424文件匹配Windows
  CI包，旧包保留；不重复相同fixture/付费任务，不改个人配置/数据库/逆向工具。WI-069交付；真实完整自主交付/引用、复杂反编译继续，goal
  active，不合并master/正式Release。
