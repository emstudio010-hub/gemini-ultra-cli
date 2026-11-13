# Gemini Ultra CLI 中断正文保留与重试隔离交接

日期：2026-11-13。WI-157 / E-367至368 / F-114。持续目标 active，源码基线 2561aba。沿用既有 case 与本地 DSH-purge 参考，源码优先、Windows 必要定向验证，功能收敛后才统一最终平台包。全局 preview.83 保持，本轮无打包、重装、版本变化、多平台 CI 或外部/付费模型请求。

## 问题与修复

上轮真实 E-364 的 prototypes 响应已产生正文，但以 finish_reason=length 结束。旧 LocalAgentExecutor.callModel 抛出流错误时丢失局部 textResponse，LocalSubagentInvocation 最终只返回异常原因；不能从新代码恢复上轮没有保存的正文。源码进一步发现 GeminiChat 发出 RETRY 后，该执行器仍保留上一尝试的正文和 functionCalls，可能混入下一尝试，造成旧工具调用被重新处理或与 complete_task 冲突。

packages/core/src/agents/local-executor.ts 现在只在收到可见正文后发生流错误且调用信号未取消时，返回明确的 ERROR 停止结果，并将正文标记为 incomplete / unverified / untrusted 的未验收草稿。草稿不进入 complete_task，不触发额外恢复请求，收集到的工具调用全部丢弃；外层成员仍失败，预算仍累计失败，不会因此通过独立复核。原有 Swarm 失败持久化与报告导出承接该结果，不增加独立存储格式。

可见正文按每次尝试最多保留 65536 个 UTF-16 字符单位；超限附截断标记并避免末端半个代理对，后续文本不会伪称完整保存。只提取非 thought 的 text，不提取 reasoning、函数调用或参数。没有可见正文、只有 thought、外部取消和调用期限到达时，仍抛原异常，保留原有取消/超时恢复语义。RETRY 事件清空旧调用、旧正文及截断状态，只处理当前尝试；不修改底层重试策略、次数、模型上限或请求预算。

## Evidence → Finding → Path

E-367：新增短/长中断正文两场景在旧源码均失败，thought-only 与正文后取消两个对照保持原异常；再添加现有流重试后失败/成功两场景，证明旧代码混入旧正文/旧工具调用并与最终提交冲突。修后新增六场景加原有「期限后无关错误不恢复」「期限后外部取消不恢复」两个对照，共八项必要定向通过；其余 80 项未运行，没有全量/冒烟。

命令在 packages/core：npx vitest run src/agents/local-executor.test.ts -t 'interrupted visible drafts|does not recover unrelated errors after the deadline|does not recover external cancellation after the deadline' --coverage.enabled=false。首正文旧复现 2 失败/2 对照通过，重试旧复现 2 失败，最终 8 通过。根目录 npx tsc -p packages/core/tsconfig.json、仅修改的 local-executor.ts 与 local-executor.test.ts eslint 均退出 0；格式化与 git diff --check 通过。未重复检查未受影响模块。

E-368：verify-source-visible-draft.mjs 在实际 Windows Node v24.19.0，用编译源码的 Config.initialize/refreshAuth(gateway)、注册 researcher、AgentTool、LocalAgentExecutor、GeminiChat、OpenAI SSE 适配器与 Swarm 引擎连通验证，没有替换执行器或聊天类。唯一 loopback HTTP 200 流分段发送 reasoning、可见正文、不完整 complete_task 参数及 length 终止。真实执行器输出 ERROR，成员 paused、任务 blocked、requests=1 / failedTurns=1 / turns=1，没有第二次请求。

18 条件通过、5403ms、验证进程退出 0。失败结果逐字包含分段可见正文与原截断原因，明确未验收，思考和半截参数均不进入结果；没有 accepted completion 或 verifiedRevision。完整导出与保留结果一致，导出前后状态字节保持，workspace 没有写入。这里的进程成功只表示失败场景按预期保留，不是协作任务成功。

该 Windows 验证覆盖原实际失败使用的 legacy local executor。底层 HTTP 是受控数据，不证明真实模型输出质量，也没有证明 session executor、完整终端视觉、网络断线重试或最终跨平台分发；两种 RETRY 结果隔离由 E-367 的真实执行器/受控流事件验证。取消对照证明原异常优先，不宣称取消后继续保留草稿；最终 grace recovery turn 中的另一处错误处理仍沿用旧行为。

F-114 → Path：中断时可见草稿丢失与 RETRY 跨尝试污染均位于 LocalAgentExecutor.callModel / executeTurn。本轮保持错误状态，把已有可见成果保留下来，并在尝试边界清掉旧调用；没有靠增加模型预算、自动重试或把草稿算成功来隐藏真实质量失败。

## 保全与接续

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：agent-visible-draft-before.log / -before-junit.xml、agent-visible-draft-retry-before.log / -retry-before-junit.xml、agent-visible-draft-final-test.log / -final-junit.xml、agent-visible-draft-source-compile.log / -lint.log / -format.log，以及 verify-source-visible-draft.mjs、source-visible-draft.log / -result.json。验证器不随最终包分发。

个人 provider / locale / config/skill-tags.json SHA 均保持 e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332 / 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / 33a88098707f0383b34286ad83d7bc979f48f80441f4569cb1641ccfef89ca10；隔离供应商文件字节保持，只用假 loopback 凭据。E-364 与 E-294 失败结果 SHA 保持 2a049b84ced5d718e829b1a55a0fc56186b013feee821e72fc6bafa96d32a093 / d4e4d2146801d697bc951ad3e77985f7492b7edc990665c2d9d62ee869a383a6，没有重放、纠错循环或覆盖。临时根核对后只删除本验证器的 mkdtemp；没有改个人数据库、账户、工具安装或 PATH。

本轮是 R26 源码审查与必要验证，沿用 granted 的 gemini-ultra-agent-20261110，lead/cae/doc 在当前会话承担，没有启动 Codex 子代理。该诊断结果沿用核心执行器原英文协议，未新增 UI 布局或语言选择；终端外层既有双语故障交接保持。只同步隔离 codex 分支并 skip ci，不合并 master 或正式 Release。

后续顺序：1. 审查 session executor 与最终恢复轮的中断成果边界，维持取消优先与失败计账；2. 继续收敛真实协作质量及 CLI 语言，不重跑两次已失败付费任务；3. 全部源码功能与 Windows 必要验收收敛后再统一最终 Windows/macOS/Linux 包。整体上线目标尚未完成，保持 active。
