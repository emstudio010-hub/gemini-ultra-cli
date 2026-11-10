# Gemini Ultra CLI preview.21 心跳等待修复交接

日期：2026-11-10。源码 C:\Users\Administrator\work\gemini-ultra-cli，分支 codex/ultra-agent-portable，功能提交 0dccf3aa79663c96faabb396aace0efae0bb6877。本机两个CLI命令均已安装1.0.0-preview.21；整体goal
active。

## E-078 / F-024：持续心跳绕过流无进展期限

共享readSse原先每次reader.read收到字节都重新给足idleMs，因此注释心跳可让尚未完成的模型流无限等待。现在维护跨读取的进展deadline，只在完整非心跳SSE数据事件后刷新；注释和ping/heartbeat/keepalive命名事件不刷新。正常思考、正文、工具数据持续返回时可以跨越多个idle窗口。完成后的固定尾部用量期限保持。

默认无进展期限仍120000ms，GEMINI_ULTRA_STREAM_IDLE_MS可调整、最小1000。此次没有增加首次配置步骤，也未更改模型预算或重试次数。

修前两个持续注释心跳用例不能按时结束，持续数据对照通过。修后5个选定用例通过，覆盖无数据/已有思考后心跳超时、持续数据刷新、固定尾部期限和截断后下一请求恢复；命名ping亦纳入修后场景。两个受影响文件严格ESLint、格式检查和核心/CLI
TypeScript通过。没有全量或冒烟。

已安装preview.20另做实际ConPTY/HTTP故障基线：隔离配置1秒无进展期限，思考后持续命名ping及注释，9秒观察器终止前没有可见错误或后续提问，原passed=false保留。其exitCode=0是ConPTY被观察器终止的返回值，不能据此认为正常完成。

## 45秒设置的离线追踪边界

config.ts::getRequestTimeoutMs和utils/fetch.ts::updateGlobalFetchTimeouts显示model.requestTimeoutMs仅修改headersTimeout，bodyTimeout保留原值。Universal外接流使用独立readSse进展期限。因此不能把E-077三次约48秒的HTTP200响应结束直接归因于那个45秒设置。

F-024是明确独立缺陷，不据此认定它是E-077真实thinking-only的根因。本阶段没有调用真实模型服务，也没有重复付费续接；原任务无报告的失败仍保留。

## E-079 / E-080：分发、安装和实际终端恢复

[运行42765709416](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42765709416)三平台completed/success；Windows
x64、Linux x64、macOS
arm64独立构建、打包、隔离安装通过。版本、安装报告、SHA-256及六个rg文件hash/0755核对通过，模型响应为fixture。

| 平台    | 包SHA-256                                                        |
| ------- | ---------------------------------------------------------------- |
| Windows | 009db27a0caa4ca8065adf0d6a46a328256041a07e72079032300773ed2b78f5 |
| Linux   | 4b1a97e507ea8d369b77f765cdce9cc5940f95b2807738be832f28a6ecf4f6d3 |
| macOS   | d675225e7633efa3e8529d4429b2218b6e657226abe682a68e6646c8ede819db |

本机gemini-ultra及gemini-ultra-cli均为1.0.0-preview.21，入口SHA-256
3c770160bc7f7698fc2ca6a86e9d2f8a30f263bbe91a71e446dbc2e6d18d2c6c与Windows
CI工件相同。已有缓存offline安装10秒，不代表无缓存新电脑离线安装。

安装后同一ConPTY进程通过：思考后持续ping/注释，1秒配置下1,079ms出现可见idle错误；原HTTP连接在下一请求前关闭；随后用户带FOLLOWUP_HEARTBEAT_MARKER的新提问进入第二请求并收到RECOVERED_AFTER_HEARTBEAT，正常/quit退出0。2请求、9,526ms、observerTimedOut=false；不是自动重试被误当后续提问。所有模型响应均为loopback
fixture。

Windows包：C:\Users\Administrator\Documents\ChatGPT\gmncliu\github-run-42765709416\gemini-ultra-cli-windows-latest\gemini-ultra-cli-1.0.0-preview.21.tgz。只同步开发分支，未合并master或正式发布Release。

## 证据与接续

工程证据位于C:\Users\Administrator\Documents\ChatGPT\gmncliu：

- provider-progress-before.log / -after.log / -lint.log / -types.log。
- installed-preview20-heartbeat-before-result.json及终端原始输出；失败保留。
- installed-preview21-heartbeat-recovery-result.json及输出；verify-stream-heartbeat-recovery.mjs。
- github-preview21-artifacts-result.json、global-install-github-preview21-result.json、github-preview21-run.json。

目标池维护至E-080。下一阶段离线核对流超时/断连的恢复分类和取消清理；先证明确有缺陷，再决定改动，不盲目增加模型请求。E-077最新恢复会话/数据库仍为preview20-live-audit-budget，原始源码快照仍为preview17-live-autonomous-handoff-sources；不原样重跑付费任务。复杂逆向、更多原生工具和完整自主任务的边界继续保留。
