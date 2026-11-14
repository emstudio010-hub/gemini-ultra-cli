# Gemini Ultra CLI 工具客户端生命周期交接

2026-11-15；WI-249 / E-553至554 / F-207。基线5a7cbf3fc2f32ceb0372ad41ebb2d5ad55431948，分支codex/ultra-agent-portable。持续goal active，当前六项目标已重新列于docs/ultra-goals.md；源码→Windows必要定向验证→收敛后最终三平台包。保持preview.83，无打包、重装、升版、三平台CI、子代理或付费重跑。

## Evidence → Finding → Path

F-207：BaseLlmClient的生成、JSON、计数、嵌入调用没有接Config关闭信号，直接后台工具可在会话关闭后继续等待或接纳迟到响应。四入口现在合并caller与Config lifecycle并在调度前检查，生成每次重试前及内容判定/返回复核，实际调用通过withAbortSignal停止等待。嵌入新增向后兼容可选abortSignal，空输入仍返回[]；计数和嵌入无caller时仍传生命周期信号，不修改原options、路由、返回格式或重试策略。

原同步API回调先取消再抛错时，withAbortSignal在构造race前抛出，取消Promise没有拒绝处理。公共helper现同步调用operation并捕获同步异常转拒绝Promise，再将两者交给race；保持同步执行时序和原错误对象。

## E-553 必要源码证据

新增baseLlmLifecycle.test.ts九项：四入口pending不合作Promise关闭先拒绝/底层signal取消且caller不受影响，四入口closed零dispatch，以及显式caller原reason/Config独立和后续JSON正常。旧源码九项全部行为失败，baseline退出1。首修后三文件62项断言通过，但同步取消旧用例触发1个未处理拒绝，整轮退出1，原日志/JUnit保留，不能称该轮全绿。

修公共helper后，仅重验九新项与该同步取消旧项，10通过/29未选、退出0且无未处理拒绝；不重复其余未受影响通过项。两旧测试mock补Config lifecycle，参数断言允许组合signal，并发原生计数复核caller取消传播且Config未取消。最终core tsc --build、五TS eslint零warning、五文件prettier check及git diff --check均退出0。首lint两项机械问题已修，原日志保留；无全量或冒烟测试，无CLI重编。

工程证据前缀base-llm-lifecycle：baseline.log/-baseline-junit.xml、tests.log/-junit.xml（失败轮保留）、cancel-tests.log/-cancel-junit.xml、core-compile.log/-final-core-compile.log、lint.log/-final-lint.log、format-write.log/-format.log。编译命令node node_modules/typescript/bin/tsc --build packages/core/tsconfig.json；定向补验在packages/core执行vitest run src/core/baseLlmLifecycle.test.ts src/core/baseLlmClient.test.ts -t 'Config disposal|after Config disposal|explicit caller cancellation|should throw immediately without reporting if aborted' --coverage.enabled=false。

## E-554 Windows实际请求链

verify-source-base-llm-lifecycle.mjs使用独立临时home/profile，真实Config.initialize/refreshAuth/BaseLlmClient/Universal：生成与JSON走Chat HTTP，countTokens通过native成员scope走真实Google SDK的/v1beta/models/gemini-fixture:countTokens，嵌入走原SDK的gemini-embedding-001:batchEmbedContents；全部指向自建loopback并有严格fetch origin守卫。不是外接模型本地token估算冒充网络计数，不触达真实Google或供应商。

content/json分别header/body、tokens/embedding分别header等待时dispose，六项15至23ms在1500ms观察窗内先于服务端释放拒绝，原Config AbortError对象保持，socket关闭、caller不取消；释放迟到响应后closed调用不新dispatch。独立新Config的caller取消保持原reason且四正常调用均成功。31条件全true，11个本地HTTP、总10615ms，首次退出0；0外部fetch/付费模型/自动重试/旧真实任务重跑，临时provider字节保持。

finally释放自有响应、dispose自有Config、恢复fetch/DrillStore、关闭自有server，经realpath父目录及固定前缀核验仅清理自建temp。工程保存source-base-llm-lifecycle-windows.log/-result.json及verify-base-llm-lifecycle-preservation.mjs/source-base-llm-lifecycle-preservation.json。

## 保全、目标和接续

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA和passed=false、ULQ临时凭据删除均保全true。未改个人数据库/PATH/工具安装或历史未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话；文档按docs-generator交接。六项目标依次为启动加载稳定、双语/配置、真实多Agent质量、演练台、红队与逆向可移植、最终交付收敛。

边界：取消保证上层不再等待/接纳结果，不强制抢占任意不合作底层IO；空嵌入仍为无请求[]。不保证直接持有generator、任意Hook/外部任务都已接关闭信号，真实复杂协作质量及最终跨平台包未完成。下一步查analyzeScreenshot、Conseca和tokenCalculation等绕过上层客户端的生成/计数调用，再按实际缺陷推进，不重复已验证场景。三份一致交接与目标池/case同步后，显式stage、带skip ci推授权分支，不合master或Release，goal保持active。
