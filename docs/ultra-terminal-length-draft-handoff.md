# Gemini Ultra CLI 终止帧草稿保留交接

日期：2026-11-13。WI-182 / E-417至418 / F-139。源码基线d532d46f96cdbcd22bc04f2a29eb521b3be53af5，分支codex/ultra-agent-portable；上一goal turn有源码/Windows验证/同步进展，整体goal active。继续源码优先、Windows必要检查；无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 根因与修复

回到旧E-364复杂Swarm输出截断问题：它真实返回HTTP200/finish_reason=length/completion_tokens=10240，属于端点生成上限，不是本轮发现了源码写死10240。原模型算术/推断质量仍失败，不因本次保存修复改判，亦不自动提高费用/上限或重跑。

独立发现OpenAI Chat流适配器同一帧带delta.content和finish_reason=length时，先检测length并抛错，终止帧最后可见正文没有yield，LocalAgentExecutor既有草稿保留也拿不到它。正常前序帧文本原可保留，终止帧文本丢失会让失败交接缺少最后结论/线索。

universalContentGenerator.streamOpenAIChat仅在length分支抛错前，将该帧非空delta.content以普通未完成响应yield一次，再抛原有完整错误。不处理该帧reasoning_content、不解析/发射工具调用，不设置completed、不产生正常完成事件。已有调用方继续收到失败；LocalAgentExecutor经既有中断处理将可见草稿作为未验收结果保留，不能凭草稿获得GOAL/Swarm通过。

只改core/universalContentGenerator.ts与providerStream.test.ts。未改非流式接口、Responses/Anthropic/Gemini协议、输出Token上限、推理深度、调用预算/自动重试或任务接受合同。该修复补回终止帧正文，不恢复已经被端点截掉的后续内容/工具参数，也不验证草稿事实。

## E-417 定向检查

新增3个相关场景，旧源码2失败1通过：终止帧只有正文、正文加完整工具调用，两者均丢失可见文本；只有推理的对照原本不产生可见正文且失败，保持。修后3项通过，加1个既有不完整流失败后显式新请求正常完成对照，共4不同相关场景通过。

断言原output token limit错误保持、文本仅在可见通道、工具调用列表为空、不走fallback、每场景单fetch。不是把length伪装成功的用例。core/CLI严格源码tsc、两文件eslint --max-warnings 0、prettier --check、git diff --check退出0；未跑全量/冒烟或未改协议链。

## E-418 Windows实际Agent链

Node v24.19.0真实Config/gateway/ManageSwarmTool/注册researcher/AgentTool/LocalAgentExecutor/GeminiChat/OpenAI SSE/Swarm及归档导出。独立profile/workspace、假凭据、仅loopback请求，task failed-turn预算1/maxAttempts1。第一且唯一响应在length终止帧同时放入18000字符级可见草稿、私有推理标记、语法完整的complete_task和write_file调用。

14条件true，5216ms，1次本地模型协议请求，验证器退出0。成员paused、task blocked、累计1请求/1轮/1失败，原输出上限错误保留；完整可见终止帧草稿在未完成报告中、长报告归档/导出字节一致，私有推理和伪完成标记不出现在报告，工具调用均未执行（无目标文件），finish拒绝，原fixture及隔离profile provider不变，导出不改state。

这是实际本地Agent协议/保存链验收，不是模型生成质量或旧复杂任务成功，也不表示researcher拥有写文件权限。工具调用在适配器层未发出，研究员原有只读权限亦保持。未模拟终止后的“继续补全”、没有自动请求重试或开新代理。未运行ConPTY/真实供应商/安装包/其他平台。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu
- terminal-length-draft-before-test.log/-before-junit.xml：旧2失败/1对照通过。
- terminal-length-draft-test.log/-junit.xml：修后4相关通过。
- terminal-length-draft-core-compile.log、-cli-compile.log、-lint.log、-format.log、-format-check.log。
- verify-source-terminal-length-draft.mjs、source-terminal-length-draft.log/-result.json。
- check-terminal-length-draft-evidence.mjs、terminal-length-draft-evidence-summary.json；verify-terminal-length-draft-preservation.mjs、source-terminal-length-draft-preservation.json。

F-139 -> providers/universalContentGenerator.streamOpenAIChat：先抛length导致同帧可见草稿丢失。先发布可见未完成文字再保留原失败修复该路径。草稿既有64KiB字符上限/归档完整性保持，不扩展为无限保存或执行失败工具；此修复不覆盖所有协议的最后一帧/非流式丢草稿问题。

## 保全与接续

preservation passed=true：个人provider/locale/config/skill-tags.json精确SHA保持，ultra-tools.json不存在，全局preview.83；无个人数据库/真实凭据/工具安装/PATH修改。E-294/E-364旧真实失败文件SHA及passed=false保持，不覆盖、不付费重跑，未把本轮成功改判旧失败。

沿用granted case work/gemini-ultra-agent-20261110/PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。关闭fixture成员/HTTP后核对专用mkdtemp父目录/前缀清理。目标池及case四项同步，源码/工程/Obsidian三份报告全文SHA一致；显式提交本轮文件、skip ci推codex隔离分支，不合并master/Release。

下一步继续实际协作结果可靠性和跨协议失败交接，复杂真实任务准确性、输出截断本身与最终平台包仍未验收。保持源码→Windows必要检查→最后统一打包顺序，整体goal active。
