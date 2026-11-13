# Gemini Ultra CLI 认证请求归属与管理员轮询隔离交接

日期：2026-11-13。WI-167 / E-387至388 / F-124。源码基线 1e304cb5beb257a22e3778546ee072c00d4c656e，分支 codex/ultra-agent-portable，整体 goal active。源码优先，Windows 必要定向验证，最终 Windows/macOS/Linux 包后置。未打包、重装、升版本、跑多平台 CI 或重跑付费任务，全局 preview.83 保持。

## 修复范围

Config.refreshAuth 原先允许两个认证初始化交错提交。旧工厂晚到可覆盖新生成器，旧配额和实验结果可写入新身份，旧管理员读取和轮询也可能覆盖状态或停止较新的轮询。

现在每次认证有独立 generation 和 AbortController。新请求使上一请求失效，导出固定、无凭据的 AuthRefreshSupersededError；refreshAuth 增加可选第五参数 signal。预取消不派发、不破坏已有就绪认证。工厂创建使用 withAbortSignal 停止本次等待，在生成器发布、元数据/管理员结果和 authReady 写入前检查归属。新生成器成功创建后才替换实例，并清除旧配额/实验/preview 缓存；取消工厂不会预先抹去旧 authType。初始化尚未就绪时切换 session 也使旧认证失效。

配额启动请求合并本次 owner 信号与原十秒期限，信号传到底层 HTTP；独立 refreshUserQuota 记录 generation，拒绝旧身份迟到的结果。实验读取仍按后端共享，取消只结束本次等待，不强行终止其他调用可能复用的 loader；写 Config 前再次检查。共享实验自身原十秒期限保持。

管理员 fetchAdminControls 及 CodeAssistServer.fetchAdminControls 新增可选 signal。初始读取在取消后不发布设置或启动轮询；轮询带独立 owner token，旧在途响应即使来自 legacy 无 signal 调用也不能覆盖/停止新 poller。已完成认证的 controller 保留到下一次认证，以便新请求取消归属于上一认证的轮询，不能在 finally 无条件清空。认证方式、后端客户端或身份指纹变化时丢弃旧管理员缓存；首次可信启动缓存及匹配 startup handoff 仍保留。

useAuth 与 AppContainer 手动选择/密钥提交的 catch 识别类型化 supersession，不把旧请求失效报成新登录错误。本轮尚未把 UI Esc 接到 core 的第五参数，也没有给手工认证前置步骤加完整尝试 token。

## Evidence → Finding → Path

E-387：旧源码 8 个定向场景全部失败，涵盖旧配置/生成器工厂、预取消/外部取消、旧元数据、管理员读取及旧轮询、HTTP signal。修复后首批 42 项通过；补充管理员相关对照及独立配额 generation、同认证方式换身份缓存场景共 25 项通过；CLI 4 项覆盖类型化 supersession、取消后晚到成功/失败及同状态显式重试。check-auth-ownership-evidence.mjs 按 classname/name 合并 JUnit，共 69 个不同相关场景全部通过，无全量或冒烟检查。

首编译前测试回调类型已改为无参 release 闭包；首 lint 两处 const/一个空对象类型已修。首格式检查只报告 config.test.ts，格式修复后九文件 prettier --check 退出 0。最终 core 与 CLI 严格源码编译、九文件 eslint 和 git diff --check 退出 0。部分 React act 日志保留，不隐藏、不当作已证实产品故障。格式修复只改空白，不重复整套检查。

复现命令：仓库根 npx tsc -p packages/core/tsconfig.json 与 npx tsc -p packages/cli/tsconfig.json。core 下 npx vitest run src/config/config.test.ts src/code_assist/admin/admin_controls.test.ts -t 'previous auth generation|refetches admin settings|fetchAdminControls|polling|poller|owned initial read' --coverage.enabled=false。CLI 下 npx vitest run src/ui/auth/useAuth.test.tsx -t 'superseded|late auth|fresh explicit attempt even|initial auth' --coverage.enabled=false。首批精确定向命令和八个旧复现保存在对应日志/JUnit。

E-388：Windows Node v24.19.0 实际加载编译 core，真实 Config.refreshAuth(GATEWAY)、真实 gateway 生成器工厂及 CodeAssistServer/requestPost。仅元数据 getContentGenerator 查找适配到两个真实 CodeAssistServer，AuthClient.request 将元数据 HTTP 转送 loopback；保留原 getter 观察真正生成器，未把工厂或 Config 替换成假返回。

quota 场景挂起旧 quota/experiments 后启动新认证，旧 auth 返回 AuthRefreshSupersededError，旧 quota HTTP 实际关闭，新生成器独立发布，quota=.8、experiments=[222]。之后释放仍共享的旧 experiments=[111]，真实 loader 完成，Config 新数据/生成器仍保持。admin 场景通过实验标志开启管理员控制，挂起旧管理员 HTTP，启动新认证后该连接实际关闭，新管理员设置 mcpEnabled=true 正常发布，旧结果不能覆盖。finally 显式停止真实轮询，关闭本地连接并在校验专用 mkdtemp 绝对父目录/前缀后清理。

验证器 19 条件全部通过，4634ms，退出 0；恰好 10 个本地元数据请求、0 模型生成、0 自动重试或外部请求。5 秒有界屏障确认请求开始/关闭，非只凭 mock 被调用就宣称网络取消。共享实验没有因 owner supersession 被取消，其晚到结果只被 Config 拒绝提交。

F-124 → Path：config/config.ts 缺少认证归属导致异步结果越代发布；code_assist/admin/admin_controls.ts 缺少 poller owner 和传输取消；server.ts 缺少管理员 signal。generation/owner 检查、取消本次等待/自有 HTTP，以及 CLI 类型化忽略修复这些路径。

## 证据、保全与接续

工程根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：

- auth-ownership-before.log / -before-junit.xml；
- auth-ownership-test.log / -junit.xml、auth-ownership-admin-test.log / -admin-junit.xml、auth-ownership-ui-test.log / -ui-junit.xml；
- auth-ownership-core-compile.log / -core-final-compile.log、auth-ownership-cli-compile.log；
- auth-ownership-lint.log / -final-lint.log、auth-ownership-format.log / -format-fix.log / -final-format.log；
- verify-source-auth-ownership.mjs、source-auth-ownership.log / -result.json；
- check-auth-ownership-evidence.mjs、auth-ownership-evidence-summary.json；
- verify-auth-ownership-preservation.mjs、source-auth-ownership-preservation.json。

保全 passed=true：个人 provider / locale / config/skill-tags.json 与旧 E-294/E-364 失败文件 SHA 保持，两个旧结果仍 passed=false；ultra-tools.json 不存在、全局仍 1.0.0-preview.83。未改个人数据库、工具安装、PATH 或真实凭据。只显式提交本轮源码、目标池、正式报告，推隔离分支并 skip ci；不合并 master、不 Release。

沿用 granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit，同会话 lead/cae/doc，无 Codex 子代理或无关扫描。目标池/workitems/timeline/field-journal 同步，源码/工程/Obsidian 三份正式交接全文 SHA 相同。

本轮不是完整认证原子回滚：共享 OAuth/setup/凭据工作可能后台继续，工厂内部副作用未撤回；fallback/history 等同步开始动作不回滚。管理员服务没有新增总超时，保留原错误处理，不宣称失败等于权限放开。legacy 无 signal 的初始管理员读取仍无全局 operation epoch；Config 已全部传 owner signal。真实 Google 登录、OS 凭据库、手工提交时序、UI Esc 到 core 取消、最终包与跨平台未验收。

接续优先将 UI 尝试生命周期传入 core 取消信号，处理手工认证选择/保存前置步骤晚启动，再收敛剩余功能。真实复杂 Swarm 的 E-294/E-364 质量失败仍未通过，完整 Agent 上线目标保持 active。
