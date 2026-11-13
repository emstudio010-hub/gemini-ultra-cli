# Gemini Ultra CLI 核心密钥缓存与读写一致性交接

日期：2026-11-13。WI-172 / E-397至398 / F-129。源码基线41f3a5d8df28979c69d4fa8ecc3c8b5d737363c3，分支codex/ultra-agent-portable，整体goal active。保持源码优先、Windows必要定向验证、最终各平台包后置；未打包、重装、升版本、多平台CI或重跑付费任务，全局preview.83保持。

## 改动与证据链

core/apiKeyCredentialStorage.ts原先仅在写入开始时清缓存。保存/删除未完成期间的读取仍可拿到并缓存旧值，旧读取在清除之后返回时也直接向调用方发布旧密钥。load把存储错误吞成null并缓存30秒，随后显式读取不能恢复；原读取错误日志还会打印底层异常详情。

现在同一模块实例的saveApiKey/clearApiKey共用mutation队列，调用入队及结束（包括失败）都递增revision、清缓存。load先等待当前排队写入完成，共享正常缓存读取；读取返回后如revision变化，只在这种本地失效情形重新读取，不发布旧快照。失败写入不阻断后续显式写入。原空值保存/默认清除吞删除错误、显式strict清除抛出及合法空结果缓存合同保持。

读取异常让缓存Promise真正拒绝，CacheService按既有身份检查移除失败项；load仍向调用者返回null，但只记固定无凭据诊断。下一次显式读取可以重新访问存储，没有自动重试失败读取或模型请求。正常无密钥结果仍可缓存30秒。未改公共签名或通用CacheService，UI原有save/clear尝试归属和取消规则保持。

E-397：5个新增场景在旧源码4失败/1通过。失败分别为保存期间缓存旧值、清除后旧读取仍发布旧密钥、直接core保存/清除并行、存储读取失败被缓存/日志详情暴露。失败写入后后续保存对照在旧版已经通过，不计新增修复。修复后加入clear→save及并发读共享对照，最终本文件15项全部通过（6新增、9原有）；首修14项也通过。测试存储全mock，未接触个人配置或系统凭据库。

首lint一处提前保存异步expect不符合规则，改为立即接住拒绝并在释放屏障后断言，最终eslint退出0、0warning。最终core及CLI严格源码编译、两文件prettier --check和git diff --check均退出0。测试初始化从clearAllMocks改resetAllMocks，避免新增在途存储实现泄漏到后续用例。未跑全量/冒烟，不重复无关CLI场景。

复现：packages/core下 npx vitest run src/core/apiKeyCredentialStorage.test.ts --coverage.enabled=false；仓库根依次npx tsc -p packages/core/tsconfig.json与npx tsc -p packages/cli/tsconfig.json。旧五场景用-t 'does not cache a value|late old read|direct saves and clears|cache storage failures|failed mutation'。

E-398：Windows Node v24.19.0实际加载编译后的凭据模块/缓存/队列、真实Config.refreshAuth(USE_GEMINI)及原生生成器工厂，仅API-key服务HybridTokenStorage方法使用隔离内存fixture，三处loopback屏障控制真实模块的等待顺序：

1. 保存挂起时并发启动真实Config认证和load。60ms观测期间没有存储读取，认证未ready；释放保存后认证确实使用新密钥，等待读取也得到新值，两调用共享一次存储读取，后续命中缓存。
2. 开始捕获旧密钥的挂起读取，strict清除先完成，新读取为空；释放旧读取后它也返回空，随后缓存仍空，不复活旧值。
3. 删除挂起时排入新保存与两个load；60ms期间新写/读取都未开始。释放后新写完成，两读取得到最新值并共享一次存储读取，所有写入maxActiveWrites=1。
4. 受控存储异常返回null；下一次显式读取恢复，实际日志不含假私有详情。不是用等待30秒或自动重试掩盖错误。

17条件全部通过，5861ms，验证器退出0；恰好3个本地屏障HTTP，0模型生成或外部请求。5秒有界屏障，finally恢复存储prototype/fetch，关闭本地连接，并校验专用mkdtemp绝对父目录/前缀后清理。真实Config未被替换，getContentGeneratorConfig().apiKey只在进程内比较，不输出凭据。只验证构造与本地状态，不证明Google密钥有效性。

F-129 → Path：core/apiKeyCredentialStorage.ts缺少写入完成失效、写入队列与读取快照代次核对；错误被缓存成null且原异常外泄。队列/revision检查/失败Promise移除与固定日志修复这些路径。不会把既有缓存清除就能覆盖的对照误算为新发现。

## 证据与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：auth-key-cache-before.log/-before-junit.xml；auth-key-cache-test.log/-junit.xml、auth-key-cache-final-test.log/-final-junit.xml；auth-key-cache-core-compile.log/-final-core-compile.log、auth-key-cache-cli-compile.log；auth-key-cache-lint.log/-final-lint.log；auth-key-cache-format.log/-final-format-fix.log/-final-format.log；verify-source-auth-key-cache.mjs、source-auth-key-cache.log/-result.json；check-auth-key-cache-evidence.mjs、auth-key-cache-evidence-summary.json；verify-auth-key-cache-preservation.mjs、source-auth-key-cache-preservation.json。

保全passed=true：个人provider/locale/config/skill-tags.json精确SHA、旧E-294/E-364两个真实Swarm失败文件SHA及passed=false保持；ultra-tools.json不存在、全局1.0.0-preview.83。未改个人配置、数据库、真实凭据、工具安装或PATH，未重跑付费任务。原生验证只用独立profile/workspace、假凭据。

沿用granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理或外部扫描。维护目标池/workitems/timeline/field-journal，源码/工程/Obsidian三份报告全文SHA一致；只显式提交本轮源码/目标池/报告，推隔离codex分支并skip ci，不合并master、不Release。

此队列保证同一已加载模块的进程内顺序，不覆盖多进程/模块副本/直接底层存储调用。没有OS操作取消、掉电回滚或凭据库总超时；若底层写入一直挂起，后续读取/写入会等待，外层认证仍可按既有signal停止等待。持续并发修改可导致读取多次因revision失效而重新观察，未声称无饥饿保证。真实Credential Manager、Google账户、完整终端本轮未验收。legacy AppContainer认证选择handler和其不必要的重复入口仍待收敛，再回到目标池剩余功能。复杂真实Swarm的E-294/E-364质量仍失败，完整Agent上线和最终Windows/macOS/Linux包未完成，goal active。
