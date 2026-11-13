# Gemini Ultra CLI 模型窗口即时打开与配额取消交接

日期：2026-11-13。WI-162 / E-377至378 / F-119。持续目标 active，源码基线 a891ab821164c28cce93f4d8ddf960df96f8c9ee，隔离分支 codex/ultra-agent-portable。沿用源码优先、Windows 必要定向验证，功能收敛后才统一最终 Windows/macOS/Linux 分发。全局 preview.83 保持，无打包、重装、版本变化、多平台 CI、付费或外部模型请求。

## 修复与行为

/model 与 /model manage 原先 await refreshUserQuota 才返回 dialog；可选账户请求挂起时，整个模型选择窗打不开。现命令直接返回窗口，列表和已有缓存立即可用；窗口挂载后刷新一次，10 秒上限，无自动重试。成功后更新用量显示；失败或超时保留缓存，不阻止选模。刷新状态和账户/已有缓存情况下的失败提示支持中英文；无原生配额的网关不会留下常驻“配额不可用”提示。

窗口卸载时取消自己的刷新并清理计时器。Config.refreshUserQuota 新增可选 AbortSignal，复用既有 withAbortSignal，在开始前和返回后检查取消；取消按原 reason 拒绝，普通错误仍沿用 undefined 的非致命行为。即使适配器忽略 signal，取消也结束等待，迟到结果不得更新 quota/preview 缓存或发变更事件。CodeAssistServer.retrieveUserQuota 将 signal 传入现有 requestPost → authClient.request；不带 signal 的旧调用形状保持。共享 experiments 访问查询只加卸载保护与异常处理，不取消共享加载。

模型列表、限定模型 ID 路由、Tab Remember、模型保存范围不改。10 秒是本窗口拥有的配额刷新期限，不是全局模型请求期限。未改变账户认证、Google 服务端配额计算或既有后台配额策略。

## Evidence → Finding → Path

E-377：旧源码在新增的 3 个 core 和 4 个 CLI 场景中失败；其中旧配额无法取消的等待达到原测试 60 秒上限。修后 core 的预取消零派发、迟到结果不覆盖较新缓存/preview、HTTP signal 传递 3 项通过，旧无 signal endpoint/缓存更新相关 4 项对照通过。CLI 的两个命令入口、窗口缓存即时显示和成功更新、关闭取消、两种模型目录的语言/Remember 保持及原 main 视图快照共 7 项通过。共 14 个不同定向场景，未运行全量或冒烟检查，未更新原 main 快照。

core/CLI 的 npx tsc -p packages/{core,cli}/tsconfig.json 及 8 个受影响文件 eslint 最终均退出 0，prettier --check 和 git diff --check 通过。首修后命令检查错误地只等待一个 microtask，已经改为等待命令返回的断言；首 lint 的箭头函数/异步断言问题纠正后通过。测试仍记录 React act 提示；一次尝试把异步渲染整体包进 act 导致渲染期间耗尽 10 秒限时，该夹具修改已撤回，失败日志/JUnit 保留，不当作产品缺陷或“首次即通过”。Windows 终端结果独立于该渲染夹具。

复现命令在 packages/core：
npx vitest run src/config/config.test.ts src/code_assist/server.test.ts -t 'pre-cancelled quota refresh|prevents a late response|forwards quota cancellation' --coverage.enabled=false
对照：
npx vitest run src/config/config.test.ts src/code_assist/server.test.ts -t 'should call the retrieveUserQuota endpoint|should update hasAccessToPreviewModel to false|should derive quota from remainingFraction' --coverage.enabled=false
CLI 在 packages/cli：
npx vitest run src/ui/commands/modelCommand.test.ts src/ui/components/ModelDialog.test.tsx -t 'without starting or waiting|opens manage immediately|opens with cached quota|cancels quota refresh on close|updates model dialog language|renders the initial' --coverage.enabled=false

E-378：Windows Node v24.19.0 实际编译源码 CLI、ConPTY、独立 profile/workspace，使用真实 ModelDialog/Config/CodeAssistServer/requestPost/缓存实现，仅在 authClient.request 边界把账户 HTTP 适配到本地受控服务。启动就绪后启用适配，不改变真实用户登录或模型配置。

四次打开依次取得 50% 已用缓存、挂起并 Esc 关闭、成功更新为 85% 已用、中文窗口挂起到真实 10 秒超时。四个 signal 全部到达 HTTP 边界；第二和第四请求的实际连接关闭，取消后的 core 缓存分别保持原 0.5/0.15 remainingFraction，窗口仍能关闭并执行 /quit。9 步/21 条件通过，28283ms，CLI 与验证器退出 0，4 次 loopback quota / 0 模型生成 / 0 外部请求，无自动重试。记录的单次开窗输出观测为 188/743/63/94ms，仅作本机观测，不作为稳定性能或总体启动基准。

这是受控账户传输验证，不是 Google OAuth、真实余额准确性、真实网络服务可用性、最终安装包或跨平台验收。忽略信号的迟到响应由 core 受控 Promise 场景证明；原生终端场景证明实际 HTTP 取消与缓存显示。

F-119 → Path：命令开窗前阻塞在可选账户请求，且 core 无取消保护，关闭后的结果仍可能写缓存。将等待移入可见窗口、限定生命周期并传递取消，使选择与远程刷新解耦，保留功能和失败边界。

## 证据、保全与接续

工程证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
model-quota-core-before.log / -before-junit.xml、model-quota-cli-before.log / -before-junit.xml；
model-quota-core-test.log / -junit.xml、model-quota-core-controls.log / -final-test.log；
model-quota-cli-first-test.log / -first-junit.xml、model-quota-cli-act-attempt-test.log / -act-attempt-junit.xml、model-quota-cli-final-test.log / -final-junit.xml；
model-quota-{core,cli}-final-compile.log、model-quota-lint.log / -final-lint.log、model-quota-format.log；
observe-source-model-quota.mjs、prepare-model-quota-verifier.mjs、verify-source-model-quota.mjs、source-model-quota.log / -result.json / -terminal-output.txt；
verify-model-quota-preservation.mjs、source-model-quota-preservation.json。验证脚本不作为用户功能分发。

保全检查 passed=true：个人 provider / locale / config/skill-tags.json SHA 保持，ultra-tools.json 仍不存在，全局仍 1.0.0-preview.83；E-294/E-364 两次旧真实失败文件 SHA 和 passed=false 保持，未重跑付费任务。个人数据库、工具安装、PATH 与凭据未改；本验证仅使用假凭据，临时 mkdtemp 清理前验证绝对父目录与名称前缀。

沿用已 granted 的 work/gemini-ultra-agent-20261110/scope.md，PRIMARY R26/code-audit，lead/cae/doc 由同会话承担，记录目标池、timeline、workitems 与脱敏 field-journal。未运行无关安全扫描或 Codex 子代理。只显式提交本轮源码/目标池/交接，推隔离分支并 skip ci，不合并 master、不正式 Release。

接续优先处理模型命令的错误反馈与语言一致性，再收敛可选账户/目录加载路径。真实复杂 Swarm 质量仍有 E-294/E-364 未通过边界，不能以本地夹具替代；最终 Windows/macOS/Linux 包继续后置，整体目标保持 active。
