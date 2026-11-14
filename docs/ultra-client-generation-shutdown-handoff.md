# Gemini Ultra CLI 活动聊天与直接生成关闭交接

2026-11-15；WI-246 / E-547至548 / F-204；基线291edf517f70b0e79fd28a13fbca5873e61f0f31，分支codex/ultra-agent-portable。上一goal turn为progress（认证关闭已推送）；当前无其他活验证进程。goal active；源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包，preview.83保持，无打包/重装/升版/三平台CI/旧付费重跑。

## Evidence → Finding → Path

F-204：GeminiClient.dispose已有lifecycleController，但只有初始化/startChat使用它；sendMessageStream和直接generateContent仅用caller signal。Config.dispose虽dispose客户端，主聊天及直接辅助生成仍能继续HTTP请求与发布迟到输出，关闭后还可发新请求。前后Agent Hook等待也不在同一取消范围，Before Hook原在try/finally之外。

两个公开入口合并caller/client生命周期，聊天将取消检查/Before Hook纳入既有try/finally，按原UserCancelled协议结束、清sequence/turn及Hook状态；Before/After Hook用withAbortSignal停止等待。processTurn在路由后、setTools后及接受每个事件前复核，拒绝迟到事件；整轮返回后再复核才进入After Hook。直接生成入口在读取模型配置前检查，每次apiCall前复核并以withAbortSignal包实际生成，返回结果前再检查；保留原取消对象，不进入错误报告或新增重试。底层不合作生成器可以继续内部完成，但结果不再被该调用方接纳。

不改变普通请求工具/模型参数，不回滚关闭前已显示的可见草稿；caller原信号不会被client.dispose反向abort。未在本阶段给LocalAgentExecutor、BaseLlmClient或原生SDK全局添加关闭行为。

## E-547 必要源码检查

初新增4回归：活动Turn mock取得信号后hold，client.dispose应中止收到的signal且caller保持/无迟到正文/有UserCancelled；已关闭聊天零路由/模型调用；直接生成用不合作Promise，dispose后200ms观察窗先AbortError再释放迟到响应；已关闭直接生成零dispatch。原源码四项实际行为失败，退出1。

修后首次16项中15通过，1个旧参数断言仅因abortSignal从caller变为合并对象不再同一引用而失败，证据保留；更新旧断言接受AbortSignal类型，新增Windows验证补原caller取消/独立caller未abort。随后补Before/After Hook hold关闭两项，均立即结束、只有一个UserCancelled、无后续model调度/无Hook状态遗留。活动Turn fixture改为忽略signal直接返回晚正文，更直接验证接受边界；最终只补受影响active1+新Hook2+旧参数1共4通过。合计18不同相关检查（新6+既有12），不把重复active累计；其余未选无全量/冒烟。

core首/最终tsc --build退出0；首次双TS eslint --max-warnings=0退出0，后新增apiCall/return处取消guard由最终编译/Windows链覆盖，双文件Prettier与git diff --check退出0。先完成格式写入才启动后续编译，不并发改同文件。无CLI重编。

## E-548 Windows原生活动请求

verify-source-client-generation-shutdown.mjs独立home/profile，真实Config.initialize/gateway/GeminiClient/Turn/GeminiChat/UniversalContentGenerator与Node fetch/HTTP。四场景：主stream等待头、已有可见正文后hold；直接非流utility等待头、部分JSON后hold。在自有服务端释放完成之前Config.dispose，调用方先结束且socket非正常完成close，耗时分别30/20/45/16ms，在1500ms观察窗内。stream各一个UserCancelled且无Finished，direct是Gemini client disposed AbortError；caller signal保持未abort。已有可见正文保留为未接纳草稿，不把它当成功。

随后调用自有send模拟迟到完成（socket已关闭不再输出），事件不变、无晚结果、sequence=null；已关闭client再调相同入口，零新HTTP，stream仅UserCancelled/direct AbortError。独立新Config先做原caller主动取消，direct抛同一个AbortError；随后正常stream和direct均返回fixture正文并正常完成，证明各生命周期不互相取消。

25条件全部true/11401ms总/首次Windows脚本退出0。7个loopback请求（四关闭场景+原caller取消+两个正常控制），0外部fetch/真实模型/付费/自动重试/旧失败重跑，临时provider字节保持。不是原生终端视觉/LLM质量或整个退出链完成验收。finally释放自有send、dispose五自有Config、恢复fetch/DrillStore、关闭自有server，经realpath父目录及前缀核验仅清自建temp根。

## 证据、保全与接续

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：client-generation-shutdown-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-final-tests.log/-final-junit.xml、-core-compile.log/-final-core-compile.log、-lint.log、-format-write.log/-final-format-write.log/-format.log；verify-source-client-generation-shutdown.mjs与source-client-generation-shutdown.log/-result.json；verify-client-generation-shutdown-preservation.mjs与source-client-generation-shutdown-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装或旧未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。三份交接同SHA、目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

边界：本次只GeminiClient主聊天与其直接生成。前后Hook底层任务未被保证真正停止，只停止等待和接纳；任意不合作stream/前置history/masking/router等内部等待不全部保证即时返回，已有历史副作用不回滚。子代理LocalAgentExecutor/独立BaseLlmClient调用和Config下已持有generator的直接调用仍需后续核对，不能据此宣称所有退出活动均停止。接续优先沿这些实际调用归属完善退出，兼顾原目标池启动/加载、双语/配置/演练台、真实协作质量、可移植逆向；整体上线与最终多平台分发仍待，goal active。
