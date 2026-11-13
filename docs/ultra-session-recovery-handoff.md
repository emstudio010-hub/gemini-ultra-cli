# Gemini Ultra CLI 会话取消与恢复草稿交接

日期：2026-11-13。WI-158 / E-369至370 / F-115。持续目标 active，源码基线 aa5db8f。源码优先、Windows 必要定向验证、功能收敛后再统一最终平台包。全局安装 preview.83 保持，无打包、重装、升版本、多平台 CI 或外部/付费模型请求。

## 修复结果

会话模式 LocalSubagentSession 本就委托 LocalAgentExecutor，上一轮正文中断保留无需另写执行器。但 LocalSessionInvocation 未在创建会话前核对已取消信号，也未在 getResult 返回后核对取消；底层 LocalSubagentProtocol 即使发出 aborted 结束事件，仍可能把忽略取消的迟到 GOAL 原样 resolve 给调用者。取消发生在结果送达前时，可能显示成功或暴露本应丢弃的迟到正文。

LocalSessionInvocation.execute 现在在启动前和结果送达后调用原信号 throwIfAborted，预取消不创建会话，结果竞态保留原取消 reason，进度为 cancelled，不生成 completed。LocalSubagentProtocol 在执行器返回 ABORTED 或内部信号已取消时，统一返回空正文、ABORTED，保留既有时间/轮次指标，绝不把迟到 GOAL 当完成。本轮没有改变用户取消后丢弃正文的既有语义。

另外，executeFinalWarningTurn 原先只返回成功字符串或 null，导致最终恢复轮中上一轮新增的未验收草稿仍被丢掉。现在私有返回值明确分 text/completed：只有真实 complete_task 形成的 completed=true 才能修复“缺少最终提交”并晋升 GOAL；恢复轮中断草稿 completed=false，保留原 MAX_TURNS/TIMEOUT/ERROR_NO_COMPLETE_TASK_CALL，并附不完整、不可信、未经复核的草稿。没有再发一轮修复请求，没有执行截断响应的工具调用，取消仍优先。原成功恢复结果与预算语义保持。

## Evidence → Finding → Path

E-369：新增预取消会话、迟到成功会话、底层协议取消后迟到 GOAL、轮次上限恢复中断、缺少提交恢复中断五个场景。旧代码首跑五项失败，其中轮次上限场景首次夹具缺工具 responseParts，是夹具错误，不能当产品复现；另四项为实际行为缺口。修夹具后，该轮次场景与其他新增场景都通过。首测试编译还暴露回调声明将 ToolLiveOutput 错收窄为 SubagentProgress，已用真实联合类型与 isSubagentProgress 修正；原失败日志保持，不把测试夹具问题记作产品缺陷。

最终三个受影响文件只选择必要场景，10 项通过、146 项跳过；随后仅重验类型守卫修改的迟到成功场景，并补一个既有“缺少提交后正确恢复 GOAL”对照，两项通过。合计 11 个不同场景，未跑全量/冒烟。覆盖预取消不创建、取消原 reason、进度不完成、协议结果 ABORTED/空正文、两种失败原因不晋升、正常 GOAL、正常取消、TIMEOUT 保持、恢复轮取消优先和正常提交修复。

命令在 packages/core：npx vitest run src/agents/local-executor.test.ts src/agents/local-session-invocation.test.ts src/agents/local-subagent-protocol.test.ts -t 'incomplete recovery drafts|pre-cancelled session|late successful session result|late GOAL when cancellation wins|preserves cancellation with a plain Error|should handle abort|resolves with OutputObject on GOAL|preserves TIMEOUT when the grace turn captures partial findings|preserves cancellation during the grace turn' --coverage.enabled=false。补充对照仅 -t 'should recover successfully from a protocol violation|late successful session result'。strict core 源码编译最终退出 0，六修改文件 eslint 退出 0，类型修正文件单独 lint 退出 0，格式与 git diff --check 通过。

E-370：verify-source-session-recovery.mjs 在 Windows Node v24.19.0 使用真实 Config 的 adk.agentSessionSubagentEnabled=true、gateway 构造、注册 researcher、AgentTool/LocalSessionInvocation/LocalSubagentSession/LocalAgentExecutor/GeminiChat/SSE 适配器与 Swarm，未替换这些对象来验证截断路径。第一条 loopback 响应含思考、分段正文、半截 complete_task 和 length：成员 ERROR/paused、任务 blocked，1 请求/1 失败/1 轮，正文与原因保存、思考/参数不入草稿，报告导出一致且导出期间状态字节保持。

接着只显式取消该隔离 fixture 任务以开启独立恢复对照，不重放任何真实失败任务。实际 LocalAgentExecutor 收到无 complete_task 的正常正文后，进入一个最终恢复轮，再收到截断响应；两条额外 loopback 请求后仍为 ERROR_NO_COMPLETE_TASK_CALL，保留未验收草稿，没有晋升 GOAL 或追加第三轮。独立预取消 LocalSessionInvocation 保留同一 reason，0 额外请求。

底层协议迟到取消核对使用真实 LocalSubagentSession/协议和受控 executor.run 屏障：确实开始后取消，释放迟到 GOAL，getResult 为 ABORTED/空正文，时间与轮次保留；边界替身在 finally 恢复，0 额外 HTTP。该部分是取消竞态的受控证据，不冒充真实模型迟到时序。包装层结果送达竞态由 E-369 的可控 session.getResult 核对。

Windows 汇总 27 条件通过、5061ms、进程退出 0，共 3 次 loopback HTTP，0 外部/付费请求、0 样本或 shell 执行。第一场景“1 请求”计数在后续独立对照开始前核对，整轮总数明确为 3。所有失败状态按预期保留不等于模型任务成功；无真实模型质量、全终端视觉、跨平台或最终分发验收。

F-115 → Path：local-session-invocation.ts 的前后取消门、local-subagent-protocol.ts 的结果正规化，以及 local-executor.ts 的最终恢复返回语义。取消停止接受输出；流错误可留草稿但不完成；只有真实成功提交可以改变任务完成状态。

## 证据、保全与后续

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：agent-session-recovery-before.log / -before-junit.xml、-test.log / -junit.xml（首夹具问题）、-final-test.log / -final-junit.xml、-controls.log / -controls-junit.xml、-source-compile.log / -final-source-compile.log（测试回调类型问题）、-source-compile-pass.log、-final-lint.log / -types-lint.log，以及 verify-source-session-recovery.mjs、source-session-recovery.log / -result.json、source-session-stage-preservation.json。验证器留在工程证据目录，不作为用户功能分发。

结束后额外核对个人 provider、locale、config/skill-tags.json 与两份旧真实失败结果 SHA 全部保持，ultra-tools.json 仍不存在、全局仍 1.0.0-preview.83；保全文件 passed=true。个人三文件 SHA 为 e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332 / 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / 33a88098707f0383b34286ad83d7bc979f48f80441f4569cb1641ccfef89ca10。旧 E-364 / E-294 仍失败，未重试、恢复其丢失正文或覆盖结论；没有改个人数据库、工具安装或 PATH。只删除核实后的本验证 mkdtemp。

沿用 R26 和既有 granted case gemini-ultra-agent-20261110，同会话 lead/cae/doc，无 Codex 子代理；目标池、timeline/workitems/field-journal 同步。源码只推隔离 codex 分支并 skip ci，不合并 master、不正式 Release。

后续顺序：1. 继续收敛协作质量及工具/配置可用性，维持两次真实失败的证据边界；2. 收敛剩余 CLI 语言与日常交互，继续 Windows 必要定向验证；3. 全部功能收敛后统一最终 Windows/macOS/Linux 包与平台验收。整体上线目标未完成，保持 active。
