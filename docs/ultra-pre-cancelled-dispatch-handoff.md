# Gemini Ultra CLI 请求前取消交接

日期：2026-11-13。WI-140 / E-334至335 / F-099。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装仍preview.83，本轮无打包、重装、升版本或跨平台CI。

## 修复

F-099：UniversalContentGenerator的普通及流式生成在检查请求取消信号之前预留Swarm/工作流请求额度。已经取消或已超时的调用仍会改变累计请求数、记录模型并进入适配器；仅gateway认证的native选择还会先报告认证路由错误，掩盖取消原因。

现在两个入口均首先调用request.config?.abortSignal?.throwIfAborted()，在模型解析、预算记账、模型观察和任何适配器调用之前保留原signal.reason拒绝。有效请求仍按原路由和预算运行。只处理进入生成器时已经aborted的请求，不回退或重置累计预算，不修改在途取消/流收尾协议。

## Evidence → Finding → Path

E-334：8个旧实现复现全部失败，工作流/Swarm × native/外部 × 普通/流式生成均改写预算字节。修复后8项及既有主生成/流式共享预算与取消后正常调用对照共9项通过，6项不相关场景跳过；core严格类型及源码编译、两个修改文件eslint均退出0。没有全量或冒烟。

命令（packages/core）：`npx vitest run src/providers/requestCancellation.test.ts src/providers/swarm-budget.test.ts --coverage.enabled=false --testNamePattern='pre-cancelled|shares the main streaming'`。根目录：`npx tsc -p packages/core/tsconfig.json`。before运行只执行新文件，保留8失败日志及JUnit。

E-335：确认编译退出0后，Windows Node v24.19.0使用实际编译Config/storage、GATEWAY及USE_GEMINI构造链，独立profile和loopback服务。两种预算各覆盖native生成器、可解析外部模型及仅gateway的不可用native三种路径的普通/流式生成，共12次预取消调用。普通使用AbortError，流式使用TimeoutError，均保留同一个reason对象；状态字节保持、模型观察为空、零fetch。然后每种预算各发一次正常外部请求成功，累计requests均恰为1；全部9组汇总条件通过，4962ms/退出0，2次loopback控制请求、0真实服务请求。原生构造链使用未发送的假凭据，不代表Google认证已通过。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。pre-cancelled-dispatch-before.log/-junit.xml、pre-cancelled-dispatch.log/-junit.xml、pre-cancelled-dispatch-format.log、pre-cancelled-dispatch-source-compile.log、pre-cancelled-dispatch-lint.log、verify-source-pre-cancelled-dispatch.mjs、source-pre-cancelled-dispatch-result.json、source-pre-cancelled-dispatch.log。验证脚本保留工程目录，不随包分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由本会话承担。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。没有付费任务重跑、个人数据库修改、外部安全目标或原生逆向工具调用。

这只证明生成入口的预取消行为和后续正常外部调用，不证明在途取消、完整终端交互、真实模型任务质量或长会话稳定性。功能池仍有复杂逆向语义与最终跨平台交付等未完成项；不将当前局部修复冒称全面上线。隔离codex分支同步带skip ci，不合并master或正式Release。后续继续核对源码功能缺口、做必要Windows定向验证、维护交接，最终收敛后统一打包；goal保持active。
