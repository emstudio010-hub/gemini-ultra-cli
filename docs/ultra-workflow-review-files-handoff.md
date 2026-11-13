# Gemini Ultra CLI Workflow 最终文件复核交接

日期：2026-11-13。WI-177 / E-407至408 / F-134。源码基线86472c5e97adf02262a4bc00f89db5e9f5911680，分支codex/ultra-agent-portable；上一goal turn为真实源码/验证/同步进展，整体goal active。继续源码完善、Windows必要定向验证，功能收敛后统一打包；本阶段无打包、重装、版本更新、多平台CI或旧付费任务重跑，全局preview.83保持。

## 功能缺口与实现

Teamwork/Boost与Swarm的完成规则存在差异：共享工作区最终审核只核对结构化passed=true，不核对审核期间文件内容是否变化。E-407旧源码两个场景均实际失败：Boost、Teamwork的runner在最终审核时把REPORT.md从A改B，再返回通过，任务仍completed；旧低层API忽略额外文件范围参数，没有对应门禁。

复用既有文件指纹实现，在run_agent_workflow公开工具增加必填review_files。明确列出最终交付物与证据文件；最多64项、每路径trim非空且最多1024字符、总内容64MiB，拒绝重复、外部路径和异常文件等边界沿用Swarm helper。声明[]仅用于没有工作区文件交付物的成员报告任务，不批准未列文件。CLI的Boost/Teamwork执行/续接提示要求给清单，路径未知先检查相关源码；不增加面向用户的审批步骤。Grill-me仍只对齐需求，不改其完成含义。

runAgentWorkflow低层API增加可选reviewScope，公开工具总传Config.getTargetDir及清单。持久化realpath workspace/reviewFiles，拒绝不同工作区重绑；开始前校验归属与字段，清空旧reviewedFiles。低层未绑定workspace的旧API调用保留兼容，真实公开工具必须明确范围；旧保存任务在公开执行/续接时重新声明清单。summary和各阶段上下文带文件范围。

清单在最终集成审核前后才抓取/比对SHA256和字节，不提前要求后续里程碑的文件存在，不扫描整个工作区或在状态轮询中hash。managed worktree存在时使用隔离目录，不读取源checkout作为最终快照。正常通过且既有worktree检查成功后保存reviewedFiles并完成。

最终审核期间文件变化或不可读取时，最后里程碑恢复未完成，原模型audit/长全文归档保持；另存agent=native-file-check、stage=final audit file check的本地失败报告，准确区分本地文件检查与模型verdict，记录一次failed stage并受阻，不自动发新请求。即使失败预算耗尽，原因仍在该本地报告中，不能仅剩通用budget exhausted。必须经本地resume显式续接，再独立审核当前文件；完成状态是当次历史验收，不承诺之后外部修改自动刷新状态。

## 必要检查与Windows执行链

E-407最终聚合14个不同相关检查通过：6个新增文件范围/多里程碑/纯报告/重绑/公开schema场景，3个旧workflow批准/纠正/非法review对照，3个原生结果交接对照，1个CLI Boost提示对照，1个真实Windows git managed-worktree工作流对照。最后两个模式还覆盖Teamwork失败预算1时本地原因保留；worktree场景确认最终snapshot来自隔离目录且随后原生apply正常。只重验受影响场景，无全量/冒烟。

core/CLI严格源码编译退出0，八文件最终eslint --max-warnings 0、prettier --check及源码git diff --check退出0。初次core编译发现旧workflow-result-handoff fixture未提供新必填review_files，补显式[]/getTargetDir及其Swarm纯报告范围后通过。一次补测试时使用CRLF替换未命中，没有改文件；随后该旧fixture缺scope和setWorkflowBudget误传ID导致3个补充场景失败，改正确record参数和显式worktree scope后3个相关场景通过，失败日志原样保留。这些是测试接线错误，不宣称产品修前又多出三项缺陷。

E-408 Windows Node v24.19.0真实编译CLI命令handler（不含ConPTY）、Teamwork创建访谈→DraftAgentWorkflowTool→approve、RunAgentWorkflowTool/真实Config/gateway/注册researcher/coder/auditor/AgentTool/LocalAgentExecutor/complete_task/SSE、文件指纹、长归档和导出。

使用已有无害REPORT.md/evidence.json，不要求模型生成代码或编辑文件。第一轮researcher/coder/里程碑review/final audit共4次loopback响应；final响应挂起期间宿主将报告A改B。模型真实complete_task返回长passing verdict，但公开run返回execution_failed、task blocked/最后里程碑未完成；独立本地原因报告、原长audit/归档/导出内容保持，导出不改任务记录；预算恰好4请求/1轮/1失败。

通过真实/teamwork resume handler显式恢复，再调用公开工具声明相同清单，第二轮4个本地响应审核B后完成；保存2文件指纹且REPORT SHA与当前B一致，旧长归档精确保持，累计8请求/2实现轮/1失败。evidence与隔离profile provider字节保持，命令handler无error。17条件通过、5264ms、8本地协议请求、0外部/付费请求，验证器退出0。

首验证器将researcher/coder的complete_task.result误写成string，实际schema要求{response:string}，导致本地校验往返/fixture 429及等待final上限退出1；first日志保留。核对CompleteTaskTool/ultraSpecialists源码，修验证器嵌套响应后一次通过，未为此更改产品或重跑外部模型。实际链路不证明模型真实阅读能力、代码生成或复杂逆向质量，也不是终端交互、最终包、另一台电脑或跨进程文件锁验收。

工程证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu
- workflow-review-files-before-test.log/-before-junit.xml：旧2失败。
- workflow-review-files-test.log/-junit.xml；-controls-test.log/-controls-junit.xml；-handoff-test.log/-handoff-junit.xml；-cli-test.log/-cli-junit.xml。
- workflow-review-files-final-test.log/-final-junit.xml：补测试3失败留证；-worktree-test.log/-worktree-junit.xml：修fixture后3通过。
- workflow-review-files-core-compile.log（首fixture错误）、-final-core-compile.log、-release-core-compile.log；-cli-compile.log、-final-cli-compile.log；-release-lint.log、-release-format-check.log及前序格式/检查记录。
- verify-source-workflow-review-files.mjs、source-workflow-review-files-first.log、source-workflow-review-files.log/-result.json。
- check-workflow-review-files-evidence.mjs、workflow-review-files-evidence-summary.json；verify-workflow-review-files-preservation.mjs、source-workflow-review-files-preservation.json。

F-134 -> agents/agentWorkflows.ts / agentWorkflowTools.ts：共享工作区最终审核期间变化没有失效通过。显式最终清单、内容前后核对、本地诊断报告与显式续接修复该路径。清单完备性仍需协调者/审查员按任务确认；文件hash不是OS隔离、文件系统锁或跨文件原子快照，检查后外部修改仍有竞态。中间里程碑review不新增全量文件门禁，最终集成审核覆盖声明的整体文件范围；[]不能代替文件交付物审核。

## 保全、同步与接续

保全passed=true：个人provider/locale/config/skill-tags.json精确SHA保持，ultra-tools.json不存在，安装仍preview.83；未改个人数据库、真实凭据、逆向工具安装或PATH。E-294/E-364旧真实复杂任务失败文件SHA与passed=false保持，不覆盖、不重跑，本轮受控成功不能替代它们的事实质量验收。

沿用granted case work/gemini-ultra-agent-20261110、PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理。独立profile/workspace和假凭据，关闭服务/在途任务后核对mkdtemp父目录/前缀清理。更新目标池及case四项，源码/工程/Obsidian三份报告全文SHA一致；显式提交本轮文件、skip ci并推codex隔离分支，不合并master或Release。

继续收敛Agent真实任务交付、续接和可见性；复杂真实模型质量与最终平台包仍未完成。保持用户指定的源码→Windows必要验证→最后统一打包顺序，整体目标active。
