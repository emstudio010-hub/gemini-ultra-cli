# Gemini Ultra CLI Gemini 截断完成门禁交接

日期：2026-11-13。WI-183 / E-419至420 / F-140。源码基线f8193a1d9a686f2d922af999cbd5051e281562cd，分支codex/ultra-agent-portable，整体goal active。上一goal turn有源码/验证/同步进展；源码优先、Windows必要定向验证，最终统一打包后置，无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 缺陷与修复

跨协议审查确认：Chat length、Responses incomplete和Anthropic max_tokens已有失败路径，但外接Gemini generateGemini/streamGemini只判断有没有finishReason，不拒绝MAX_TOKENS。GeminiChat在有完整functionCall时也不按该finishReason拒绝，因此语法完整的complete_task可能来自截断输出却被接受。外接Gemini还逐帧暴露早期functionCall，后续EOF/超限前可能已经被调用方看到。

仅在外接Gemini适配器修复，原生Google认证生成器未改：
- 非流式响应MAX_TOKENS直接抛“Gemini output token limit reached; response is incomplete.”，不返回可执行调用。
- 流式终止帧MAX_TOKENS只发布首候选的可见text，剔除thought/functionCall/functionResponse，然后抛相同失败；不标completed，不返回正常终止。
- Gemini流中的functionCall原始part按候选暂存，正常协议结束时才合并发出；EOF/超限不释放此前收到的调用。文本和正常推理流保持即时交付。完整call part上的额外元数据保持，不重新解析其参数或扩大权限。

这与其他适配器的工具调用延后交付方式一致。正常STOP能完成；此前Chat终止帧草稿保留保持。不提高token限制、改变推理强度、任务预算或自动重试；不从截断正文推断审查通过，也不修复模型原有算术/语义错误。非流式失败只报告错误，不伪造能返回草稿的成功响应。

## E-419 源码证据

旧源码2个实际场景失败：流式和非流式Gemini MAX_TOKENS带完整complete_task均resolve，预期reject；原JUnit/log保留。

最终聚合12个不同相关检查通过：2个新MAX_TOKENS场景，3个提前调用+后续MAX_TOKENS/EOF/STOP对照（首帧没有functionCalls，仅STOP释放原调用），以及4协议既有正常完成/取消资源关闭4项和前阶段Chat终止帧3项。没有扩展全量/冒烟或重跑旧任务。

首core编译发现暂存Map用SDK Part[]不能回赋schema推断类型，改为从geminiSchema.parse推断Candidate/Part类型，避免不安全断言；首编译错误记录保持。最终core/CLI严格tsc、两文件eslint --max-warnings 0、prettier --check、git diff --check退出0。修复仅类型调整后不重复未改运行路径，新增早期调用3项在相关定向运行通过。

## E-420 Windows实际Agent执行链

Node v24.19.0真实Config/gateway/ManageSwarmTool/注册researcher/AgentTool/LocalAgentExecutor/GeminiChat/外接Gemini SSE/Swarm与长归档导出。独立profile/workspace、假凭据、只允许loopback。第一条响应先发完整complete_task，再发MAX_TOKENS终止帧，含长可见草稿、私有推理、完整write_file调用。

17条件true，5367ms，2次本地Gemini协议请求，验证器退出0，0外部/付费。首任务成员paused、task blocked、1请求/1轮/1失败；原Gemini超限原因和全部可见草稿保留、长归档/导出精确一致，推理和伪成功标记不入报告、无写文件、finish拒绝、fixture/provider字节保持，导出不改state。

为正常对照，仅显式cancel这个独立fixture失败任务，再创建另一个独立task，第二响应正常STOP+complete_task，实际成员waiting、返回正常结果、失败计数0。不是自动重试失败任务，也不是将旧失败改判成功；首任务cancelled且原长结果/归档仍保持。两个请求均命中/v1/models/gemini-length-fixture:streamGenerateContent，未泄露请求URL中的fake key到保存摘要。

该证据验证真实外接Gemini适配器和本地Agent完成链，不是原生Google账号认证、真实供应商推理质量、终端ConPTY、包或其他平台验收。研究员原有只读工具限制保持，不将它含write_file的夹具响应当作合法写入授权。未覆盖所有多候选流变形/所有其他finishReason错误，也不表示Responses/Anthropic所有异常路径完全验收。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu
- gemini-length-gate-before-test.log/-before-junit.xml：旧2失败。
- gemini-length-gate-test.log/-junit.xml、-controls-test.log/-controls-junit.xml：最终12不同通过。
- gemini-length-gate-core-compile.log（首类型错误）、-final-core-compile.log、-cli-compile.log、-lint.log/-final-lint.log、-format.log/-controls-format.log/-final-format.log/-format-check.log。
- verify-source-gemini-length-gate.mjs、source-gemini-length-gate.log/-result.json。
- check-gemini-length-gate-evidence.mjs、gemini-length-gate-evidence-summary.json；verify-gemini-length-gate-preservation.mjs、source-gemini-length-gate-preservation.json。

F-140 -> providers/universalContentGenerator的外接Gemini响应处理：MAX_TOKENS可带完整工具并被误接受，早期工具也在终止前暴露。显式失败/可见草稿保留/调用延后交付修复这两条路径。截断仍是未完成，不解决端点输出上限、被截掉的后续信息或真实模型质量。

## 保全与接续

preservation passed=true：个人provider/locale/config/skill-tags.json精确SHA保持，ultra-tools.json不存在，安装preview.83；未改个人数据库、真实凭据、工具安装或PATH。旧E-294/E-364真实失败文件SHA与passed=false保持，不覆盖、不付费重跑。

沿用granted case work/gemini-ultra-agent-20261110/PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。关闭fixture成员/HTTP后核对专用mkdtemp父目录/前缀清理。目标池与case四项同步，源码/工程/Obsidian三份报告全文SHA一致；显式stage本轮文件、skip ci提交推隔离codex分支，不合并master/Release。

继续收敛Agent跨协议交付与失败恢复，复杂真实任务质量和最终平台包仍未完成；整体goal active，保持源码→Windows必要检查→最后统一打包顺序。
