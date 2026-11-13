# Gemini Ultra CLI Swarm 无效复核保留与完成门禁交接

日期：2026-11-13。WI-174 / E-401至402 / F-131。源码基线6b5b1486df4260aa27ec9b14600efabc0c102039，分支codex/ultra-agent-portable，整体goal active。回到Agent协作源码；保持源码优先、Windows必要定向验证、最终各平台包后置，无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 修复与证据链

读取保留的E-294/E-364及既有交接，确认原真实失败仍是模型产物错误/输出截断，不能凭修改本地夹具说已修复真实质量。本轮独立发现swarm.ts复核解析与完成门禁两处缺口：

- JSON.parse在保存新成员状态之前抛出时，catch重新读旧状态，导致格式错误复核正文丢失，长输出虽可能已写不可变文件却未被当前成员引用。
- summary/evidence只要求长度≥1，空格/换行可满足。完整工具调用返回passed=true且空白证据时，verifiedRevision可授权任务完成。

新增统一reviewVerdictSchema及安全解析，summary和每条evidence先trim再判非空，仍要求passed布尔、至少一条证据。格式错误/字段不符/空白内容均暂停成员，固定诊断明确原文保留与显式纠正要求；原始正文不修改，长文继续走既有不可变归档，不把解析异常覆盖成只有Unexpected token。只计一次failed turn、不自动重试或唤醒。

预算交接使用相同校验，不再把空白旧记录显示成Saved review passed。finish在既有revision/成员状态/归档与worktree规则之外，重新读取并验证保存的审查正文及passed=true，不单信任旧verifiedRevision。拒绝旧空白通过标记时保持状态字节，不自动迁移或伪造一次新审查。合法否决仍保留waiting且不给通过标记，合法通过可完成；未改模型预算、maxOutputTokens、角色权限或完成工具的全局schema。

E-401：旧源码7个定向场景中5失败/2通过。失败覆盖短纯文本、长不完整JSON、空evidence数组、空白summary及空白evidence；两个合法passed=false/true对照原本就通过。修后增加显式纠正归档保持与旧保存通过标记两个场景，swarmVerdict共9个新场景；加3个既有预算交接/3个归档完整性相关对照，最终聚合15个不同相关场景通过。

首次新测试lint两处合并const声明已拆分，最终两文件eslint退出0、0warning；core/CLI严格源码编译、prettier --check、git diff --check退出0。finish补强后只重验4项相关场景并重新编译/运行原生验证，其余无改动场景不重复整套。证据聚合器首显示数量保留了旧14字面值，但断言实际已核对15；改为直接取Map.size，最终15，不改任何原始JUnit。未跑全量或冒烟。

复现：packages/core下npx vitest run src/agents/swarmVerdict.test.ts src/agents/swarmBudgetHandoff.test.ts src/agents/swarmFullResults.test.ts -t 'reviewer output|valid passed|malformed archive|cannot finish after|SwarmBudget|failure|review|diagnostic' --coverage.enabled=false；finish补充使用-t 'saved approval marker|valid passed|cannot finish after accepted'。仓库根依次npx tsc -p packages/core/tsconfig.json与npx tsc -p packages/cli/tsconfig.json。

E-402：Windows Node v24.19.0真实Config/gateway、注册workflow-auditor、AgentTool、LocalAgentExecutor、complete_task、SSE、Swarm及报告导出。两条loopback响应分别提交空白passed=true verdict和正常非空verdict，无外部模型或付费请求。

第一任务真实complete_task返回GOAL，但Swarm成员paused、任务按1失败预算blocked，预算恰好1请求/1轮/1失败；原始含空白的JSON逐字段保留、可导出且导出不改状态，finish拒绝，预算交接说明invalid verdict而不称通过。只显式取消这个隔离任务以运行独立正常对照，不复跑任何历史任务。

正常对照真实auditor提交合法结构后，验证器在此临时任务里模拟旧版空白正文+原verifiedRevision，finish拒绝且字节保持；恢复其原始合法fixture状态后finish完成，不谎称模拟改写就是新审查。另一个独立纯runner边界提交超过12000字符的格式错误文本，0额外HTTP，全文归档保持、paused、只运行一次。该场景明确是runner替身，不能冒称原生complete_task可返回无效JSON。

最终19条件通过，4956ms，验证器退出0；2本地模型协议HTTP、0外部/付费请求、无文件编辑工具或shell/样本执行。finish补强前一次原生17条件通过另存before-finish结果，改动后最终版本重验通过。实际完成工具能返回空白字段而Swarm必须拒绝的路径得到原生证明；合法对照只证明结构门禁和执行链，不证明模型真的独立阅读了fixture.md。

F-131 → Path：agents/swarm.ts在JSON解析异常时丢失当前复核正文、空白证据可通过、finish只信任保存标记。安全解析/统一trim校验、明确暂停并保留结果，以及finish重验正文修复这些路径。它不自动验证每条证据的事实，也不能替代真正独立审查。

## 证据与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
swarm-verdict-before.log/-before-junit.xml；swarm-verdict-test.log/-junit.xml、-final-test.log/-final-junit.xml、-finish-test.log/-finish-junit.xml；
swarm-verdict-core-compile.log/-final-core-compile.log/-release-core-compile.log，-cli-compile.log/-release-cli-compile.log；
swarm-verdict-lint.log/-final-lint.log/-release-lint.log；
swarm-verdict-format.log/-final-format-fix.log/-final-format.log/-release-format-fix.log/-release-format.log；
verify-source-swarm-verdict.mjs、source-swarm-verdict-before-finish.log/-result.json、source-swarm-verdict.log/-result.json；
check-swarm-verdict-evidence.mjs、swarm-verdict-evidence-summary.json；
verify-swarm-verdict-preservation.mjs、source-swarm-verdict-preservation.json。

最终保全passed=true：个人provider/locale/config/skill-tags.json精确SHA保持；E-294/E-364两份真实失败文件SHA及passed=false保持，ultra-tools.json不存在，全局仍1.0.0-preview.83。没有改个人数据库、真实凭据、工具安装或PATH。只用独立profile/workspace与假凭据，关闭服务后核对专用mkdtemp父目录/前缀再清理。

沿用granted case work/gemini-ultra-agent-20261110、PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。维护目标池/workitems/timeline/field-journal及源码/工程/Obsidian三份全文SHA一致报告；显式提交本轮文件、推隔离codex分支并skip ci，不合并master、不Release。

新门禁不会把旧真实任务判成成功，不重新发模型请求。未验证真实模型复杂逆向产物的准确性/原型推断/算术质量；未新增任意共享工作区文件在复核后变化的全量指纹，既有revision、结果归档与可选worktree检查保持原边界。下一步审查共享工作区交付物变化如何使旧复核失效，并继续收敛Agent任务质量，功能收敛后才做最终各平台包。整体上线目标保持active。
