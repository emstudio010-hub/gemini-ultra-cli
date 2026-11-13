# Gemini Ultra CLI 跨协议异常结束门禁交接

日期：2026-11-13。WI-184 / E-421至422 / F-141。源码基线dd9ea156b4e4a4a3d25497c31db77c4dee59f0cd，分支codex/ultra-agent-portable；上一goal turn有源码/验证/同步进展，整体goal active。继续源码→Windows必要定向验证→最后统一打包；无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 源码缺口与修复

前阶段已拦截length/MAX_TOKENS，但其他明确异常结束仍可能接受完整工具调用。新增10个旧源码场景实际全部resolve而非预期reject，覆盖Chat content_filter/未知结束原因（含非流式）、Responses事件名response.completed但response.status=incomplete或附带error、Anthropic refusal/pause_turn/model_context_window_exceeded、Gemini SAFETY/OTHER（含非流式）。语法完整complete_task不代表其响应完整或任务通过。

修改universalContentGenerator.ts及providerProtocol.ts：
- Chat存在明确finish_reason时，仅stop/tool_calls视作正常；length保留原超限诊断，其余异常抛固定未完成错误。流式异常终止帧只发布可见正文后报错，不解析/释放其工具；非流式直接拒绝。
- Responses schema保留可选status；response.completed存在非completed状态，或非null error/incomplete_details时拒绝，不因事件名称“completed”而释放调用。原response.failed/incomplete/error处理保持。
- Anthropic明确stop_reason仅end_turn/tool_use/stop_sequence为正常；max_tokens保持原诊断，拒绝/暂停/其他未知原因按未完成失败，不等message_stop释放已收工具。pause_turn不被自动续跑。
- 外接Gemini明确finishReason只有STOP正常；MAX_TOKENS保持原错误，SAFETY/OTHER等按未完成失败。沿用前阶段可见草稿保留和调用延后交付；原生Google认证生成器未改。

不会抹去失败前已收到的可见文字；既有LocalAgentExecutor把它作为未验收草稿保存。固定异常诊断不拼接端点任意错误对象/内部数据。未新增模型请求、自动重试、fallback或权限变化。兼容未提供可选状态/原因字段的既有端点行为保持，本阶段专门拦截明确的异常状态，不声称已证明所有缺省/矛盾协议变体安全。

## E-421 源码定向

旧10个场景实际均“promise resolved instead of rejecting”，不是夹具缺接口导致失败；原log/JUnit保留。修后新增10项均通过，确认草稿可见、调用列表为空、单fetch、无fallback生成。与6个既有Chat/Responses/Anthropic正常正文/工具终止对照、前阶段3个Chat length正文及3个Gemini提前调用/MAX/EOF/STOP、2个Gemini超限流式/非流式对照合计24不同相关检查通过。

core/CLI严格tsc、三个修改/新增文件eslint --max-warnings 0、prettier --check、git diff --check均退出0，无首轮编译/lint修正或产品失败重试。只跑相关协议门禁/对照，没有全量/冒烟。

## E-422 Windows真实Agent链

Node v24.19.0编译源码真实Config/gateway/公开ManageSwarmTool/注册researcher/AgentTool/LocalAgentExecutor/GeminiChat/四种外接协议/Swarm/报告导出。独立profile/workspace、假凭据、loopback-only fetch。

每协议两个独立任务：异常响应包含完整complete_task和可见草稿，正常响应包含正常complete_task。异常分别为Chat content_filter、Responses completed事件+incomplete状态、Anthropic refusal、Gemini SAFETY。每个异常task成员paused/task blocked/1失败，正文保留UNACCEPTED_VISIBLE和未完成原因，不含正常完成标记；正常task成员waiting/task active/失败0且准确返回NORMAL_<protocol>。所有任务每个1请求/1轮，导出原文且不改状态；协议执行前后provider字节保持。

每个独立fixture结束仅显式cancel该测试任务后开始下一对照，不自动重试异常任务或修改预算绕过。38条件true，6303ms，8次本地模型协议请求、0外部/付费，验证器退出0。四条路径实际分别/chat/completions、/responses、/messages、/models/...:streamGenerateContent，不在摘要保存Gemini fake-key query。无shell/文件编辑工具、真实样本、ConPTY或包。

这证明实际执行器不会把这些明确异常的完整completion调用提升成GOAL，并且正常四协议仍可完成。不是供应商真实推理/拒绝策略质量、所有未知终止值/协议变体或跨平台验收。没有声称所有模型拒绝都必须自动重试，也不绕过供应商的拒绝结果。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu
- provider-stop-reason-before-test.log/-before-junit.xml（10旧失败）。
- provider-stop-reason-test.log/-junit.xml（24相关通过）；provider-stop-reason-core-compile.log、-cli-compile.log、-lint.log、-format.log、-format-check.log。
- verify-source-provider-stop-reason.mjs、source-provider-stop-reason.log/-result.json。
- check-provider-stop-reason-evidence.mjs、provider-stop-reason-evidence-summary.json；verify-provider-stop-reason-preservation.mjs、source-provider-stop-reason-preservation.json。

F-141 -> providers/universalContentGenerator各协议终止判定、providerProtocol.responsesSchema丢弃status：事件结束/完整调用掩盖明确异常。限定可接受的明确终止值并识别Responses显式矛盾状态修复该路径；可见草稿不晋升。旧真实复杂任务事实错误/截断本身仍未修复或重新验收。

## 保全、同步与接续

preservation passed=true：个人provider/locale/config/skill-tags.json精确SHA保持，ultra-tools.json不存在，安装preview.83；未改个人数据库、真实凭据、工具安装或PATH。E-294/E-364真实失败SHA及passed=false保持，不覆盖、不付费重跑。

沿用granted case work/gemini-ultra-agent-20261110/PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理或外部扫描。服务/fixture成员退出后核对专用mkdtemp父目录/前缀清理。目标池及case四项更新，源码/工程/Obsidian三份全文SHA一致；显式stage本轮文件、skip ci提交推codex隔离分支，不合并master/Release。

继续完善Agent实际交付与失败恢复，复杂真实任务质量和最终Windows/macOS/Linux统一包仍待。整体goal active，不把已修协议缺陷当作全面可上线验收。
