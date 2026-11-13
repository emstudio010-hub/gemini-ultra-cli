# Gemini Ultra CLI 工作流历史报告保全交接

日期：2026-11-13。WI-188 / E-429至430 / F-145。源码基线358a79285fb9a453d9b3d236d6b22ade9232ff96，分支codex/ultra-agent-portable。上一阶段为源码/Windows验证和提交进展，整体goal active。继续源码→Windows必要定向验证→最终统一打包；无打包、重装、升版本、多平台CI或旧付费任务重跑，安装preview.83保持。

## 实际缺陷与完整保留

Teamwork/Boost在stage结果与native-file-check写入后直接reports.slice(-100)，会静默丢弃早期报告条目。长正文文件可能还在，但无引用、导出/接续不可发现；短报告可能没有单独文件。本轮旧源码复现：预存100报告（含早期失败与>16000字符长报告），实际再跑Boost5阶段后导出仅100，预期105，测试失败。不是全量检查或人为降低验收条件。

新增workflowReportHistory.ts：每到100条最近报告，先将这100条完整阶段元数据写入不可变SHA命名JSON批次，再保存新报告与批次引用；包含agent/stage/completed/modelsUsed/text及既有fullText引用，不丢早期失败或长文定位。wx写入，已存在则校验文件类型/大小/SHA/数组schema，不覆盖改动。任务JSON仍最多100个recent reports，新增可选reportHistory引用，旧记录无需迁移即可读取。历史元数据每批100条/最多8MiB、最多128批次，超限明确失败，不声称无限存储。

workflowContext传批次文件路径、SHA、字节/条目数及读取指导，最近正文仍仅4条；旧长正文路径仍为同任务reports目录full-<sha256>.md。上下文不读取所有历史，也不把旧正文直接塞回提示词。镜像序号包含历史偏移，防止滚动后序号重置。

exportWorkflowReports按历史批次→最近报告顺序汇总完整原文，继续使用原长正文校验；新进程同样可导出。summary和演练台details的reportCount包含历史条目，但details仍只展示4个有界预览，不轮询加载历史文件或长文。计数是保存的元数据，不是实时历史完整性检查。

最终审核通过后、标记completed之前，逐批验证历史元数据类型/字节/SHA/schema，不把所有批次同时保留在内存；损坏时blocked且末里程碑未完成，原始audit及历史引用保留。该步骤检查归档完整性，不证明模型确实阅读或理解所有报告；原长正文在显式完整导出/按需读取时校验，面板不扫描。归档和任务状态并非多文件磁盘原子事务；磁盘写入/进程崩溃与超大历史性能未做压力验收。旧版本已经丢弃且未保存的文本无法凭空恢复。

## E-429 定向源码

新增5项：100→105完整导出（长Unicode正文、早期failed状态）、205条跨两次滚动排序与重复导出、历史changed/missing拒绝完整导出但只读详情保持、final audit期间修改历史阻断且原audit保留。与workflowFullReports3、agentReports3、agentTaskDetails7合计18，再加agentWorkflows18，共36不同相关检查通过。最终逐批内存优化后只重验新增5项并通过，不将重复运行计成新覆盖。

core/CLI严格tsc、6个修改/新增文件eslint --max-warnings 0、prettier --check和git diff --check最终退出0。末次逐批helper格式检查首次要求函数签名换行，格式化后通过；没有额外生产逻辑失败。未跑全量/冒烟、没有新增依赖。

## E-430 Windows真实Agent与跨进程导出

Node v24.19.0，独立profile/workspace、假provider、loopback-only协议。真实Config/gateway/公开RunAgentWorkflowTool/注册researcher和auditor/AgentTool/LocalAgentExecutor/GeminiChat/complete_task/SSE。保存100个旧报告夹具，再由实际Boost运行5阶段（2researcher+coder+review+final），空review_files只覆盖成员报告，不声称工作区文件交付。

最终14条件true、5740ms、退出0、5次本地模型协议请求、0外部/付费：状态仅5recent+1历史引用，105条完整有序导出，原长文及SHA准确、早期failed保留，两个实际auditor请求都能看见历史指针；实际预算只计5次新请求，details总105但预览4，导出不改state。全新Windows子进程同样导出105且snapshotSHA/indexPath一致。宿主改历史批次后完整导出拒绝且不覆盖原改动，details仍只读可用。provider字节及空workspace保持，fixture finally清理成功。

逐批内存优化前第一次完整原生验证也通过（6537ms/5loopback），保留before-bounded-validation日志/结果；优化后重验最终5请求，合计本阶段10个受控本地请求，无真实模型重试。不是付费供应商智能、复杂逆向语义、ConPTY或最终包验收。100旧结果是保存夹具，不声称执行过100次模型。

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- workflow-report-history-before-test.log/-before-junit.xml（旧1失败，105→100）；-test.log/-junit.xml（18通过）、-workflow-test.log/-workflow-junit.xml（18通过）、-final-test.log/-final-junit.xml（最终5重验）。
- workflow-report-history-core-compile.log / -cli-compile.log / -lint.log / -format.log / -final-format.log / -format-check.log。
- verify-source-workflow-report-history.mjs、source-workflow-report-history.log/-result.json，以及before-bounded-validation日志/结果。
- verify-workflow-report-history-preservation.mjs / source-workflow-report-history-preservation.json。

F-145 -> agentWorkflows两处slice(-100)静默丢报告；workflowContext/agentReports/details仅认识recent。历史批次、指针与完整导出修复该路径，未把报告保存当作内容事实正确性的证明。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持，ultra-tools.json不存在，全局preview.83；E-294/E-364旧真实复杂任务SHA及passed=false保持，无覆盖或付费重跑。不改个人数据库、凭据、工具安装或PATH。旧ultra-cockpit-review-scope-S0wWvh清理被拒绝的边界保留，不重试删除。

沿用granted case / PRIMARY R26 code-audit，同会话lead/cae/doc，无Codex子代理或外部扫描。更新源码目标池、case workitems/timeline/field-journal/evidence，三份全文SHA一致；显式stage本轮源码与报告，skip ci提交推codex隔离分支，不合并master/Release。

继续实际Agent交付、长任务完整性与Windows源码收敛；复杂真实任务质量、更多模型和最后Windows/macOS/Linux统一包仍待。整体goal active。
