# Gemini Ultra CLI 手动压缩交接

日期：2026-11-11；实现和本地验证于 2026-11-10 完成。源码分支
`codex/ultra-agent-portable`，功能提交
`03c926a3975f4c960c10ff9cd2b8c866f4f7a9ea`。本机双命令已安装
**1.0.0-preview.27**，整体目标 active。

## E-100 / F-031：手动压缩可取消

手动 `/compress`
原来没有向核心传取消信号，后台任务会持续占用 pending 状态。已安装 preview.26 的 ConPTY/HTTP 对照：摘要请求等待响应头，输入
`/compress cancel`
未释放连接，11,641ms 由验证观察器终止。原 false 和输出保留，不把被终止终端的退出 0 算正常完成。

现在每个 GeminiClient 的手动压缩使用独立 AbortController，传给压缩服务。`/compress cancel`、`/压缩 取消`
可取消它；仅取消子命令允许并发，启动新压缩仍按原命令排队。提示显示当前模式和取消方法，取消结束后清除 pending，可继续提问或再次压缩。自动压缩沿用当前请求的取消链。

核心在摘要完成、复核完成、Token 计算完成及应用前检查取消；若当前 chat 已在摘要生成期间改变，则丢弃旧结果，不覆盖当前 chat。此证据覆盖摘要返回与应用前的边界，未宣称任意初始化内部 await 都具备完整事务回滚。

## 快速单轮选项

`/compress fast`、`/压缩 快速` 明确只生成一轮摘要，跳过第二轮复核。普通
`/compress`
和自动压缩保留原两轮流程。网络重试保持既有策略，单轮不代表任何故障下都只发一个 HTTP 请求。恢复
`/compact`、`/summarize` 别名。

## 定向检查与实际终端

14 项必要选择用例通过：核心 5 项、命令 9 项。覆盖默认复核、单轮、取消后不启动复核、取消或切换 chat 后不应用摘要、取消后可重启、非法命令参数和并发元数据。受影响文件严格 lint、格式、核心/CLI
TypeScript 构建通过。首次核心取消用例的 mock 实施被旧 mockResolvedValueOnce 队列覆盖，清理该用例队列后复核通过；首次结果项类型错误已使用明确 HistoryItemCompression 修正，原日志保留。没有全量或冒烟。

E-101：本地候选包真实 Windows ConPTY/HTTP
fixture 流程通过（5 请求、9,804ms）。等待摘要时输入取消，连接 240ms 内关闭；下一提问请求仍含原用户上下文，快速压缩只发一轮摘要，快照持久化，下一提问使用新快照，同一会话正常退出 0。不是实际供应商速度或摘要质量验收。

CLI
onExit 及成功记录之后，验证辅助 Node 进程仍持有 ConPTY 句柄；单独识别并停止辅助进程，未将其当作 CLI 卡住。验证脚本改为在 onExit、保存记录、清理服务之后主动退出辅助进程，清理记录保留。没有重复产品流程来隐藏辅助进程问题。

## 本地安装与远程状态

E-102：同功能提交本机 package:ultra 成功；版本、校验文件、六个内置 rg
hash/0755 核对通过。已有缓存 offline 安装 9 秒，双命令为 preview.27，424 个包内文件逐一与本地工件一致。该核对覆盖安装身份；实际终端流程使用同一候选 staging 文件，未重复已经通过的流程。

本地包：`C:/Users/Administrator/work/gemini-ultra-cli/artifacts/ultra-release/gemini-ultra-cli-1.0.0-preview.27.tgz`。

包 SHA-256：`0f81c768090df266997b9b09e23d9b56f9f0551fd6f231a8e44883a55d49e546`；入口 SHA-256：`5b09bd8899cfb514f45f83b16c6956c22ae7bb269d574ceac2a7022746e214b6`。已有缓存不代表无缓存新电脑可以离线安装。

2026-11-10 源码推送 TLS 失败；2026-11-11 网络恢复后，同功能提交已成功推送。preview.27
[运行 42865743087](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42865743087)已完成三平台构建/隔离安装，版本、安装报告、SHA及六rg
hash/0755核对通过。模型响应为fixture，真实供应商续接另行记录。

E-103：原 preview.26
[运行 42778862788](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42778862788)已确认 completed/success，提交为
`2b2f348000439251b257f06977539a7cd2215e05`；三个工件版本、安装报告、SHA 及六 rg
hash/0755 核对通过。更正之前因网络不可达而未知的状态。本机当前是 preview.27 本地包，未为旧版工件核对降级安装。

## 工程证据

根目录 `C:\Users\Administrator\Documents\ChatGPT\gmncliu`：

- manual-compression-core-tests.log、manual-compression-cancel-recheck.log、manual-compression-command-tests.log。
- manual-compression-lint.log、-final-lint.log、-types.log（首次类型错误）、-final-types.log。
- verify-manual-compression-cli.mjs、installed-preview26-manual-before-result.json、candidate-preview27-manual-compression-result.json，及各自 output/session。
- candidate-preview27-manual-helper-cleanup.log。
- preview27-local-package.log、local-preview27-artifacts-result.json、global-install-local-preview27-result.json。
- preview27-source-push.log（首次失败）、preview26-ci-nov11-attempt.log、github-preview26-run.json、github-preview26-artifacts-result.json、github-preview27-run.json。

## 未完成范围

旧多 Agent 八文件任务、真实摘要质量和复杂逆向仍未验收。本阶段默认压缩流程没有被快速模式替换。后续使用已安装产品的手动 fast 续接时，继续原会话、保留 reviewer
TIMEOUT、不重新启动子代理，记录真实请求和产物。源代码不合并 master，不正式发布 Release。

## E-104：真实原任务恢复交付

当前真实Ess/DeepSeek，安装的本地preview.27：原会话产品内/compress
fast单轮成功（手动阶段42,465ms，摘要API32,425ms），再正常非交互同ID续接，两主请求/1次write_file落盘。全程73,466ms自然退出0，未触及240秒观察器，最终JSON指向collaboration-audit.md。原reviewer
TIMEOUT保留、无新子代理、八份源码与真实供应商配置未变、原checkpoint前缀保留、一致性数据库重开原note整行相同且不重复。请求已报告85,634Token，不作金额推断。

这是原任务失败后的用户式恢复交付，不证明原任务从头到尾自主完成。恢复报告原稿4895字符，SHA-256
f6b96d3561e198a90cf21de6fd553d18c2dcbf82dc20c7deb0f6e1b3af4aa4f1；自动检查只确认行号在范围内，人工逐段复核发现部分标作主Agent核读的引用错位。原稿保留，docs/ultra-recovered-audit-review.md单独更正关键锚点和表述，不冒充模型修正。

首次恢复辅助脚本在会话恢复尚未结束时输入命令，被界面忽略，150秒手动观察上限结束，未记录模型请求；保留false和终端原文，只改辅助输入时序后复核。原aggregate的afterNoteRows=0是早退未赋值，保存的SQLite
backup重开仍有原note整行。缺统计或未赋值不能作为数据丢失证据。

证据：resume-live-fast27.mjs、preview27-live-fast-resume-result.json及-analysis.json（首次时序失败）；preview27-live-fast-resume-recheck-result.json、-analysis.json、-manual-result.json、-wire.jsonl、-report.md、-sessions、-facts.sqlite。响应观察副本的正常AbortError不判为上游截断，已收到finish/DONE/usage与CLI用量可交叉核对。

## E-105：最终CI工件安装

preview.27运行42865743087三平台completed/success，提交03c926a3975f4c960c10ff9cd2b8c866f4f7a9ea。三个包版本、安装报告、SHA及六rg
hash/0755核对通过；CI模型响应为fixture。

| 平台           | 包 SHA-256                                                         |
| -------------- | ------------------------------------------------------------------ |
| windows-latest | `43d1bea8cb06b60eceb29033fb75ed8172674dfbb6d782debc065e1277d30eda` |
| ubuntu-latest  | `6ceeb659ba0dce187589a52430e4d4ec91bb1dac38bc43823ccdfc128bff9884` |
| macos-latest   | `c5a74686d0592d768136a864771d0c34f0d2a3008d3a81f2832b8ffc337824e0` |

本机已替换为Windows
CI工件，已有缓存offline安装6秒，两个命令均preview.27，424个包内文件与该CI包逐一一致；入口SHA-256
c819ba34679ccab7e7d8d5f0c9c7466d8c8fa5ec599f6bd2f0edf2f748e3f86b。当前安装不再是本地包；原本地包及其真实续接证据保留，不把这次文件身份检查当成新一轮真实模型任务。

Windows包：C:\Users\Administrator\Documents\ChatGPT\gmncliu\github-run-42865743087\gemini-ultra-cli-windows-latest\gemini-ultra-cli-1.0.0-preview.27.tgz。最终证据：github-preview27-artifacts-result.json、verify-installed-ci27.mjs、global-install-github-preview27-full-result.json。

旧任务已通过恢复交付，后续不再原样反复续接；当前源码无人介入协作、复杂逆向及输出引用可靠性仍需继续推进，整体目标active。
