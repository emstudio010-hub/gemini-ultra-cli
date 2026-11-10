# Gemini Ultra CLI 上下文容量交接

日期：2026-11-10。源码分支 `codex/ultra-agent-portable`，功能提交
`3cca4cb691f827b6cf86129ce0b1a17e9574070b`。整体目标 active，原长任务和完整上线仍未验收。

## E-092 / F-029：外接上下文预算缺口

追踪主 Agent、子 Agent、压缩和界面调用发现，`tokenLimit`
对未知模型返回 1,048,576，外接供应商没有填写实际容量的途径。较小网关会沿用过大的预算，影响压缩时机和用量提示。没有获得旧任务网关实际容量，不把该独立缺口认定为 E-077 根因。

新增供应商字段
`contextWindow`，限定正安全整数。省略字段的编辑保留旧值；显式 undefined 清除，留空恢复默认。非法输入不修改内存或文件。容量对该供应商下模型共同生效；容量不同可分开配置供应商，或使用共同适用的较小值。不猜测第三方网关容量、不修改用户实际供应商配置。

`/provider`
第 11 项「上下文容量」支持中英文，退出移至 12 项，现有 1–10 项位置不变。复用可选数值编辑流程，不增加首次供应商录入步骤。输出上限与上下文容量分别设置。

`ContentGenerator` 提供可选 `getModelContextWindow`
能力，Universal 按实际模型路由解析；Logging 和 Recording 包装器透传。`tokenLimit`
接收当前生成器，未配置仍按旧默认返回，不因读取容量新增全局配置文件加载。主/子 Agent、自动压缩、超限判断、工具输出预算、终端用量显示、ACP 用量与模型列表读取同一容量。该字段仅作本地预算，不添加 API 参数。

## 定向检查

10 项选择用例通过：配置/路由/包装器 3 项，实际压缩阈值 1 项，界面显示 2 项，模型列表 4 项。四个核心用例包括持久化、普通编辑保留、清空、非法值不变、显式供应商前缀/默认模型路由、动态更新及未路由模型回落。相同 60,000
Token 的历史，在旧默认下 NOOP，配置 100,000 后进入真实压缩服务并调用两次摘要。界面按配置显示 75%，默认显示也保持正确。

受影响 TypeScript 文件严格 ESLint、格式、核心/CLI
TypeScript 构建通过。没有全量或冒烟。首次界面检查的极简 Config 缺 getSessionId，改为完整 fakeConfig 后通过，原失败日志保留；没有为错误 mock 改产品。

## E-093：实际 CLI 与终端

已安装 preview.24 基线中，容量字段未被识别，fresh 写文件和同 ID 恢复读文件均完成，但没有自动压缩（4 请求/4,289ms）。保留原 false 记录；这是新容量能力的基线，不是原 CLI 读写失败。

开发 bundle 复核：fresh write_file 后原生同 ID
resume/read_file，fixture 持续报告 60,000 prompt
Token，供应商容量 100,000、阈值 0.5。读取后自动发起初次摘要和复核摘要，快照写入会话并用于后续主请求，文件与最终正文正确；6 请求/3,195ms，两进程退出 0，容量字段没有发送到 API。

首次开发场景在恢复首响应就把模拟用量改成 1,000，恢复进程按估算初始化，因而没有越过阈值。修正 fixture 为压缩完成前持续报告 60,000，仅复核该场景；原 false、输出和会话均保留。该场景不宣称跨进程恢复了精确的上一请求计数，不作严格速度对照。

真实 Windows
ConPTY 菜单：0 就地报错、100000 保存、重开读回、切换中文、清空回落默认、正常退出通过（14,906ms）。无模型任务。压缩摘要及模型响应均为本地 fixture，不代表真实长任务或摘要质量验收。

## 分发状态

E-094：[运行 42776699623](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42776699623)
completed/success，Windows x64、Linux x64、macOS
arm64各自构建/打包/隔离安装通过。三个工件版本、安装报告、SHA-256，以及六个内置rg
hash/0755核对通过；CI模型为fixture，未重复未受影响的真实原生逆向链。

| 平台           | 包 SHA-256                                                         |
| -------------- | ------------------------------------------------------------------ |
| windows-latest | `42fca6c302c51c9a58e38f511932b10563066637f92cdcaab58f76c007ad4b25` |
| ubuntu-latest  | `63405f685ce4b49596a0db7e778caa8c255134495a1c803beadfa3b0d35accf3` |
| macos-latest   | `c4604a42afcdd30c06cf1fc3c7e45346200259fcda9603d9099782a4f0ee3b52` |

E-095：本机双命令已安装1.0.0-preview.25，入口SHA-256为`f29b03b70a2a865576132bb34f636f860977e51d8f898e4ca0244e115aac9a95`，匹配Windows
CI工件。已有缓存offline安装12秒，不代表无缓存新电脑离线安装。

安装后仅复核核心新增路径：6请求/3929ms，两进程退出0；原生同ID恢复、read_file后自动压缩两轮摘要、快照保存与后续请求使用、最终正文及真实文件全部通过。本地容量字段未发送到API。没有再次运行已通过且未受影响的菜单或其他故障场景。

Windows包：`C:\Users\Administrator\Documents\ChatGPT\gmncliu\github-run-42776699623\gemini-ultra-cli-windows-latest\gemini-ultra-cli-1.0.0-preview.25.tgz`。

## 工程证据

根目录：`C:\Users\Administrator\Documents\ChatGPT\gmncliu`。

- context-window-tests.log、context-window-display-tests.log（原 mock 失败）、context-window-display-recheck.log、context-window-list-tests.log。
- context-window-lint.log、context-window-final-lint.log、context-window-types.log、context-window-final-types.log、context-window-bundle.log。
- verify-context-window-cli.mjs、installed-preview24-context-before-result.json。
- dev-preview25-context-window-result.json（首次用量设置未触发）、dev-preview25-context-window-recheck-result.json（复核通过）；对应 output/session 保留。
- verify-context-window-dialog.mjs、dev-preview25-context-dialog-result.json。
- github-preview25-run.json、github-preview25-artifacts-result.json、global-install-github-preview25-result.json、installed-preview25-context-window-result.json。

## 下一阶段

原 E-077 多 Agent 长任务仍失败。优先离线复用保存的 researcher 和 redteam-analyst 结果，保留 reviewer
TIMEOUT，核对具体代码证据；旧显示摘要不能伪装为精确原始推理。后续必要真实调用保持有界，不原样重跑八文件整套付费审查。

本阶段未连接真实模型服务，没有外部安全目标，不合并 master、不正式发布 Release。复杂逆向与完整自主交付未完成。
