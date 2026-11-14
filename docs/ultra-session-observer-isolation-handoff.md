# Gemini Ultra CLI Legacy与Remote观察器隔离交接

日期2026-11-15，WI-230 / E-515至516 / F-188。基线728bd28a4b25ca62f36644b84090a05d92875a1d，分支codex/ultra-agent-portable。上一goal turn为progress（本地观察器隔离已推送核远端）。goal active；源码优先→Windows必要定向验证→功能收敛后最后打包，无打包/重装/升版本/多平台CI/旧付费重跑，全局preview.83保持。

## Evidence → Finding → Path

F-188：LegacyAgentProtocol与RemoteSubagentProtocol仍直接调用订阅器；流正文观察器抛错会让正常执行转failed，后续健康订阅漏同一事件；start在后台try外、错误收尾在catch内，观察器异常还可能留下未settle结果或缺失终态。Legacy的用户消息在调度前发出，观察器也可能直接打断send。异步void回调拒绝原来不被观察。新baseline四场景实际2失败/2正常过，退出1：Legacy正常正文变failed，Remote原成功结果被观察器错误替代，无夹具收集错误。

把上一轮完全相同的isolateObserver移到utils/isolatedObserver.ts；Local仅改导入，行为保持。Legacy/Remote使用原callback→隔离wrapper的Map，保持重复订阅去重、unsubscribe及旧句柄不误删新订阅；同步异常/返回Promise拒绝使该观察器失败后脱离，固定warning无原异常，健康订阅器继续、原结果/原失败仍由业务路径收尾。正常void无Promise开销，不await遥测；没有改模型/调度/预算/重试/A2A传输或错误元数据。本轮填补另外两个协议入口，不称所有UI回调或阻塞同步函数已解决。

## E-515 必要源码检查

新增session-observer-isolation15用例：每协议正文同步异常、正常控制、异步拒绝、start/end异常、原执行错误遇到error观察器异常仍保留failed和原错、坏观察器脱离后下一stream、重复订阅去重/unsubscribe；另Legacy调度前用户消息观察器异常不阻断send。15全过，加Local既有10（公共函数提取回归）及Legacy/Remote既有筛选4，共29不同相关用例通过。既有筛选62未选跳过不计，无全量/冒烟。

core tsc --build退出0；首lint新测试两处generator对象方法要求shorthand，局部eslint --fix仅语法等价转换后5TS零warning lint退出0。首格式检查只剩新测试方法括号空格，Prettier后6文件最终check及git diff --check退出0；纯语法/格式无行为变化，不重复测试。CLI生产未改不重编。收集耗时不是CLI启动性能基准。

## E-516 Windows真实协议

verify-source-session-observer-isolation.mjs独立home/profile、假key、fetch仅自有loopback。实际Config/gateway/GeminiClient/LegacyAgentSession走Universal Chat SSE；RemoteSubagentSession走实际A2AClientManager/SDK、HTTP卡片发现与JSON-RPC message/stream SSE，无生产业务替换。

Legacy覆盖user-message/start/message/end/async-message/error六场景及start坏观察器脱离后第二stream，共7Chat请求；Remote覆盖start/message/end/async-message/error及第二stream，共6A2A流请求、另1card GET。每次坏回调实际触发一次、正常订阅仍收start/end，正常控制正文LEGACY_OBSERVER_CONTROL或REMOTE_OBSERVER_CONTROL保持completed；故意HTTP401或A2A错误仍failed并保留原LEGACY_FIXTURE_FAILURE/REMOTE_FIXTURE_FAILURE，没有被观察器错误覆盖。Remote同session第二请求携带observer-context，状态保留。两协议第二stream正常。

28条件全true，首次执行退出0，12727ms；13流请求+1卡片读取，0外部付费/旧任务重跑/自动重试。单场景15秒外部观察上限未触发，不是产品执行总时限。没有原生终端/实际远端服务账户/复杂协作质量或最终包验收。finally仅abort自有session、dispose配置、还原fetch、关闭loopback/DrillStore，经realpath与前缀验证后只清真实temp下自有ultra-session-observer-isolation根。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：session-observer-isolation-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-related-tests.log/-related-junit.xml；-core-compile.log；-lint.log/-lint-fix.log/-final-lint.log；-format-write.log/-format.log/-final-format-write.log/-final-format.log；verify-source-session-observer-isolation.mjs、source-session-observer-isolation.log/-result.json；verify-session-observer-isolation-preservation.mjs、source-session-observer-isolation-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false及ULQ临时凭据已删均保全true。个人数据库/PATH/工具安装/旧被拒清理目录/旧未跟踪文件保持。PRIMARY R26 code-audit、granted scope、lead/cae/doc同会话，无Codex子代理/外部安全目标。目标池/case追加、Obsidian/源码/工程三份同SHA，显式stage/skip ci推隔离分支，不合并master/Release。

本轮是执行观察边界修复，不证明真实ULQ失败根因或复杂F-164协作质量已过。goal active。

## 接续顺序（已授权继续）

1. 深入会话错误结构化元数据code/status边界，完成失败报告链的脱敏与可靠序列化审查。
2. 继续核对目标池与现有功能的实际证据，保留真实失败、不自动重跑付费任务，导出阶段报告。
3. 源码功能收敛后统一Windows最终验收，最后再打包macOS/Linux。
