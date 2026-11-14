# Gemini Ultra CLI 子执行失败脱敏交接

日期2026-11-15，WI-228 / E-511至512 / F-186。基线a0c283fb3c6576c61d63fc34cf38d84bb4f2d3c2，分支codex/ultra-agent-portable。goal active；源码优先→Windows必要定向验证→功能收敛后最后打包，不打包/重装/升版本/多平台CI/付费失败重跑，全局preview.83保持。PRIMARY R26 code-audit、granted scope、lead/cae/doc同会话，无Codex子代理/外部安全目标。

## Evidence → Finding → Path

F-186：普通LocalSubagentInvocation与会话LocalSessionInvocation的活动处理原已用sanitizeErrorMessage，但外层catch直接把原始error.message/String(error)放入llmContent与recentActivity；普通入口debugLogger还直接记录Error对象。会话LocalSubagentProtocol的ERROR活动事件和fatal错误消息/stack未经脱敏传给父观察器。导致本地结果、进度及父事件可能暴露上游错误里的凭据。

两个catch统一使用已有sanitizeErrorMessage；普通入口自有debug仅记脱敏文本。会话协议ERROR活动、fatal消息及存在的stack用相同函数。结果仍error、原取消异常仍抛回、协议错误结束仍failed；不更改调度/预算/重试/成功结果及工具参数JSON解析。不新增脱敏规则，不承诺识别任意无标识私有正文；此修复覆盖已有规则识别的凭据模式与这些指定出口，非全日志或所有元数据的通用审计。troubleshooting说明边界。

## E-511 源码检查

新增local-error-handoff4用例：两个入口Error中假api_key/token经result/progress/parent events与普通入口自有debug无PRIVATE标记，保留[REDACTED]和ERROR；两个入口真实ProviderToolArgumentsError的安全完整message保持，session父error亦完整。旧源码2脱敏实际失败/2诊断正常通过，退出1；修后4通过，退出0。既有普通/会话invocation及protocol筛选12个错误、取消、事件用例通过/76未选跳过，退出0，不把跳过算通过，共16不同检查，无全量/冒烟。

首core tsc发现新测试mock缺泛型；补ZodUnknown后发现与静态create返回类型ZodTypeAny不兼容，最终改ZodTypeAny退出0，三生产源码未因类型失败改行为。首lint新测试多const声明2错误，局部fix拆分、prettier后4TS最终零warning lint退出0。纯类型与声明拆分/文档换行不改运行行为，不重复测试；最终5文件格式与git diff --check退出0，首format文档换行问题及日志保留。CLI生产未改不重编。

## E-512 Windows原生协议与两个入口

verify-source-local-error-handoff.mjs使用独立home/profile和假key、fetch仅自有loopback，实际编译Config/gateway/内置coder/LocalSubagentInvocation或LocalSessionInvocation/真实LocalSubagentProtocol/LocalAgentExecutor/GeminiChat/Universal Chat，没有替换生产业务实现。

每入口实际3请求：HTTP401包含假api_key/token→result/progress无私有标记并含脱敏标记、state=error；complete_task参数故意未闭合→error仍完整保留protocol=openai-chat/tool=complete_task/bytes27/UTF16=27/position27，无原参数正文；独立合法complete_task→completed且LOCAL_HANDOFF_CONTROL保留。会话三种的父事件终态分别failed/failed/completed，错误消息和堆栈无私有标记。普通入口自有debug实际log已脱敏。没有Swarm封装/独立审核，本阶段只证明两个原生成员入口，不称复杂任务整体交付。

22条件全true，首次执行退出0，10017ms，总6本地HTTP/SSE请求，0外部付费/旧任务重跑/自动重试。隔离provider字节不变；finally配置dispose/还原fetch/关闭loopback及DrillStore，realpath验证后只清真实temp下自有ultra-local-error-handoff前缀根。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：local-error-handoff-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-related-tests.log/-related-junit.xml；-core-compile.log/-final-core-compile.log/-final2-core-compile.log；-lint.log/-lint-fix.log/-final-lint.log；-format-write.log/-final-format-write.log/-final-format.log/-final2-format.log/-doc-format-write.log/-final3-format.log；verify-source-local-error-handoff.mjs、source-local-error-handoff.log/-result.json；verify-local-error-handoff-preservation.mjs、source-local-error-handoff-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false和ULQ临时凭据删除均保全true；个人数据库/PATH/工具安装/旧被拒清理目录及旧未跟踪文件不动。目标池/case追加，Obsidian/源码/工程三份同SHA，显式stage、skip ci推隔离分支，不合并master/Release。

本阶段修复诊断交接，不代表E-503真实失败根因或复杂F-164质量已解决。实际供应商复杂任务与最终Windows/macOS/Linux分发仍待，goal active。

## 接续顺序（已授权继续）

1. 深入会话错误的结构化元数据及失败报告边界，按真实源码证据选择下一项缺陷。
2. 继续维护目标池、保留四份真实失败，输出阶段交接，不自动重跑付费任务。
3. 功能收敛后统一Windows最终验收，最后打包macOS/Linux。
