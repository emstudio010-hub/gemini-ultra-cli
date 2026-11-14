# Gemini Ultra CLI 会话观察器异常隔离交接

日期2026-11-15，WI-229 / E-513至514 / F-187。基线4ddefbdbe2a52006ebee3dad5c30da38678efc53，分支codex/ultra-agent-portable。上一goal turn为progress（Chat候选/子执行错误脱敏均已推送核远端）。goal active；源码优先→Windows必要定向验证→功能收敛后最后打包。无打包/重装/升版本/多平台CI/旧付费重跑，全局preview.83保持。

## Evidence → Finding → Path

F-187：复查LocalSubagentProtocol父级事件路径时发现订阅器直接调用sub(event)，rawActivityCallback亦直接调用；观察器抛错会被当执行器失败，正常结果丢失，后面的健康订阅器漏事件。agent_start在background try之前、fatal错误收尾在catch内，若相应观察器抛错，后台Promise可拒绝而getResult未settle。异步void回调实际允许返回Promise，原来没有观察拒绝。基线仅安全选择message与raw同步抛错复现，3场景2失败/1正常过，退出1；没有为了证明挂起而留下不终止进程。

仅local-subagent-protocol.ts新增私有isolateObserver：同步throw/回调返回值的Promise拒绝均捕获，观察器失败一次后不再调用，固定warning不附原错误；正常同步void回调不创建Promise，不await UI/遥测工作。raw回调在构造时包裹；事件订阅使用原callback→隔离wrapper的Map，保持重复订阅去重/取消订阅语义，失败只删除自己当前wrapper，旧取消句柄不能误删新订阅。健康订阅器继续收同一个事件，原执行器结果/原失败/取消仍由原路径settle。不吞生产执行错误、不加模型重试、不改参数解析/预算。初Set wrapper版本会重复通知同callback，审查时改Map并补控制，在最终验证前完成。

此修复针对本地会话协议观察器；没有修改Legacy/Remote协议、任意UI回调或阻塞式同步回调。之前结构化error meta中的code/status仍需单独核对，不能称它们已脱敏。

## E-513 源码回归与静态检查

新增local-observer-isolation最终10用例：message/raw同步观察器异常保留正常结果及健康事件；正常控制；start/end异常仍收尾；fatal错误观察器异常仍抛原执行器错误并发failed终态；事件/raw异步拒绝不改完成且warning无原私有标记；失败订阅仅调用/警告一次、第二stream可完成；健康同callback重复订阅只通知一次及unsubscribe。既有local-error-handoff4与协议筛选9（raw回调顺序、多个订阅、unsubscribe、ERROR活动、执行错误、取消、连续stream等）通过，合计23不同相关用例，29未选跳过不计，无全量/冒烟。

初9新+4旧13通过；Map保持去重后最终10新+4旧14通过、另旧筛选9通过。core初/最终tsc退出0；新测试多const声明仅机械eslint --fix拆分后双TS零warning lint退出0；三文件最终Prettier和git diff --check退出0。CLI生产未改不重编。测试收集时间不是CLI启动性能基准。

## E-514 Windows原生执行与验证边界

verify-source-local-observer-isolation.mjs独立home/profile、假key、fetch仅自有loopback，实际Config/gateway/内置coder/LocalSubagentSession/LocalAgentExecutor/GeminiChat/Universal Chat HTTP/SSE，另实际LocalSessionInvocation带抛错父级onAgentEvent，无业务模块替换。

最初脚本漏传coder所需request，模板校验在HTTP前失败，独立log保留；修复测试接线，未改产品源码。随后9请求结果18/20条件true：start/end/fatal观察器、raw同步/异步、下一stream及实际invocation父观察器全部正确；两个message观察器未被触发，因为夹具reasoning_content没有parseThought要求的加粗主题，result为passed=false且原样保留，SHA646d927b2b25c6d5167ff02c7678ccf4d523db552b855872a09ef714327745d3。正常结果未失败，但不能把未触发观察器当验证通过。

只把夹具思考改为加粗主题以实际发THOUGHT_CHUNK，用--message-only补同步/异步message两个受影响场景，2请求/7353ms/7条件true/退出0，SHA4ba8d067c1d9b35b7f039bfb613b215664637b54fc6487af292551b393e71339。不重跑其余已通过场景。record-local-observer-validation.mjs严格核首轮只这两条件false、补验证场景与请求数，合并证据证明原20条件，输出validation passed=true；原false不覆盖。9请求轮10003ms，合计11本地请求，0外部付费/旧任务重跑/自动模型重试。

实际结论：坏观察器仅调用一次、健康start/end送达，原complete_task的OBSERVER_CONTROL/GOAL保留；fatal HTTP401仍原错误且failed终态；出错观察器脱离后第二stream正常；LocalSessionInvocation父start观察器抛错也不挂起并completed。该控制为成员入口，不代表复杂多Agent独立审核或实际供应商推理质量。单场景15秒外部观察上限未触发，不冒称产品所有任务15秒完成。

finally自有session.abort/配置dispose/还原fetch/关闭loopback与DrillStore，realpath验证后仅清真实temp下自有ultra-local-observer-isolation前缀根。没有触碰旧被拒清理目录。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：local-observer-isolation-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-final-tests.log/-final-junit.xml；-related-tests.log/-related-junit.xml；-core-compile.log/-final-core-compile.log；-lint-fix.log/-lint.log；-format-write.log/-final-format-write.log/-format.log/-final-format.log；verify-source-local-observer-isolation.mjs及-before-message-fixture.mjs；source-local-observer-isolation.log（首request夹具错误）/-final.log（首9请求false）/-result.json；-message.log/-message-result.json；record-local-observer-validation.mjs、-validation.json；verify-local-observer-isolation-preservation.mjs、-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false和ULQ临时凭据已删均保全true。旧未跟踪文件/个人数据库/PATH/工具安装保持。PRIMARY R26 code-audit、granted scope、lead/cae/doc同会话，无Codex子代理/外部安全目标。目标池/case追加，Obsidian/源码/工程三份同SHA，显式stage/skip ci推隔离分支，不合并master/Release。

## 接续顺序（已授权继续）

1. 深入Legacy/Remote协议的同类观察器异常路径，复用真实事件合同，避免卡住与错误归因。
2. 核对会话结构化error meta的code/status边界，并继续维护目标池和阶段报告；四份真实失败不付费重跑。
3. 源码功能收敛后统一Windows最终验收，最后macOS/Linux打包；当前仍非全面上线完成。
