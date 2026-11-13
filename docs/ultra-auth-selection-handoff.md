# Gemini Ultra CLI 认证选择归属与迟到重启隔离交接

日期：2026-11-13。WI-169 / E-391至392 / F-126。源码基线 fa9e66f0375af27bfe87d023f3f2c1b0d79fff16，分支 codex/ultra-agent-portable，整体 goal active。上一轮为自动认证接通 Esc 到 core 的取消，本轮处理实际 AuthDialog 选择前置流程。保持源码优先、Windows 必要定向验证、最终各平台包后置；未打包、重装、升版本、多平台 CI 或重跑付费任务，全局 preview.83 保持。

## 修复范围

AuthDialog 的异步校验与清凭据原先没有选择归属。用户移动到其他选项、按 Esc 回到既有方式、选择新方式或卸载窗口后，旧结果仍可显示错误、清除当前供应商、写认证方式、设置重启上下文，甚至安排 Google 登录重启。

现在窗口有 mounted/selection 生命周期。每个新选择取得独立编号，在校验返回、凭据清理完成/异常及后续提交前检查。切换高亮、新选择、Esc、打开供应商表单/其关闭提交和卸载使旧选择失效。供应商清除与 restart context 移到异步清理之后、确认仍为当前选择才执行；旧操作不再提前清空当前供应商。

重启延时记录在本窗口生命周期中，卸载清理 timer，回调与失败处理再次核对当前选择；重启状态不再响应认证选择的 Esc 处理器。已开始的 relaunchApp 内部工作不提供回滚；这只是旧选择不能再发起重启或发布其迟到错误。原强制方式过滤、显式 API key 输入、非 Google 切换时凭据清理失败仍可继续等行为保持，未改快照。

## Evidence → Finding → Path

E-391：旧源码定向运行 7 个新增场景，6 个实际失败，包括旧校验成功/错误在高亮变化后继续提交、旧凭据清理成功/失败覆盖新选择、卸载后校验继续及 Esc 后旧选择继续。第七个重启取消检查原先只观察 process.exit/cleanup，动态导入未完成时不能区分行为，旧代码也通过；没有把它算作旧缺陷复现。

修复后首批 25 通过、1 个既有重启对照失败并出现 1 次迟到 process.exit 拒绝。原因是旧测试将真实 relaunchApp 的动态导入与退出当作同步调用，恢复退出 spy 后异步工作才完成。将正向/卸载反向两个场景改为直接观察 relaunchApp 边界；正向明确携带 overrideAuthType，反向在卸载后推进 timer 不派发。不把这项 fixture 修正算成产品修复，也不声称本轮证明 supervisor 退出/重启。

最终 26 项相关场景全部通过（7 新增与19相关对照），只运行 handleAuthSelect/useKeypress 两组；13 个未涉及的外观/初始选项场景跳过，未更新快照、未跑全量或冒烟。隔离修复后再次运行相同26项通过。最终 CLI 严格源码编译、两文件 eslint、prettier --check 和 git diff --check 均退出 0、0 lint warning。core 本轮未改，不重复 core 编译/检查。React act 日志保留。

复现：packages/cli 下 npx vitest run src/ui/auth/AuthDialog.test.tsx -t 'handleAuthSelect|useKeypress' --coverage.enabled=false。仓库根 npx tsc -p packages/cli/tsconfig.json。check-auth-selection-evidence.mjs 核对旧6失败/1不具区分性、最终26通过和原生结果。

E-392：Windows Node v24.19.0 实际源码 CLI、ConPTY、AuthDialog、真实 Config/gateway。观察器只把独立 profile 的 fs.promises.rm(Storage.getOAuthCredsPath()) 延后到 loopback 屏障；释放后实际执行该临时路径的删除，并让原 clearCachedCredentialFile 后续步骤自然结束。未修改或读取真实 OAuth 凭据。

实际按键：输入就绪 → /auth → 下移到 Google 并 Enter → 确认凭据清理屏障已到达、仍未完成 → 下移高亮 Gemini API Key，但不提交 → 释放旧清理 → 等真实删除结束并强制 resize 重绘，仍为认证选择、原 provider/settings 字节保持 → Esc 使用原 gateway → /stats session → /quit。

5 步/19 条件通过，14892ms，CLI/验证器退出 0；恰好1个本地清理屏障 HTTP、0模型请求/外部请求。旧清理实际结束后没有清掉 gateway、写入 Google 认证或启动 native auth。观察器在意外 native auth 派发时本地拒绝，防止受控验证进入真实 Google 登录；实际无该派发事件。三次认证均为真实 gateway（两段启动+Esc重登），本地统计可用。屏障400ms后的provider/settings及最终字节检查均保持。

F-126 → Path：ui/auth/AuthDialog.tsx 缺少选择编号、卸载失效与归属化 restart timer，且在清凭据等待前提前清除供应商。返回前检查、同步失效、延后提交和 timer 清理修复这些 UI 选择路径。它不是密钥存储或完整认证事务回滚。

## 本轮配置误触与恢复

本轮首次旧源码定向测试沿用了 AuthDialog.test.tsx 的部分真实 core mock，未隔离 ProviderManager。旧选择路径对个人 ultra-providers.json 执行了 setActiveSelection(undefined)，清掉 activeProviderId/activeModel。首次保全发现 SHA 从既有 e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332 变为 f87a03a8ef3a0b61f03c40c0361ae32a5b3b675638bc7a1e8cec167a14511ef0，立即停止此路径并告知用户；不是用户主动改动或正常产品迁移。

恢复脚本先确认当前仍为已知误触 SHA、.bak 为本阶段前准确 SHA，逐字段确认只有 activeProviderId/activeModel 改变，供应商记录/凭据等其他字段一致，然后用原备份字节恢复。最终个人配置 SHA 精确回到 e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332。.bak 保持，未打印或另行导出密钥。

测试现在显式 mock ProviderManager.getInstance，使用内存 fixture 供应商和 setActiveSelection spy。补充断言确保较新选择只清除一次，旧清理不再派发额外清除；隔离后26项重验通过，随后再次保全通过。保留首次失败保全、恢复记录和恢复后结果，不把本轮写成个人配置从未被改过。

## 证据与接续

工程根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：

- auth-selection-before.log / -before-junit.xml；
- auth-selection-test.log / -junit.xml（首25成功/1失败/1未处理拒绝）；
- auth-selection-final-test.log / -final-junit.xml（首26通过）；
- auth-selection-isolated-test.log / -isolated-junit.xml（隔离后26通过）；
- auth-selection-compile.log / -final-compile.log / -release-compile.log；
- auth-selection-lint.log / -final-lint.log / -isolated-lint.log；
- auth-selection-format.log / -final-format.log / -isolation-format.log / -release-format.log；
- observe-source-auth-selection.mjs、prepare-auth-selection-verifier.mjs、verify-source-auth-selection.mjs；
- source-auth-selection.log / -result.json / -terminal-output.txt；
- restore-auth-selection-provider.mjs、auth-selection-provider-restoration.json；
- source-auth-selection-preservation-first-failed.json、verify-auth-selection-preservation.mjs、source-auth-selection-preservation.json；
- check-auth-selection-evidence.mjs、auth-selection-evidence-summary.json。

最终保全 passed=true：个人 provider/locale/config/skill-tags.json 精确 SHA 保持/恢复；旧E-294/E-364两个真实Swarm失败文件SHA与passed=false保持，ultra-tools.json不存在，全局仍1.0.0-preview.83。未改个人数据库、工具安装、PATH，未重跑付费任务。原生验证独立 profile/workspace 关闭后核对 mkdtemp 绝对父目录及专用前缀再清理。

沿用 granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit，同会话 lead/cae/doc，无 Codex 子代理或外部扫描；维护目标池/workitems/timeline/field-journal与源码/工程/Obsidian三份全文SHA一致报告。只显式提交本轮源码、目标池和报告，推隔离分支并skip ci，不合并master、不Release。

本轮不终止已经开始的清凭据OS操作，不恢复已删除的真实凭据，不取消已进入relaunchApp内部的工作，也不提供配置跨文件原子提交。Google OAuth、真实凭据库、最终安装包/跨平台未验收。AppContainer手工API key保存及legacy认证选择处理器仍需统一尝试归属；ApiAuthDialog清密钥流程也待审查。复杂真实Swarm的E-294/E-364质量仍未通过，完整Agent上线与最终Windows/macOS/Linux包未完成，goal active。
