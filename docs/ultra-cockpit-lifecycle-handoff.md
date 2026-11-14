# Gemini Ultra CLI 演练台启停生命周期交接

日期2026-11-15，WI-233 / E-521至522 / F-191。基线1fc76ada6485973b15efc5da59207cf827c31346，分支codex/ultra-agent-portable。上一goal turn为progress（演练台模型目录取消已推送核远端）。goal active；源码优先→Windows必要定向验证→功能收敛后最后打包，无打包/重装/升版本/多平台CI/旧付费重跑，全局preview.83保持。用户重新设active仅继续原目标，本阶段未暂停或改写目标。

## Evidence → Finding → Path

F-191：startDrillCockpit在await listen后才设置全局server，stop只关闭已发布server而不取消starting。启动立即停止时，旧监听仍可完成并发布地址；全局token已被stop清空，实际返回http://127.0.0.1:45678/#。stop后立即start仍共享旧starting；旧finally还会无条件清空全局starting。新增原生HTTP基线3场景2实际失败/1正常控制通过，退出1，确认为代码行为非等待超时。

starting改为本次启动状态对象（controller与promise），每次启动使用局部nextToken，只有成功监听、signal未取消且仍为当前state才发布server/address/token。stop先解除当前starting并用双语AbortError拒绝该启动；listen使用原生Server.listen options.signal，默认45678和EADDRINUSE后的空闲端口0都可取消。重复占用错误只回落一次；取消后error不再发起fallback，迟到listening关闭旧server。监听阶段清理error/listening/abort/close回调；失败abort并关闭自有next。finally仅清自己仍持有的starting，旧收尾不能覆盖新启动；正常并发start继续共享同一启动，正常stop保留原清理语义。启动密钥不再提前写全局。未改任务提交、模型调用、供应商配置或目录取消逻辑。

## E-521 定向源码检查

新增drillCockpitLifecycle3用例，包装createServer只记录实际创建的原生Server、不替换监听行为：stop未完成启动→拒绝且无遗留listener；旧启动stop后新启动→旧拒绝、新服务完整64hex密钥/独立Server、后续start返回同一新服务；正常并发只创建一服务、stop后新身份。基线2失败/1过，修后3全过，退出0；所有记录的自有server均在finally关闭，无全量/冒烟。

CLI tsc --build、双TS eslint --max-warnings0、初及最终3文件Prettier与git diff --check均退出0。没有源代码语义变更后的额外重跑；这些收集时间不是CLI启动性能基准。

## E-522 Windows实际监听生命周期

verify-source-cockpit-lifecycle.mjs独立home/profile、实际Config.initialize及编译Cockpit。临时包装Server.prototype.listen只记录原调用参数和自有Server，继续调用原生listen；请求用独立原生HTTP连接。fetch被守卫为零次，根本不发模型或其他网络请求。

实际验证：立即stop使pending拒绝AbortError且listener关闭；旧start/stop/new start重叠，只有新Server监听，旧finally不清新服务，同期start共用地址；页面GET200。停止后尝试用自有blocker占用45678（若已有其他占用则不触碰它），取消这时的启动仍无遗留listener；再次正常启动实际回落空闲端口，带signal的port0监听被记录，页面GET200。新身份与旧不同且完整，stop关闭fallback服务而不关闭blocker。未把生成的本地token写进结果或日志。

17条件全true，首次脚本执行退出0，6689ms；2次本地页面读取，0模型/外部fetch/付费/旧任务重跑。1.5秒等待是夹具观察上限，不是整个产品启动时限；未做真实浏览器/原生终端、跨平台或最终包验收。

finally断开自有session/stop自有服务/Config.dispose，关闭记录的自有Server、恢复prototype及fetch、重置DrillStore，经realpath与前缀验证仅清真实temp下自有ultra-cockpit-lifecycle根。没有关闭其他进程的默认端口占用者，旧被拒清理目录不动。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：cockpit-lifecycle-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-cli-compile.log；-lint.log；-format-write.log/-format.log/-final-format.log；verify-source-cockpit-lifecycle.mjs、source-cockpit-lifecycle.log/-result.json；verify-cockpit-lifecycle-preservation.mjs、source-cockpit-lifecycle-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false及ULQ临时凭据已删均保全true。个人数据库/PATH/工具安装/旧未跟踪文件保持。PRIMARY R26 code-audit、granted scope、lead/cae/doc同会话，无Codex子代理/外部安全目标。目标池/case追加、Obsidian/源码/工程三份同SHA，显式stage/skip ci推隔离分支，不合并master/Release。

此为演练台服务启动取消与身份归属修复，不证明所有初始化/实际复杂协作质量或E-503根因已过；goal active。

## 接续顺序（已授权继续）

1. 深入模型配置与语言入口的当前源码，核对仍影响实际使用的候选路由/取消/本地化状态，按证据选下一项缺陷。
2. 维护目标池与真实失败保全，输出阶段报告，不自动重跑付费任务。
3. 源码功能收敛后统一Windows最终验收，最后macOS/Linux打包。
