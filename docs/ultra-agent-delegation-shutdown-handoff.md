# Gemini Ultra CLI 子代理委派关闭与队列保全交接

2026-11-15；WI-247 / E-549至550 / F-205；基线59c34d3ef7f1a077ac4ea53646ea900b572a552c，分支codex/ultra-agent-portable。上一goal turn为progress（活动主client生成关闭已推送）；goal active。源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包，preview.83保持，无打包/重装/升版/三平台CI/旧付费重跑。

## Evidence → Finding → Path

F-205：AgentTool的确认/execute/共享session队列仅使用caller signal，Config.dispose无法移除pending队列或通知已启动的legacy/session子执行器；主client上一轮修复无法覆盖这些独立调用。子调用可能在关闭后继续发模型请求或返回成功。

Config新增只读getLifecycleSignal()，不暴露controller。AgentTool确认与execute入口均合并caller/Config信号；原取消先检查后再角色授权，pending队列沿已有onAbort移除，未构建child/调用onStart。确认等待用withAbortSignal，不合作确认返回也不再接纳。执行阶段只把合并signal传给真实child，不把整个执行包成提前退出的race：共享session并发名额一直保留到child实际收尾。child正常返回后再次signal检查，拒绝关闭后的迟到成功。原caller signal不被反向abort，Plan/grant检查保持。

此门禁位于实际AgentTool公共委派边界，覆盖其local/session/remote/browser路径；本轮仅实际验证本地legacy/session，不冒称远程浏览器最终验收。未直接改LocalAgentExecutor.run或其他绕过AgentTool的后台入口。

## E-549 必要源码检查

新增agentShutdown5项：pending delegation在占用slot释放前因Config.dispose退出且不构造child；legacy/session活动child各一项，合并signal被中止/caller保持且执行清理hold时不释放slot，晚成功拒绝后下个任务才启动；closed Config确认/execute在child前拒绝；不合作confirmation在关闭时停止等待，晚false不恢复。

原源码五项实际行为失败，退出1。修后新5+既有Plan6/红队grant5/AgentTool9共25不同相关检查通过，退出0。child mock控制确认/执行收尾，shared scheduler和Config lifecycle真实，不当成物理HTTP证据。

core tsc --build首次退出0。首lint新测试一处multi const被one-var拒绝，仅eslint --fix机械拆声明后Prettier格式化，最终三TS eslint --max-warnings=0退出0，三文件Prettier check/git diff --check退出0。生产逻辑无后续变更，不重复行为测试/编译，无CLI重编、全量/冒烟。

## E-550 Windows原生Swarm与子执行器

verify-source-agent-delegation-shutdown.mjs独立home/profile，真实Config.initialize/gateway/ManageSwarmTool/Swarm/AgentTool以及legacy/session LocalAgentExecutor/GeminiChat，原生HTTP/SSE fixture。通过Config.adk.agentSessionSubagentEnabled选择原生分支，没有替换业务runner。

每条链先alpha/researcher用有效complete_task完成一次，得到ACCEPTED_PRIOR_REPORT及原归档。随后@alpha新一轮hold模型响应（legacy等待头，session已收到SSE注释后hold），同时加入beta/researcher，session single名额令beta在AgentTool排队，不发第二请求。Config.dispose后engine在2秒观察窗内收尾，活动HTTP在服务端释放之前非正常socketclose，alpha/beta均paused/有diagnostic，整任务未completed。

alpha原接受报告及fullResult引用保持，最新失败另记failedAttempts；beta仅失败诊断，不伪造成功。requests=2（原成功1+活动取消1）/turns=3（alpha2+beta1）/failedTurns=2（按既有错误计数），两者各一个失败归档。释放自有send模拟迟到成功但socket已断，状态完全不变，无晚报告或额外HTTP。closed Config新AgentTool调用本地AbortError，无dispatch。最后显式cancel各自fixture swarm，不改变个人任务。

20条件全部true/12722ms总/首次脚本退出0，共4次loopback模型协议请求（每条链一次正常控制+一次取消），0外部fetch/真实模型/付费/自动重试/旧失败重跑；临时provider字节保持。真实执行器取消、已接受证据/计数保全的证据，不是供应商协作质量、真实多成员代码交付或最终分发验收。

finally release自有send、stop/wait自有engine、dispose两自有Config、恢复fetch/DrillStore及关闭自有server，经realpath父目录/前缀核验只清自建temp根。历史被拒清理目录保持。

## 证据、保全与接续

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：agent-delegation-shutdown-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-core-compile.log、-lint.log/-lint-fix.log/-final-lint.log、-format-write.log/-format.log；verify-source-agent-delegation-shutdown.mjs与source-agent-delegation-shutdown.log/-result.json；verify-agent-delegation-shutdown-preservation.mjs与source-agent-delegation-shutdown-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装或旧未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。三份交接同SHA、目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

边界：活动child若不合作不收尾，本层会保留slot而不虚称已清理；这既保留并发约束，也不是所有底层阻塞的最终解法。Config.dispose本身仍不等待所有child，调用方/engine需要收尾；已有接受报告保留不等于保全每个关闭瞬间的未接受可见草稿。直接LocalAgentExecutor、独立BaseLlmClient及持有generator绕过委派的后台路径仍需检查。整体真实复杂协作质量、跨电脑逆向运行及最终多平台包仍待；继续原完整目标池，goal active。
