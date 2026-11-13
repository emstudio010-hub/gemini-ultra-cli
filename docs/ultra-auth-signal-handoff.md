# Gemini Ultra CLI 界面认证取消信号贯通交接

日期：2026-11-13。WI-168 / E-389至390 / F-125。源码基线 2e590efc130996be3e4ed6195cb8c2a756628650，分支 codex/ultra-agent-portable；整体 goal active。上一轮完成 core 请求归属与自有 HTTP 取消，本轮补齐自动认证钩子的 UI 到 core 信号链路。继续源码优先、Windows 必要定向验证、最终各平台包后置；无打包、重装、升版本、多平台 CI 或付费任务重跑，全局 preview.83 保持。

## 修复范围

useAuth 原先只有界面尝试编号和迟到结果隔离，refreshAuth 调用没有第五参数 signal。因此 Esc / onAuthError / 重新选择 / 卸载虽然离开等待界面，core 仍继续等待配额或管理员请求。

现在每个自动认证 effect 有独立 AbortController，signal 传入 Config.refreshAuth 的可选第五参数。公开 setAuthState 同步使旧尝试失效并取消尚未完成的 controller，不等待 React effect cleanup；组件卸载和旧 effect 清理同样取消归属于自己的请求，同状态显式重试使用新 signal。取消原因使用固定、无凭据的 AuthRefreshSupersededError；上一轮 core 已负责停止 owner 等待、取消其 quota/admin HTTP 和阻止迟到提交。

refreshAuth 完成时在 finally 解除 UI 对该 controller 的持有，再发布已认证状态。成功后的界面状态迁移、打开选择窗口和卸载不会取消已完成的 signal，避免误停 core 所拥有的后续管理员轮询。core 的下一次 refreshAuth 仍按 WI-167 取消上一认证拥有的轮询。首次已就绪认证复用、环境/强制方式校验、密钥加载及旧结果隔离保持。

本轮仅改变 useAuth.ts 和对应测试；AppContainer 手工 API key 保存/选择处理器、AuthDialog 的校验/清凭据/重启等前置异步步骤尚未统一到此 controller，不宣称所有认证事务均已可取消。

## Evidence → Finding → Path

E-389：新增 5 个场景在旧源码全部失败：onAuthError 取消、状态切换回选择、卸载、同状态显式重试没有取消 core 信号，以及正常完成时没有 signal。前四项明确在 React effect cleanup 前检查 abort 事件；重试检查新信号独立且未取消，正常完成对照检查后续打开选择/卸载不取消已完成信号。旧失败记录保留。

修复后 useAuth.test.tsx 40 项全部通过（5 新增、35 原有相关场景），含取消后晚到 resolve/reject、旧错误不能覆盖新成功、密钥读取顺序/异常、初始就绪认证复用及环境校验。六个原有 refreshAuth 参数断言同步检查真实新增 signal，未改预期业务状态或快照。未运行全量或冒烟。

CLI 严格源码编译 npx tsc -p packages/cli/tsconfig.json 退出 0，两文件 eslint 退出 0、0 warning，最终 prettier --check 与 git diff --check 退出 0。首格式检查只报新测试换行，修复后通过；只改空白，不重复整套。core 本轮未改，不重复 core 编译/测试。部分 React act 日志保留，不隐藏。

复现：packages/cli 下 npx vitest run src/ui/auth/useAuth.test.tsx --coverage.enabled=false。旧五场景使用 -t 'cancels the pending core|does not abort a completed core'。check-auth-signal-evidence.mjs 校验旧 5 失败、修后 40 成功及两个 Windows 结果。

E-390：Windows Node v24.19.0 实际源码 CLI、ConPTY、useAuth、DialogManager、AuthDialog、真实 Config.refreshAuth(GATEWAY)、真实 gateway 工厂及 CodeAssistServer/requestPost。启动前两段认证正常使用隔离 gateway，无替换 Config 或延后整个 refreshAuth。第三次认证仅把元数据 backend 查找适配到真实 CodeAssistServer，AuthClient.request 将 HTTP 送本地 loopback。

实际按键：输入就绪 → /auth → Esc 开始重新认证 → 等待真实挂起请求已到达本地服务 → Esc 取消 → 观察回到选择窗口、core typed rejection 和 HTTP 关闭 → resize 强制重绘仍在选择窗口 → 清除取消消息后 Esc 显式重试 → /stats session → /quit。挂起响应没有由验证器释放或自动返回，连接由实际取消链路关闭；验证器等待关闭及 core 终态后才继续。

quota 场景：实验立即返回、配额挂起；Esc 至连接关闭本机单次观测 68ms。第三次 core 拒绝 AuthRefreshSupersededError、ready=false、未发布配额。第四次真实认证完成，统计可用。7 步/22 条件通过，14550ms，CLI/验证器退出 0，2 本地元数据 HTTP、0 模型请求。

admin 场景：配额和实验立即返回，真实实验标志开启管理员读取，管理员 HTTP 挂起；Esc 至关闭本机单次观测 73ms。core 拒绝且 ready=false，已完成的 .4 配额保持，不把取消等同于全部状态回滚。第四次真实认证与统计恢复。7 步/22 条件通过，13425ms，CLI/验证器退出 0，3 本地元数据 HTTP、0 模型请求。

两场景 signal 实际传到 HTTP，只有第三次等待被取消；0 自动重试/外部 fetch，provider/settings 字节保持、终端不含假 Key 或底层异常详情。68/73ms 只是本机单次取消观测，不是总体启动/账户服务性能基准。保留前置五秒取消判据和总四十五秒观察上限；观察器/验证器本阶段无失败重跑。

F-125 → Path：ui/auth/useAuth.ts 只做 UI 结果隔离，未向 core 传递取消信号，导致离开等待后仍占用自有 HTTP。加入 per-effect controller、同步取消及完成后解除持有，将已有核心 owner 机制接到实际 Esc 路径。

## 证据、保全与接续

工程根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：

- auth-signal-before.log / -before-junit.xml；
- auth-signal-test.log / -junit.xml、auth-signal-compile.log、auth-signal-lint.log；
- auth-signal-format.log / -format-fix.log / -final-format.log；
- observe-source-auth-signal.mjs、prepare-auth-signal-verifier.mjs、verify-source-auth-signal.mjs；
- source-auth-signal-{quota,admin}.log / -result.json / -terminal-output.txt；
- check-auth-signal-evidence.mjs、auth-signal-evidence-summary.json；
- verify-auth-signal-preservation.mjs、source-auth-signal-preservation.json。

保全 passed=true：个人 provider/locale/config/skill-tags.json SHA 与旧 E-294/E-364 失败结果 SHA 保持，旧两结果仍 passed=false；ultra-tools.json 不存在、全局仍 1.0.0-preview.83。未修改个人数据库、工具安装、PATH 或真实凭据，只使用独立 profile/workspace 和假凭据；关闭本地服务/终端后核对 mkdtemp 绝对父目录及专用前缀再清理。

沿用 granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit，lead/cae/doc 同会话，无 Codex 子代理或外部扫描。维护目标池/workitems/timeline/field-journal，源码/工程/Obsidian 三份正式交接全文 SHA 相同。只显式提交本轮源码、目标池和报告，推隔离 codex 分支并 skip ci，不合并 master、不 Release。

共享 OAuth/setup/凭据工作的内部副作用仍可能后台继续；UI controller 取消的是本次 core 等待及自有 HTTP，不证明共享 SDK 全部终止，也不提供完整原子回滚。真实 Google OAuth、系统凭据库、三分钟 timeout 实时触发、成功后的真实五分钟管理员轮询和手工保存/选择事务不在本轮原生验证范围。正常完成后 signal 保持通过 hook 对照验证，不能冒称已观察真实五分钟轮询。

接续优先收敛 AppContainer 手工密钥保存/认证选择及 AuthDialog 前置异步步骤的旧尝试晚启动、迟到错误和重启问题；随后回到目标池剩余功能。复杂真实 Swarm 的 E-294/E-364 质量仍未通过，完整 Agent 上线、最终 Windows/macOS/Linux 包仍未完成，goal active。
