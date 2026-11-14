# Gemini Ultra CLI 长工作流归档后续跑交接

日期2026-11-14。WI-205 / E-463至464 / F-162。基线0a51ba0aa213ccf23e49a959f00f0d701deee4a9，分支codex/ultra-agent-portable。上一goal turn为progress（源码提交及实际Windows证据）。整体goal active，源码优先→Windows必要定向验证→功能收敛后统一打包；不打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 缺陷与源码

workflowContext.ts在生成1200字符以上、16000字符以内的近期报告全文镜像时，用workflowReportCount计算的总序号调用reportFile；reportFile却拿该总序号索引仅保留最近一批的record.reports。100条报告归档后近期数组重置，序号101及以上读到undefined，后续context生成抛错，原生Boost/Teamwork会把阶段标成失败并受阻。超过16000字符已有fullText归档的报告走另一支，不受此索引错误影响；已有历史测试只有极短新报告，未覆盖此区间。

修复仅workflowContext.ts：reportFile显式接收当前已读取的original文本，继续用总序号命名镜像，不再用总序号索引当前数组。全文、全局顺序、不可变镜像哈希/符号链接拒绝逻辑与权限保持。未更改预算、审批、阶段完成判定或报告归档上限。

workflowReportHistory.test.ts补一个实际runAgentWorkflow回归场景：100条既有报告后生成中等新报告，原生阶段继续到完成；验证第103份implement镜像的总序号/全文、重读状态字节不变，镜像被改后仍拒绝且保留受改镜像/原状态。复用既有fixture runner，未新增实现副本。

## E-463 定向检查

修前新增该用例运行退出1，实际phase为blocked而非completed，保全workflow-rollover-before.log及-junit.xml；修后workflowReportHistory与workflowFullReports两个相关文件共9项通过，退出0。命令初指定额外workflowContext.test.ts无实际文件匹配，最终工具明确只运行上述两文件，不把未运行文件计入证据。

core严格tsc退出0；双文件eslint首次/最终--max-warnings 0退出0；首Prettier检查提示新增test函数排版，保全首format日志，执行格式化后最终检查退出0；git diff --check退出0。格式化只改变新增测试的排版，无语义变动，无重复全量/冒烟。不改CLI，无重编未受影响CLI。

## E-464 Windows编译源码与跨进程导出

verify-source-workflow-rollover.mjs使用独立临时home与两个任务目录，编译core实际create/save/runAgentWorkflow链；每个模式预置205份1200至16000字符的独立报告，确实形成两次百份归档。Teamwork明确设置已批准ready fixture，只验证报告传输，不作为真实交互审批证据。

Boost执行5个确定性阶段回调、每次解析真实handoff并核验所引用全文文件，共19次全文/哈希/长度检查，最终completed；Teamwork4个回调、15次handoff核验、最终completed。随后另一个新Node进程读取两个保存任务和context，完整导出分别210/209份报告，逐份比对预期全文与manifest SHA，状态文件逐字不变。parent退出0，汇总passed=true，1947ms（非启动基准）。finally停止子进程后仅清理验证器自有临时根。

这是原生工作流状态机和全文交接/导出验证；阶段runner是确定性回调，没有真实LLM、多Agent推理质量、实际CLI交互或真实业务文件修复。networkCalls0，无模型供应商/付费调用、样本执行或外部安全目标。不把completed夹具状态冒称整体产品验收。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- workflow-rollover-before.log/-before-junit.xml、-tests.log/-junit.xml（9项）；
- workflow-rollover-core-compile.log、-lint.log/-final-lint.log、-format.log/-format-write.log/-final-format.log；
- verify-source-workflow-rollover.mjs、source-workflow-rollover.log/-result.json、workflow-rollover-run.log/-verify.log；
- verify-workflow-rollover-preservation.mjs、source-workflow-rollover-preservation.json。

F-162 -> 百报告归档后近期中等报告的全文镜像全局序号误作数组下标，造成后续阶段受阻。证据链为修前实际回归失败→源码根因修复→9项相关回归及Windows双模式/新进程419份导出全文SHA通过。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持，ultra-tools不存在、全局83保持，E-294/E-364原失败SHA及passed=false保持。未改个人凭据、数据库、工具安装或PATH，不重跑旧付费任务。历史未跟踪文件保留，显式stage、skip ci推隔离分支，不合并master/Release。

沿用granted case/PRIMARY R26 code-audit；lead/cae/doc同会话，无Codex子代理。维护目标池/case四项和证据，三份交接全文同SHA。整体复杂真实协作质量、更多模型/长会话与最终跨平台发布仍未验收，goal active。
