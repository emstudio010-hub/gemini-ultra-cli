# Gemini Ultra CLI 推理续接与分发交接

日期：2026-11-10。源码分支 `codex/ultra-agent-portable`，功能提交
`719c8a93ba26d3df91441635f028731451a65dc1`。本机两个命令均已安装
**1.0.0-preview.24**。整体目标 active，完整上线仍未验收。

## E-087 / F-028：历史载荷与协议缺口

通过生产 JSONL 加载器、GeminiChat 恢复及公共 Universal 入口离线转换 E-077 会话：32 条记录、31 个历史 turn、41 个 Chat 消息；23 个工具调用与 23 个结果配对，无重复或孤立 ID。保存了 747 个思考显示片段、41,942 字符，出站 reasoning_content 为 0。原 checkpoint
SHA-256 保持
`5bc30b0b49d7e82cda7f2179e893ce537515af5e7abdb45e5072c3c34f5139d1`。没有原 system/tools/retry 完整请求，不称完整 HTTP 字节重放。

本地 DSH-purge
1.1.71 的 core.js 第 69/72 项补丁面向宿主提示词历史更新，不含通用 reasoning_content 适配；没有执行宿主补丁。[DeepSeek 官方 Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)要求携带 tools 的后续请求回传历史 assistant 的完整原始推理，也包含无工具调用的 assistant 回合。第三方网关兼容性不同。该证据确认独立协议缺口 F-028，未证明它是 E-077 无正文失败的根因。

## 实现与使用

`/provider`
第 10 项「推理续接」提供自动、启用、关闭三档，中英文菜单均可保存、重开。第 9 项仍为输出上限，退出移至第 11 项。首次添加供应商步骤没有增加。

- 自动：仅 openai-chat，按模型名称识别 DeepSeek。
- 启用：用于其他支持 reasoning_content 的 Chat 端点。
- 关闭：用于拒绝该字段的网关。

新的原始推理保留空白，使用绑定供应商 ID、端点、协议与模型的哈希标记保存为 Part；不含密钥。只有成功回合提交持久化数据，失败尝试不提交；工具历史与同 ID 原生恢复保留绑定。携带工具且绑定一致才回传，关闭、无工具、模型或端点改变时不回传。原生 Gemini 请求、fallback 与 token 计数剥离外部数据及标记，原生签名不受影响。恢复显示尊重显式 displayContent，包括空字符串，避免推理数据成为正文气泡。

旧会话的显示摘要不能冒充精确原始推理；完整原始数据无法追补。需要完整历史推理的端点可先压缩或建立新会话。这与
`/effort` 强度分别控制。

## E-088：必要定向检查

10 项选择用例通过：协议/配置/绑定 6 项、恢复显示 2 项、签名清理 2 项。受影响文件严格 lint、格式及核心/CLI 类型构建通过。没有全量或冒烟。

已安装 preview.23 基线中，write_file 落盘后第二请求缺推理字段，被本地 fixture 拒绝并退出 400，失败记录保留。开发 preview.24 四请求链通过（5,634ms），同 ID 恢复后 read_file，原始推理逐字持久化及回传、最终正文隔离通过。thinking-only 对照仍以 INVALID_STREAM 退出 1（2 请求/2,935ms），没有文件或无效推理提交。真实 ConPTY 三档保存与中英切换通过（10,799ms）。这些是本地 fixture，没有真实模型调用。

## E-089：三平台分发

[运行 42773610840](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42773610840)
completed/success，对应上述功能提交。Windows x64、Linux x64、macOS
arm64 各自构建、打包和隔离安装通过。三个包的版本、安装报告、SHA-256、六个内置 rg 的 hash 与 0755 权限核对通过。CI 模型响应使用 fixture，不代表真实深度逆向。

| 平台    | 包 SHA-256                                                         |
| ------- | ------------------------------------------------------------------ |
| Windows | `0ddcec2096692acb110d2751a712e8a3c5f00ae96dde1bd4111bdcd71fefd956` |
| Linux   | `2f91a5007c7db57e923473b4859a426aeaf22f0667c8842a4f4e3ad9da8a1b64` |
| macOS   | `ed6b5066951ee7a9c73beebd5825a3724eb4759e079fed130ff6f1d8a25d776b` |

## E-090：本机安装与同 ID 恢复

Windows
CI 包通过已有缓存 offline 安装，12 秒；这不代表无缓存新电脑可以离线安装。`gemini-ultra`
和 `gemini-ultra-cli` 均为 preview.24，入口 SHA-256
`01006cf67216c202596505453276b196a06bad0ba867741681232d45e57887d1` 匹配工件。

安装后 fixture 首次 fresh 两请求成功并落盘，resume 在首个连接前 ETIMEDOUT、服务端收到 0 个恢复请求；保留 aggregate=false、会话和输出。仅该场景以新记录复核，4 请求/4,767ms/两进程退出 0，同一会话 ID、4 份原始推理精确保存、后续回传 1/2/3 个 assistant 推理均通过。没有为了网络失败修改产品或扩大重试。

## E-091：当前真实网关短任务

已安装 preview.24、当前 Ess /
deepseek/deepseek-v4.1-flash，用新隔离会话读取生成的小文件并复制原文。3 次 HTTP
200、17,974ms 自行结束、退出 0；read_file 和 write_file 各成功一次，文件内容及最终 COPY_DONE 均正确。第三请求回传 1 个 assistant 的 55 字符推理并获接受。实际用户供应商配置 hash 未变。

限额为 maxAttempts=2、maxSessionTurns=6、输出上限 8192、90 秒观察器；仅隔离配置，未修改用户默认。响应观察器 clone 被产品正常清理中止，记录 incompleteRead/AbortError；它不能作为上游响应被截断或思考/用量为 0 的证据。回传字段数、HTTP 状态、CLI 统计和实际文件分别提供证据。

这确认当前网关接受新字段并可完成一次短工具链，不代表 E-077 原恢复任务已修复，也不是多 Agent 长任务或复杂逆向验收。本阶段没有重跑旧八文件审查。

## 证据与接续

辅助产物根目录：`C:\Users\Administrator\Documents\ChatGPT\gmncliu`。

- 离线：analyze-resumed-chat-payload.mjs、resumed-chat-payload-analysis.json。
- 开发：reasoning-replay-\*.log、dev-preview24-reasoning-replay-result.json、dev-preview24-thinking-only-result.json、dev-preview24-reasoning-dialog-result.json。
- 分发：github-preview24-run.json、github-preview24-artifacts-result.json、global-install-github-preview24-result.json。
- 安装：installed-preview24-reasoning-replay-result.json（首次失败）、installed-preview24-reasoning-replay-recheck-result.json（复核通过），对应 output/session 均保留。
- 真实：installed-preview24-live-reasoning-result.json、-wire.jsonl、-output.txt、-session.jsonl。只保存脱敏观察，不保存端点或密钥。
- Windows 包：github-run-42773610840/gemini-ultra-cli-windows-latest/gemini-ultra-cli-1.0.0-preview.24.tgz。

下一阶段优先处理原长任务的交付与上下文边界：旧会话缺精确原始推理，先利用已有子任务结果做离线收束和载荷检查；必要实测保持有界，不原样重跑整个付费任务。不合并 master、不正式发布 Release。复杂逆向和完整自主交付仍未通过。
