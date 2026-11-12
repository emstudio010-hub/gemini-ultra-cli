# Gemini Ultra CLI 外部网关原生认证交接

日期：2026-11-13。WI-139 / E-332至333 / F-098。持续目标active。源码优先，Windows必要定向验证，功能收敛后最终统一打包。全局安装仍preview.83；本轮无打包、重装、升版本或跨平台CI。

## 修复

F-098：仅外部网关认证时，createContentGenerator实际创建ExternalFallbackGenerator，再包装UniversalContentGenerator。成员选择native:gemini-*或主模型为未登记裸模型时，原先先扣请求预算再调用不具备原生生成能力的fallback，抛普通Error。用户得到API故障而缺少原生认证指引。

现在生成与流式生成先解析路由；仅在无可用外部路由且fallback确为ExternalFallbackGenerator时，抛ProviderRouteError。提示通过/provider list、/model选择已配置模型，或通过/auth配置原生认证。拒绝发生于请求预算和模型观察记录之前。真正有原生生成器的会话仍可使用原生模型，外部可解析模型仍走原协议。countTokens及容量元数据保留离线能力，不因生成认证限制而被拒绝。没有修改个人认证或自动切换模型。

## Evidence → Finding → Path

E-332：三个旧缺陷复现失败：native生成、native流式、未登记主模型均缺少/auth诊断并提前改变预算。另一个离线估算对照的初始精确数字断言错误：旧内容正规化使估算为32而非19，这不是产品缺陷。修后首次5通过、该估算对照失败；将其改为正整数且零fetch的实际契约后，最终6项通过、39项不相关跳过。旧日志全部保留。core严格类型及源码编译、两个修改文件eslint均退出0。

命令（packages/core）：`npx vitest run src/agents/agentModelRouting.test.ts src/core/turn.test.ts --coverage.enabled=false --testNamePattern='rejects unsupported external-only|keeps offline token estimates available|selects native fallback explicitly|returns a local provider route error'`。根目录：`npx tsc -p packages/core/tsconfig.json`。没有全量或冒烟测试。

E-333：在确认编译退出0后，Windows Node v24.19.0加载实际编译Config/storage及createContentGenerator的GATEWAY构造链。隔离profile、active Boost预算、本地OpenAI协议服务器。两条native生成路径及未登记主模型均本地ProviderRouteError并包含/auth，预算字节保持、零HTTP；离线估算返回正整数。随后已登记外部模型成功，唯一loopback请求的路径、模型及假认证头匹配，累计请求恰为1；供应商文件保持、成员作用域无泄漏。11条件通过，4905ms/退出0。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。native-gateway-auth-before.log/-junit.xml、native-gateway-auth.log/-junit.xml、native-gateway-auth-final.log/-junit.xml、native-gateway-auth-source-compile.log、native-gateway-auth-lint.log、verify-source-native-gateway-auth.mjs、source-native-gateway-auth-result.json、source-native-gateway-auth.log。验证脚本留工程目录，不随包分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由本会话承担。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

这证明Windows源码网关构造链和本地协议对照，不证明Google认证、真实供应商任务质量、完整交互终端或长期稳定性。没有外部安全目标、付费任务重跑、个人数据库改动或原生逆向工具调用。更多源码完整性、复杂任务及最终Windows/macOS/Linux交付仍待收敛，goal保持active。隔离codex分支同步带skip ci，不合并master或正式Release。

后续按既定顺序自动推进：核对剩余源码功能缺口；对新确认缺陷做最小Windows定向验证；维护目标池与交接；最终功能收敛后统一打包验收。无需为既已授权工作重新确认。
