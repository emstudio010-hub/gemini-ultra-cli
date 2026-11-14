# Gemini Ultra CLI 后台直接执行器关闭交接

2026-11-15；WI-248 / E-551至552 / F-206；基线06fc603700d42f8a8e79078dd9827e184f47be6b，分支codex/ultra-agent-portable。上一goal turn为progress（委派关闭与队列保全已推送）。goal active；源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包，preview.83保持，无打包/重装/升版/三平台CI/旧付费重跑。

## Evidence → Finding → Path

F-206：memoryService的技能提取直接LocalAgentExecutor.create/run，绕过AgentTool；执行器run原只caller signal。Config.dispose后直接后台任务可继续生成/工具调用；若工具调度刚好晚返回complete_task成功，原executeTurn仅检查返回aborted字段，仍可GOAL并存成功summary。聊天环境上下文准备无取消等待，也可能关闭后迟到创建chat。

LocalAgentExecutor.create在派生bus/工具注册前检查Config lifecycle，显式MCP发现await后及返回executor前复核，阻断关闭后新创建/迟到返回；不新加独立MCP取消协议。run入口合并caller/Config生命周期并先检查，原workspace/inbox/extraction写入scope保持。runInternal版本准备后复核，createChatObject的systemPrompt准备/chat.initialize用withAbortSignal，关闭后不推进chat发布；外部取消catch记录ABORTED终态并保持原error，不做timeout恢复或generic error活动。

工具调度完成后检查combinedSignal，即使晚返回成功也用TIMEOUT/ABORTED终态，不能GOAL或保存summary。原deadline与恢复机制保持，不用一个提前race把整个执行器工具清理丢开。未回滚已完成文件写入或已接受历史，不承诺强制停止底层不合作IO。

## E-551 必要源码检查

local-executor.test新增4项：直接run持有模型流后dispose，caller不abort但传入信号中止/晚完成不执行工具不存summary不恢复；closed Config不能新create或run且无chat/start/model；环境prompt准备hold时关闭先拒绝、迟到环境不建chat/记录ABORTED；工具回调在Config.dispose后才返回成功时不能GOAL/summary。

原源码四项真实行为失败（含晚工具原GOAL），退出1。修后新4+既有workspace/inbox/extraction scope与timeout/caller取消/恢复边界8共12不同定向通过/83未选，退出0；非全量/冒烟。首core编译仅新mock callback的request隐式any失败，补ToolCallRequestInfo[]类型注解后最终core tsc --build退出0。双TS首/最终eslint零warning、格式check/diff退出0；注解与格式不改行为，不重跑12项。无CLI重编。

## E-552 Windows原生后台入口

verify-source-direct-executor-shutdown.mjs独立home/profile，真实Config.initialize/gateway/LocalAgentExecutor直接调用（完全没有AgentTool）、GeminiChat/原生HTTP。使用harmless complete_task-only definition，带memoryInboxAccess/autoMemoryExtractionWriteAccess两个scope标志；没有执行真实记忆提取、写个人技能或模型付费调用。summary observer仅包原ChatRecordingService.saveSummary后照常delegate，不替换执行结果或summary实现。

首脚本等待HTTP超时退出1，source-direct-executor-shutdown.log保留：夹具遗漏direct caller必须注册的name-config模型别名，实际memoryService1269等原来已有注册。首轮未发HTTP；只对夹具按原调用方式registerRuntimeModelConfig补齐，生产逻辑没有为夹具改动。

修夹具后header/body两个活动run关闭Config，服务端释放前请求socketclose/调用方AbortError，19/21ms在1500ms观察窗内，无GOAL/summary或恢复请求，caller signal保持。尝试释放迟到完成（socket已关）不再接纳；closed Config新create及既有run都本地拒绝，无新HTTP。独立新Config的同scope正常run以BACKGROUND_CONTROL_DONE/GOAL完成，只有该任务触发一次summary保存。

14条件全true/9345ms总/纠正夹具后首次退出0，3个loopback请求（header取消/body取消/正常控制），0外部fetch/真实模型/付费/重试/旧失败重跑，临时provider字节保持。不是实际技能提取质量、所有后台客户端或最终分发验收。

finally释放自有send、恢复summary原型、dispose三自有Config、恢复fetch/DrillStore、关闭自有server，经realpath父目录及前缀核验仅清自建temp根。

## 证据、保全与接续

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：direct-executor-shutdown-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-core-compile.log/-final-core-compile.log、-lint.log/-final-lint.log、-format-write.log/-format.log；verify-source-direct-executor-shutdown.mjs与source-direct-executor-shutdown.log/-windows.log/-result.json；verify-direct-executor-shutdown-preservation.mjs与source-direct-executor-shutdown-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装或旧未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。三份同SHA交接、目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

边界：直接create期间的MCP发现内部等待仍靠manager自身生命周期，非任意不合作stream/前置onBeforeTurn/工具底层任务的抢占保证；截止前已完成写入不回滚。Config.dispose本身未改为等待所有后台任务收尾。独立BaseLlmClient以及直接持有generator请求仍待下一阶段检查；继续完整目标池启动/加载、双语/配置/演练台、真实协作质量与可移植逆向，整体上线和最终多平台包未全面完成，goal active。
