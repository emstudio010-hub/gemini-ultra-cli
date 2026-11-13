# Gemini Ultra CLI 本地统计不再等待账户刷新交接

日期：2026-11-13。WI-161 / E-375至376 / F-118。持续目标 active，源码基线 9d53b55。继续源码优先、Windows 必要定向验证，功能收敛后才统一最终平台包。全局 preview.83 保持，无打包、重装、版本变化、多平台 CI 或外部/付费模型请求。

## 修复

statsCommand.defaultSessionView 原先在 ui.addItem 前 Promise.all 等待 refreshUserQuota 与 refreshAvailableCredits。任何可选账户刷新不结束，本地统计也不显示，命令无法自然收尾；信用点数却在等待前已读取，因此本次显示仍是先前快照。会话概览本身使用本地 metrics，远程等待没有为其主要内容提供必要数据。

现在 /stats 与 /stats session 同步构造本地统计，用 getLastRetrievedQuota 及原配额 getters 填入已有缓存，不触发账户刷新，也不添加后台请求、重试或计时器。已有缓存保持，未知配额不冒充无限；账户身份/等级/点数沿用当前缓存，不声称这次查询获得最新服务端余额。/stats model、/stats tools 的既有本地行为保持。

本轮没有改变核心配额/点数刷新实现或记账策略。显式 /model 仍沿用原有 refreshUserQuota；其对可选刷新 await 的相邻加载问题已定位，接续处理，不把本次统计修复外推为所有窗口加载问题已解决。

## Evidence → Finding → Path

E-375：既有“显示配额”场景改为验证读取缓存且不刷新；另针对默认和 session 两入口，提供永不结束的配额/点数刷新函数，检查动作调用时统计已进入 addItem、刷新函数调用为 0，缓存对象保持。旧源码三个场景全部失败；修后这三项、原无子命令会话统计与 model/tools 两个对照共六项通过，热力图三项未运行。

命令在 packages/cli：npx vitest run src/ui/commands/statsCommand.test.ts -t 'general session stats|without fetching|optional account refresh|display model stats|display tool stats' --coverage.enabled=false。根目录 npx tsc -p packages/cli/tsconfig.json 与仅 statsCommand.ts / statsCommand.test.ts eslint 均退出 0，格式和 git diff --check 通过。未增加 UI 快照或全量/冒烟检查。

E-376：observe-source-stats-immediate.mjs / verify-source-stats-immediate.mjs 用实际 Windows Node v24.19.0 编译源码 CLI、ConPTY、独立 profile/workspace。输入框就绪后，验证器启用受控刷新阻断：如果调用 Config 的 quota/credit 刷新就永不返回，并记录调用；网络 fetch 全部拒绝，允许本地 data/blob 资源，未注入 metrics 或统计视图。

实际操作 /stats、/language 中文、/stats session、/stats model、/quit；两个本地统计视图、中文空模型状态及下一条命令都自然完成。5 步/11 条件通过、14224ms、CLI 和验证器均退出 0，0 配额/点数刷新调用、0 网络/模型请求，provider/settings 字节保持。两次统计从 Enter 到末行输出的本机单次观测为 193ms / 74ms，不当作稳定性能基准，也不是整体启动时延证明。

真实 Config 的缓存为空；非空缓存保留由 E-375 的明确夹具证明。受控阻断覆盖刷新路径不应被调用的边界，不是故意让真实账户服务挂起，也没有验证 Google quota/credits 的真实刷新准确性。底层本地 data: 资源读取一次被单独记录，不算外部 HTTP。

首原生观察器把所有 fetch 都计为网络并阻断了本地资源，造成 noFetch 条件失败，其余统计、命令就绪与零账户刷新条件通过。已按协议区分 data:/blob: 与网络，最终观测仅一次 data:，没有 HTTP；首日志与 source-stats-immediate-first-result.json 保留，不把观察器误计记为产品故障。不得将首失败状态覆盖成“首次即通过”。

F-118 → Path：statsCommand.ts 的 defaultSessionView 在展示本地数据前等待无关远程刷新。移除该等待并保留已知缓存，使本地统计可以离线读取，既不减小请求超时掩盖问题，也不转移为不可取消的后台刷新。

## 证据、保全与后续

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：stats-immediate-before.log / -before-junit.xml、stats-immediate-test.log / -junit.xml、stats-immediate-source-compile.log / -lint.log / -format.log；observe-source-stats-immediate.mjs、prepare-stats-immediate-verifier.mjs、verify-source-stats-immediate.mjs、source-stats-immediate.log / -first-result.json、source-stats-immediate-final.log / -result.json / -terminal-output.txt，以及 source-stats-immediate-preservation.json。验证脚本不作为最终用户功能分发。

个人 provider / locale / config/skill-tags.json 与旧 E-294/E-364 失败 SHA 保持，ultra-tools.json 仍不存在、全局仍 1.0.0-preview.83；保全 passed=true。个人 SHA 为 e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332 / 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / 33a88098707f0383b34286ad83d7bc979f48f80441f4569cb1641ccfef89ca10。旧付费任务未重跑，个人数据库、账户、工具安装与 PATH 未改。只删除核实后的本验证 mkdtemp。

沿用既有 granted case、同会话 lead/cae/doc，workitems/timeline/field-journal 和目标池同步，无 Codex 子代理；本轮只是命令数据流，不改 Ink 布局或新增 UI 依赖。只推隔离 codex 分支并 skip ci，不合并 master、不正式 Release。

接续：先处理 /model 的可选配额刷新等待与窗口可用性，保持可见配额数据的真实边界；继续源码中的加载、模型配置和交互收敛，不重复两次已失败的付费任务。复杂协作质量、最终 Windows/macOS/Linux 分发仍未整体完成，goal 保持 active。
