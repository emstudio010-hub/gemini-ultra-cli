# Gemini Ultra CLI 流式工具身份交接

日期2026-11-13。WI-199 / E-451至452 / F-156。基线61045ac8bfe01aed1aed4e9821a0cdbf7c4c1810，分支codex/ultra-agent-portable。上轮已提交技能发现限时修复，属progress；整体goal active，源码优先→Windows必要定向验证→功能收敛后统一打包。无打包/全局重装/升版本/多平台CI或旧付费任务重跑，preview.83保持。

## 源码

复查Swarm截断与续接后确认已有中断正文保留和失败状态；本轮定位到OpenAI chat流式工具delta身份合并的缺口：同index反复提供完整工具名会字符串重复；同index更换id会覆盖旧id；不同index复用id会生成两个身份相同的调用。原工具名片段直接+=、id直接赋值。

现为每次stream记录已声明完整工具名；相同完整名重复时只保留一次，参数仍按delta原顺序拼接。若两个相同片段的拼接结果本身也是声明工具名，则保留原协议分片语义，不去重，避免part/partpart前缀误判；未声明完整名的重复片段照常累加，不新增模糊匹配。ID→index Map绑定流式身份，同index id变更或跨index复用id立即明确报错，不包含原始私有ID/参数。所有调用仍直到协议正常完成才统一发出，异常前不释放任何已收集调用。已有length/EOF/content_filter拒绝与可见正文保留不变。

这是OpenAI chat流式兼容修复，不承诺识别任意非标准协议片段；工具名本身有歧义时优先保留声明的拼接名称。未修改Swarm审批/预算/自动重试，也不把历史真实任务E-294/E-364改为通过。

## E-451 定向检查

新增providerToolIdentity.test.ts原5项里3实际失败（重复完整名、同index更换id、跨index复用id），2正常分片对照通过。修后该5项+stop reason10+stream29合计44通过。再加声明前缀歧义对照并完善保护，最终新文件6通过；共45不同相关检查通过，不重复相加、无新增skip。正常交错两调用、缺后续id、分片名称、重复非完整片段、part/partpart声明对照保持。

core严格tsc首次/最终及CLI严格tsc退出0；两个本轮文件eslint --max-warnings 0首次/最终退出0，新文件prettier --check、git diff --check退出0。原universalContentGenerator既有格式未全文件重排，仅维护修改块。未跑全量/冒烟。

## E-452 Windows真实原生Swarm链

Node v24.19.0，独立home/profile/workspace、假本地凭据，真实Config.initialize/gateway/ManageSwarmTool/原生researcher/AgentTool/LocalAgentExecutor/complete_task及loopback SSE。一个同名reader五轮显式派发：
1. 完整complete_task名称随两段参数重复，正常一次工具完成，长中文报告15436字符精确返回。
2. 相同index更换ID，paused/failedTurns1；visible草稿和明确诊断在lastError/board，原成功长报告逐字保持，未执行混合完成。
3. 显式续接重复完整名，waiting，长正文15452字符完整，失败计数保持1。
4. 两index复用ID，paused/failedTurns2；失败草稿/诊断可见，原长报告逐字保持，未执行重复调用。
5. 显式续接complete_+task分片名，waiting，长正文15460字符完整；5requests/5turns/2failedTurns不重置。

23条件true，5584ms/退出0，5loopback请求/0外部付费，无自动重试。三份成功当前/历史完整导出，两个失败诊断在导出board中保留；导出不改state。没有独立审核员，finish仍拒绝，reader成功不等于任务完成。执行未改隔离provider，engine显式cancel且临时根finally清理成功。非真实模型理解/复杂逆向质量/ConPTY/最终包验收。

首实际验证器误把失败诊断当成member主报告并假定五份正文历史，结果4条件false，first-log/first-result保留；读取源码和既有恢复合同确认失败不能覆盖旧成功主报告，分别检查lastError/board与三份成功历史，未改产品放宽。随后强化旧报告逐字对比而非只比较尾部，并重验以上最终结果。

这一核对也暴露剩余边界：失败尝试目前不是结构化全文历史项，短诊断主要在lastError/board、长部分输出有archive路径。后续需评估失败尝试的完整索引/导出，不能把当前三份成功报告历史宣称五份全尝试完整归档。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- provider-tool-identity-before-test.log/-before-junit.xml（3失败/2对照通过）；-test.log/-junit.xml（44通过）；-final-test.log/-final-junit.xml（最终6通过）。
- provider-tool-identity-core-compile.log/-final-core-compile.log/-cli-compile.log、-lint.log/-final-lint.log、-format.log/-final-format.log/-format-check.log。
- verify-source-provider-tool-identity.mjs、source-provider-tool-identity.log/-result.json；source-provider-tool-identity-first-log.txt/-first-result.json（首4条件错误预期）；verify-provider-tool-identity-preservation.mjs、source-provider-tool-identity-preservation.json。

F-156 -> 流式工具调用名称重复和身份覆盖/复用，可能导致Tool not found或错误参数归属。声明名称精确去重及ID绑定修复；正常分片、累积参数和失败不执行约束保持。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持，ultra-tools不存在，全局83保持；E-294/E-364旧复杂真实任务SHA和passed=false保持，不覆盖不付费重跑。不改个人数据库/凭据/工具安装/PATH，旧ultra-cockpit-review-scope-S0wWvh拒绝清理不重试。

沿用granted case / PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描；维护目标池/case四项/证据，三份交接全文SHA一致。显式stage、skip ci推隔离分支，不合并master/Release。继续处理剩余多Agent交付和失败尝试保存；更多模型/长会话、真实复杂交付质量与最终Windows/macOS/Linux统一包未验收，goal active。
