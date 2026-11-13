# Gemini Ultra CLI 模型命令双语反馈与参数保护交接

日期：2026-11-13。WI-163 / E-379至380 / F-120。源码基线 64ceb55d3ca3bf723719d16cd292e2d636b06735，分支 codex/ultra-agent-portable，持续目标 active。保持源码完善 → Windows 必要定向验证 → 功能收敛后最终各平台打包；全局仍 preview.83，本轮未打包、重装、改版本、触发多平台 CI 或重跑旧付费任务。

## 修改

/model、/model set、/model manage 的描述改为随当前语言读取的 getter。用法错误、无效模型、成功切换及配置尚未就绪的反馈使用当前中英文模式。成功提示明确区分“仅本次会话”和“已记住，供后续会话使用”；模型 ID 与命令/--persist 仍保留原值，语言切换不改变路由。既有 modelSaveError 脱敏保存失败提示保持。

原参数处理把 --persist 去掉后只用第一个字符串，因此 /model local:fixture extra --persist 或 /model local:fixture --persit 会静默应用前半段，甚至写入偏好。现在只接受一个模型名及最多一个 --persist；多模型、未知选项、重复 --persist 和缺少模型均在 setModel 前拒绝，不静默截断。仍兼容 --persist 出现在模型名前，保留 /model <模型> 直达与限定 provider:model@version 模型 ID。

配置为空时原来静默返回，现给出可读的“初始化完成后重试”错误，不声称切换成功。没有改底层模型解析、默认供应商、配置文件格式、保存实现、配额刷新或网络调用策略。

## Evidence → Finding → Path

E-379：旧源码新增场景中，语言描述和两种语言的未就绪反馈真实失败；首次 malformed 场景的 mock 缺少 telemetry getter，失败日志已保留，未把该 TypeError 记为产品缺陷。补齐 mock 的 getUsageStatisticsEnabled 后再对旧源码定向核对，3 个 malformed 场景均明确因为 setModel 已被调用而失败，原缺模型用法场景通过。这直接证明误应用部分输入，不依赖网络或真实账户。

修复后仅运行 modelCommand.test.ts 这一受影响文件，21 项通过、0 跳过、退出 0。包括 7 个新增场景及 14 个已有命令行为：中→英→中描述/反馈、临时与记住调用范围、原限定 @ 模型 ID、供应商文件字节保持、无假密钥输出、4 种错误参数、两语言未就绪，以及已有保存失败脱敏/别名/完成提示/不等待配额/入口转发对照。测试使用独立 locale/providers 路径和临时目录，补上原文件缺少的隔离，不修改个人配置。没有新增 UI 快照、全量或冒烟检查。

复现命令，在 packages/cli：
npx vitest run src/ui/commands/modelCommand.test.ts --coverage.enabled=false
根目录：
npx tsc -p packages/cli/tsconfig.json
npx eslint packages/cli/src/ui/commands/modelCommand.ts packages/cli/src/ui/commands/modelCommand.test.ts
npx prettier --check packages/cli/src/ui/commands/modelCommand.ts packages/cli/src/ui/commands/modelCommand.test.ts
以上最终均退出 0，git diff --check 通过。首格式命令工作目录错位未改文件，随后在仓库根纠正；不把工具路径问题记为产品故障。

E-380：实际 Windows Node v24.19.0 编译源码 CLI + ConPTY + 独立 profile/workspace，无 preload 或假 Config。通过真实 /language、/model set、/model <模型> 与斜杠候选显示完成 16 步/22 条件，21053ms，CLI/验证器退出 0，模型端点 HTTP 请求 0。原生界面先中文后英文显示用法/无效模型/临时与持久反馈，两个语言下 /model 后的 manage/set 描述实际变化。

临时选择 local:model@version 后 settings.model.name 仍为空；多参数错误返回后，模型窗口实际选中项仍是该模型。显式 --persist 后实际 settings.model.name=local:fixture；随后英文临时选择和拼错选项均不覆盖该偏好，模型窗口仍选中 local:model@version。provider 原字节、其他 settings 字段保持，终端未包含假凭据。没有以 mock setModel 冒充实际磁盘写入；新进程恢复已由旧 E-348 等覆盖，本轮不重复安装/重启验收。

该验证未向真实模型服务发请求，没有证明供应商响应质量、真实 Google 配额、最终包或跨平台兼容。不存在配置的分支只能由 E-379 的受控上下文证明，因为实际已启动的 CLI 会有 Config。全终端像素截图或任意极窄窗口不在本轮证据范围。

F-120 → Path：modelCommand.ts 的静态英文/中文混用与参数列表只取首项，使语言模式不一致且错误输入被部分执行。动态描述/当前语言反馈、严格完整参数检查与未就绪错误修复上述路径，保留实际路由与保存范围。

## 证据与保全

工程证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
model-command-before.log / -before-junit.xml（含首 mock 问题）；
model-command-before-validation.log / -before-validation-junit.xml（纠正 mock 后的旧源码复现）；
model-command-test.log / -junit.xml、model-command-compile.log、model-command-lint.log、model-command-format.log；
prepare-model-command-verifier.mjs、verify-source-model-command.mjs、source-model-command.log / -result.json / -terminal-output.txt；
verify-model-command-preservation.mjs、source-model-command-preservation.json。验证脚本不随产品分发。

保全 passed=true：个人 ultra-providers.json / ultra-locale.json / config/skill-tags.json 保持既有 SHA；ultra-tools.json 仍不存在，全局 1.0.0-preview.83；旧 E-294/E-364 的失败文件 SHA 与 passed=false 保持。未改个人数据库、工具安装、PATH 或凭据；仅本验证临时 profile 有明确预期的模型偏好与语言写入。清理 mkdtemp 前验证绝对父目录及专用前缀。

沿用 work/gemini-ultra-agent-20261110/scope.md 的 granted 授权、PRIMARY R26/code-audit 与同会话 lead/cae/doc；目标池、workitems、timeline、field-journal 追加本轮证据，无 Codex 子代理或无关安全扫描。只显式提交本轮两份源码/目标池/交接，推隔离分支并 skip ci，不合并 master 或正式 Release。工程、源码与 Obsidian 三份正式交接全文 SHA 一致。

接续：收敛模型目录与可选账户加载的剩余问题，随后继续协作质量与其余功能。E-294/E-364 真实复杂 Swarm 失败边界仍在，整体 Agent 上线与最终 Windows/macOS/Linux 分发尚未完成，目标保持 active。
