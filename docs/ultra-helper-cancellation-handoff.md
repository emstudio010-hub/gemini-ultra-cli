# Gemini Ultra CLI 辅助函数取消传播交接

2026-11-15；WI-251 / E-557至558 / F-209；基线f8e5c546d0213e058a2829edf83ab108c06a85f2，分支codex/ultra-agent-portable。上一turn为progress（直接生成器生命周期已推送）。持续goal active；源码→Windows必要定向验证→功能收敛后最终三平台包。保持preview.83，不打包/重装/升版/三平台CI/子代理/付费重跑。

## Evidence → Finding → Path

F-209：calculateRequestTokenCount会把生成器生命周期AbortError当普通失败估算；主聊天/压缩计数没有传caller signal，非合作count等待不能由caller结束。截图捕获callTool漏signal，异常catch把取消当普通工具失败；Conseca生成/执行catch可把取消变普通错误回退，getPolicy可在关闭后保存/命中缓存。

修复：媒体计数新增兼容可选signal，入口及catch复核，实际count用withAbortSignal并传signal，AbortError沿原对象抛出；GeminiClient.processTurn与ChatCompressionService传现有signal。普通错误仍用原本地估算。截图入口合并Config/caller并预查，capture MCP及模型等待均可取消，callTool传组合signal，catch不吞取消；模型不可用/无图/空响应等普通回退保持。Conseca生成/执行接Config lifecycle、实际请求传signal且可取消等待，取消不转普通回退；checker入口/缓存读取前/保存前复核关闭。普通网络/解析失败的既有回退策略不变，不改模型、预算、格式或重试。

## E-557 源码必要检查

helperCancellation.test九项：Conseca生成/执行/缓存pending非合作生成器关闭先拒绝、迟到不写cache且closed零新dispatch；截图capture在caller/Config取消时先结束且迟到不启动模型；截图模型pending取消不变fallback；非合作media count caller取消保持reason且预取消文本不估算/独立正常计数可用；无自有signal时生成器AbortError传播；closed缓存不复用。旧源码九项全部行为失败，baseline退出1。

修后新九+媒体计数旧10/截图8/策略生成3/策略执行5/checker10，45不同相关通过、6纯估算用例未选，首次退出0。四旧mock补生命周期接口，截图旧参数断言接signal，未放宽普通回退断言。core tsc --build、12个变更TS eslint零warning、12文件prettier check及git diff --check均首次退出0。无全量/冒烟/CLI重编，不重跑未改动的生成器或旧付费任务。

工程前缀helper-cancellation：baseline.log/-baseline-junit.xml；tests.log/-junit.xml；core-compile.log；lint.log；format-write.log/-format.log。主定向命令在packages/core执行vitest run src/utils/helperCancellation.test.ts src/utils/tokenCalculation.test.ts src/agents/browser/analyzeScreenshot.test.ts src/safety/conseca/policy-generator.test.ts src/safety/conseca/policy-enforcer.test.ts src/safety/conseca/conseca.test.ts -t 'helper lifecycle|calculateRequestTokenCount|analyzeScreenshot|policy_generator|policy_enforcer|ConsecaSafetyChecker' --coverage.enabled=false。

## E-558 Windows真实调用链

verify-source-helper-cancellation.mjs独立home/profile及各场景workspace，真实Config/helpers/Conseca getPolicy/Universal Chat HTTP和Google SDK原生count，严格fetch loopback origin守卫。三个策略pending关闭均先于server释放拒绝、不保存迟到缓存且closed不再dispatch；截图模型HTTP关闭同样不返回fallback；HTTP关闭15至31ms在1500ms观察窗内结束，socket关闭。截图capture用受控BrowserManager.callTool收件，caller/Config取消时组合signal aborted，释放迟到图片后零模型请求；不是实际浏览器或MCP传输验收。

主聊天实际GeminiClient.sendMessageStream携媒体，通过native成员scope走原生SDK countTokens；caller取消后仅一次UserCancelled，无Finished、无后续生成请求，Config仍活。媒体计数不带自有signal时Config关闭，生成器AbortError仍向上传递，不变估算成功。独立正常策略、执行、截图分析、原生计数四控制通过；正常策略先缓存，关闭后同prompt不复用。各场景显式reset测试singleton，不证明多Config策略缓存隔离。

29条件全true/10146ms总/首次退出0，10个本地HTTP，0外部fetch/实际供应商/付费模型/自动重试/旧任务重跑，临时provider字节保持。保存source-helper-cancellation-windows.log/-result.json。finally释放自有响应、dispose自有Config、恢复fetch/DrillStore/测试singleton、关自有server，经realpath父目录与前缀核验仅清自建temp。

## 保全与接续

verify-helper-cancellation-preservation.mjs及source-helper-cancellation-preservation.json确认个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保持true。不改个人数据库/PATH/工具安装/历史未跟踪文件。沿用granted R26 code-audit及docs-generator，lead/cae/doc同会话，无子代理。三份同SHA交接和目标池/case更新，显式stage、skip ci推授权隔离分支，不合master/Release。

边界：不强制抢占底层MCP/其他不合作任务；CheckerRunner原本将in-process异常转DENY，本次未改协议为跨进程取消。未验证完整压缩语义、真正浏览器或任意辅助入口全取消。Conseca全局单例仍可能在多Config间替换上下文/复用缓存，下一轮检查归属，再继续启动/真实协作与可移植性收敛；真实复杂质量及最终三平台包仍未完成，goal保持active。
