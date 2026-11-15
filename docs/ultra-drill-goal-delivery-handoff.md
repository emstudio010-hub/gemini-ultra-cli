# Gemini Ultra CLI 持续演练台与 preview.84 交付

日期：2026-11-16。WI-265；E-582 至 E-585；F-224 至 F-226。源码仓库 C:\Users\Administrator\work\gemini-ultra-cli，分支 codex/ultra-agent-portable。功能提交 2b0d189；最终软件包运行代码提交 ee569c113594bd8ebba640228405b021e890ff38。后续只修正 Windows 验收脚本的换行断言并更新交付资料；源码 ZIP 的精确提交见交付目录 SOURCE-COMMIT.txt。

用户最新要求为：列出并推进原六项目标，增加完整、持续的演练台工作逻辑，功能完成后只做必要验证，直接打包交付。本轮已执行此顺序，不再沿用「暂不打包」。R26 code-audit；lead/cae/doc 在同一聊天执行，无 Codex 子代理。界面使用 ui-skills-root 路由的交互契约，明确保存、执行、暂停、恢复及失败保全。

## 原六项目标与本次落实

1. 启动与加载：包含此前已提交的启动、生命周期、密钥库隔离、非交互重复认证修复；此次安装包包含这些源码。
2. 双语与配置：保留供应商/模型、提示词/规则、六档推理、语言和协作设置；新增目标区域中英文均实际操作。
3. 原生 Agent 协作：持续目标使用已有 Boost 引擎的调查、实施、独立审核、最终验收、累计预算、报告和暂停续接；原 Teamwork/Grill me/Swarm 任务保留。
4. 演练台：新增目标类型、范围、里程碑验收、交付文件、预算、保存/启动、进度、暂停/续接、完整报告下载；网页和 /goal、Agent 工具共用同一份原生记录。
5. 原生逆向链路：保留授权、免审批设置、工具巡检与路径、技能、事实/二进制工件、补丁事务。目标模板包含源码审阅、本地样本静态分析、授权 Web 演练，不自动安装工具或扩大授权。
6. 最终交付：生成 Windows x64、Linux x64、macOS arm64 npm 包、Windows x64 含 Node 的便携 ZIP、源码 ZIP、使用说明、校验清单和验收记录。未覆盖全局 preview.83、未合 master、未发布 GitHub Release。

这些是功能和交付范围；旧四份真实复杂协作失败仍未验收，未被本轮受控结果覆盖。

## Evidence → Finding → Path

F-224：旧 /goal 仅注入提示词，未独立保存目标与推进状态。新增 drillGoals.ts、drillGoalTool.ts，并重接 goalCommand.ts。目标保存为原生 Boost 记录，可分阶段连续执行；浏览器关闭不停止 CLI，退出 CLI 后在原项目按 ID 续接。达到预算或受阻后保留结果，显式续接；已完成目标不重新执行。主 Agent 可使用 manage_drill_goal 创建；工作流实施者不能通过嵌套目标绕过限制。

F-225：原演练台主要提交提示词、只读查看任务。新增 drillCockpitTasks.ts 以及目标表单与任务控制。暂停、导出在忙碌时仍可用；其他写操作继续执行既有会话 ID 和就绪校验。新目标预声明的交付文件与 run_agent_workflow 的文件集合合并，最终核对不能被模型传 [] 删除。完整报告导出验证原始正文及哈希；浏览器正文上限 16 MiB，超限仍保存本地全文索引。读取 manifest 使用结构校验，未以预览替代全文。

F-226：Windows 安装验收首轮把原生 write_file 正常产生的 CRLF 与固定 LF 比较，导致脚本失败。只将断言改为 os.EOL；未更改产品写文件行为或放宽正文要求。相同 Windows 包随后本机通过。CI 的 passed=false 原记录另存 Windows/goal-package-verification-ci-failed.json，没有改写原失败。

## E-582 必要源码验证

3 文件 / 7 个不同相关用例通过：原生目标保存及实际引擎完成、保留必需文件复核、真实运行子任务暂停/续接保留累计用量、非法路径/未登记 Web 授权拒绝；真实 loopback HTTP 的创建/一次调度/忙碌暂停和导出/按 ID 续接/旧会话拒绝；原页面提交锁的 3 个场景。

```powershell
node node_modules/vitest/vitest.mjs run packages/core/src/drill/drillGoals.test.ts packages/cli/src/services/drillCockpitGoals.test.ts packages/cli/src/services/drillCockpitPageSubmission.test.ts --exclude "upstreams/**" --reporter=dot --maxWorkers=1 --minWorkers=1
```

7 passed，32.32 秒。manifest 校验修正后只重验 HTTP 这一文件：1 passed，18.72 秒，不重复累计为新用例。未运行全量/冒烟。

CLI/core tsc 通过；core 变更的本机 lint 通过。最初一个 CLI 联合类型未收窄错误已修正。Windows 本机多次 CLI lint 因内存不足退出，未冒称通过；最终 Linux runner 的相关 CLI 和脚本 lint 零 warning，三平台包编译全部通过。源码格式及 diff 检查通过。

## E-583 真实浏览器操作

浏览器访问实际编译后的 loopback 演练台服务，创建中文目标与一个里程碑，原生引擎产生 5 份阶段报告，页面显示 completed 和 1/1；已完成的续接/暂停按钮禁用。实际点击导出，下载 6565 字节完整 JSON，随后切换英文并恢复中文，目标内容与详情保留。生成报告与下载在隔离目录，不写个人配置。

浏览器只将 Agent 结果边界设为确定性回调，保存、HTTP、SQLite、原生工作流和文件复核均为实际代码；不是付费模型质量验证。浏览器截图接口报 Unable to capture screenshot，未提供或伪造截图；以可访问树、实际下载和原生记录为证据。

## E-584 安装包与便携版

三平台构建来源：[最终构建 43752760944](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/43752760944)，软件代码均为 ee569c1。此 run 的 macOS/Linux job 成功；Windows job 因上述换行断言失败，包实际成功生成并保留，之后在本机以同一个包完成定向安装验收。

每个平台都实际运行安装后的 CLI：主模型夹具调用 manage_drill_goal 保存一个目标，再调用 run_agent_workflow；两位 researcher、coder、独立审核和最终审核共保存 5 份报告，完成一项里程碑。检查实际交付正文、原输入未变、必需文件哈希、预算 closed 和主/子工具注册。各 13 次 loopback 模型请求，外部模型请求为 0。属于真实安装链与受控协议验收，不是供应商质量验收。

| 平台 | 架构 | 包 SHA256 | 最终安装链 |
| --- | --- | --- | --- |
| Windows | x64 | 7658a05c33f599d96da0ad3ff42819e9a5de93aa07926c2b15f6cc755e11674e | 本机 Node 24.19.0 通过 |
| Linux | x64 | 1c37a5aeeb93d01d3f85c0dbb06429ac4209227d9b05f553874b599177acd5c1 | runner 通过 |
| macOS | arm64 | acc3797f5529eb0d69c4162c4f2020bd97f11c4f440055145161eccad360ef44 | runner 通过 |

Windows 便携版含原签名有效的 OpenJS Node 24.19.0、Node 许可证、当前 CLI 及对应平台的原生 PTY 依赖。Start-Gemini-Ultra.cmd --version 实际输出 1.0.0-preview.84。无需全局 npm 安装；默认 workspace，Open-Project.cmd 可进入用户指定项目。模型密钥和个人数据库均不在包内。

首轮构建 43752463793 的 Linux manifest 类型断言错误、两轮 Windows 换行脚本失败均保留；修复后不重新跑无关用例，不以总 run 失败掩盖各平台的实际证据。

## E-585 唯一一次真实供应商验收：未通过

使用当前配置的 deepseek/deepseek-v4.1-flash，在全新隔离工作区创建单里程碑目标，要求只读生成的 seed.json、写报告并独立复核。原生预算上限 24 次调度、1 次失败、1 轮实施，240 秒硬期限，外部转发也最多 24 次；不是重放旧真实失败。

当前供应商首个外部请求返回 HTTP 503，约 2.2 秒返回响应头。之后停止外部转发，没有第二次外部请求；CLI 的后续重试只到本地拒绝边界。18.3 秒结束，CLI exitCode=429，nativeRequests=4，原生目标保持 ready，阶段报告为 0，未生成交付报告，oracle=false / passed=false。不能声称真实模型任务已完成或供应商可用。

临时凭据文件已删除，个人供应商配置字节校验未变。待续接目标与失败诊断、唯一外部请求状态保存在交付目录「验收记录」和工程目录 live-goal-acceptance。未自动切换真实模型、付费重试或修改个人配置。

## 交付与使用

目录：C:\Users\Administrator\Documents\ChatGPT\gmncliu\交付\Gemini-Ultra-CLI-preview.84。

Windows 用户优先解压便携 ZIP，双击 Start-Gemini-Ultra.cmd，输入 /drill。已安装 Node 22.19 或更高版本时，也可 npm install -g 对应平台 tgz。当前供应商 503 需恢复可用后，再在相同隔离项目显式续接该目标；本轮没有把这个外部问题标成解决。

交付目录的 README、SOURCE-COMMIT.txt、platform-packages.json 和 SHA256SUMS.txt 记录准确版本与校验值。源码、工程目录与 Obsidian 的本交接文本保持一致。本轮功能和包交付完成；真实供应商验收、旧复杂协作失败、任意外部逆向工具/硬件与其他机器场景的限制明确保留。
