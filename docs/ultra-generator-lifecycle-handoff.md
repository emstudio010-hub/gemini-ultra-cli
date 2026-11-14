# Gemini Ultra CLI 直接生成器生命周期交接

2026-11-15；WI-250 / E-555至556 / F-208。基线39c34f86d7a2f60fc7713e87db101f630484fc44，分支codex/ultra-agent-portable。上一goal turn是progress（工具客户端生命周期已推送）。goal active，源码→Windows必要定向验证→功能收敛后最终三平台包，preview.83保留，无打包/重装/升版/三平台CI/付费重跑/子代理。

## Evidence → Finding → Path

F-208：截图分析、Conseca和媒体计数等直接持有生成器，绕过已修上层client。Universal原四入口不绑定Config关闭，原生countTokens还把取消当普通失败返回估算。现统一withLifecycle合并caller/所属Config，在路由与预算前检查，不修改原request；生成/嵌入/原生计数用withAbortSignal，计数catch先复核signal，普通失败仍估算。生成模型选择、请求预算、提示词和返回格式保持，无新增重试或自动切换。

openStream同时保护factory和每次next：取消先拒绝，不发布迟到chunk；迟到factory返回的source请求return。正常打开后注册abort回收，即使未读也关闭；return/throw和迭代器接口转发，早期return无需先next。回收去重，正常done移除监听，取消不等待不合作source.return；不强制抢占任意底层任务。

## E-555 源码证据

generatorLifecycle.test新增8项：四入口pending不合作Promise关闭先拒绝/传递signal/closed不再调度、迟到factory只回收一次；pending原生stream.next取消不发布迟到chunk；未读stream关闭回收；caller计数取消不变成功且会话仍可用；正常迭代/未读早退及普通计数失败估算保持。原版7行为失败/正常1过，baseline退出1。

首修四文件46项中43通过；旧agentModelRouting的3项局部Config mock漏新增方法而失败，原日志/JUnit保留。仅补该mock，定向3项通过/20未选，不重复43已过项，合计46不同相关检查。其余局部mock补相同接口。首core编译仅流对象Symbol.asyncIterator的this被推成PromiseLike联合；增加显式AsyncGenerator变量类型，零运行时行为变化，最终tsc --build core退出0。首lint仅新测试switch缺default，补异常分支后五TS最终eslint零warning；五文件prettier check及diff退出0。无全量/冒烟/CLI重编。

工程证据前缀generator-lifecycle：baseline.log/-baseline-junit.xml；tests.log/-junit.xml（首修失败保留）；route-tests.log/-route-junit.xml；core-compile.log/-final-core-compile.log；lint.log/-final-lint.log；format-write.log/-format-followup.log/-format.log。定向主命令在packages/core执行vitest run src/providers/generatorLifecycle.test.ts src/providers/requestCancellation.test.ts src/providers/swarm-budget.test.ts src/agents/agentModelRouting.test.ts --coverage.enabled=false；补验只选rejects unsupported external-only。

## E-556 Windows直接入口

verify-source-generator-lifecycle.mjs独立home/profile，真实Config.initialize/refreshAuth/getContentGenerator，完全绕过GeminiClient/BaseLlmClient/LocalExecutor。Chat HTTP/SSE及真实Google SDK generateContent/streamGenerateContent/countTokens/batchEmbedContents均loopback，有fetch origin守卫，非真实供应商验收。

首脚本各场景共用工作区，第一场景结束后的未完成Boost仍在，第二次createAgentWorkflow被既有防覆盖保护拒绝，退出1；source-generator-lifecycle-windows.log保留，无完整结果，生产未为夹具改动。只修夹具为每Config独立工作区后，chat/native非流header、chat/native stream body、native count/embed header六场景关闭，15至36ms在1500ms观察窗内先于server释放拒绝且socket关闭，原Config reason保持/caller不取消/不接纳结果。closed重试零HTTP/Boost预算字节保持；独立新Config的native caller原reason及两路生成/流/计数/嵌入六正常控制通过。

33条件全true/10828ms总/纠正夹具后首次退出0，13个loopback HTTP/0外部fetch/真实模型付费/自动重试/旧任务重跑，临时provider字节保持。保存source-generator-lifecycle-isolated-windows.log/-result.json。finally释放自有响应、dispose自有Config、恢复fetch/DrillStore、关自有server，经realpath父目录及前缀核验仅清自建temp。

## 保全与下一步

verify-generator-lifecycle-preservation.mjs及source-generator-lifecycle-preservation.json确认个人provider/locale/skill-tags精确SHA、ultra-tools不存在/全局83、四旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保持true。历史未跟踪文件不动，个人数据库/PATH/工具安装不改。沿用granted R26 code-audit case及docs-generator，lead/cae/doc同会话，无子代理。三份一致交接、目标池/case同步后显式stage，skip ci推隔离分支，不合master/Release。

边界：统一生成器能停止等待与阻断发布，不代表调用它的辅助函数不会吞掉取消；Conseca原catch仍会返回ALLOW/error，tokenCalculation仍会估算，截图capture的MCP等待仍未受本改动覆盖。下一轮处理这些上层传播和准备等待，保留普通错误的既有行为。真实复杂协作质量、最终启动收益及三平台最终包未完成，不能据本地受控通过关闭goal。
