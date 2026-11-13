# Gemini Ultra CLI Swarm 文件复核一致性交接

日期：2026-11-13。WI-175 / E-403至404 / F-132。源码基线5290b588bfa0502ec1397e502e63657258021ed8，分支codex/ultra-agent-portable，整体goal active。继续源码优先、Windows必要定向验证，最终统一各平台包后置；无打包、全局重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 缺口与源码修复

前阶段复核正文/成员revision门禁不能发现普通共享工作区文件在复核期间或之后被宿主修改。只改REPORT.md、没有新成员轮次时，旧passed=true仍可能有效。本阶段仅检查明确列出的交付物与证据文件，不全盘扫描工作区。

新增agents/swarmReviewFiles.ts：review_files最多64个路径、每项trim非空且最多1024字符，总内容64MiB；只接受工作区内常规文件，拒绝重复/外部路径/文件符号链接及指向外部的目录链接。Windows重复比较忽略大小写。使用fd、64KiB块读取、SHA256/字节数，读取前后核对文件身份和变更元数据；不保存文件正文。

Swarm绑定realpath workspace，拒绝不同目录重绑；公开ManageSwarmTool每个非status操作绑定Config.getTargetDir。审查员添加时必须显式给review_files；开轮抓取文件指纹，通过复核时再次核对，finish第三次核对。managed worktree存在时在该隔离目录抓取，不错误读取源checkout。成员正文/revision/归档、任务预算及既有worktree树指纹规则保持。

文件在审查中变化：成员paused、原passing JSON正文保持、一次failed turn、不授予verifiedRevision、不自动重试。审查后变化/删除：finish拒绝且members.json字节保持；恢复精确已审内容后可以完成，无关文件变化不影响本清单门禁。文件指纹保存在reviewedFiles，模型可从状态看到声明范围。

现有已settled且未killed的审查员可由manage_swarm post携带name、review_files和显式@name更新范围并重审；更新清单立即失效旧通过标记，不自动执行。CLI协调提示及auditor上下文同步范围合同。显式[]仅供没有workspace文件交付物的member-report-only任务，不表示批准工作区文件；低层没有workspace参数的旧API保留兼容，真实公开工具都会绑定。

接续时额外发现旧unbound审查员绑定workspace后，直接@唤醒仍以reviewFiles ?? []运行。定向场景在修前确实失败（calls=2，预期1）。现wake在分配轮次前暂停并明确要求review_files，清除旧标记、原正文保留，任务预算/模型调用不增加；显式补清单并@唤醒后可继续。turn再次schema.parse避免把缺值当空清单，合法显式[]保持。

## Windows证据与检查

E-403：聚合23个不同相关场景通过。包含11个文件范围/旧任务用例、前阶段9个verdict对照、1个既有预取消wait、1个CLI协调提示和1个实际git managed-worktree场景。既有测试仅补最小getTargetDir fixture；最后wake补强只重验3个受影响场景，未重跑整套。

managed-worktree定向场景使用Windows真实临时git库/产品prepareAgentWorktree：保存隔离文件指纹，修改隔离文件finish拒绝，恢复精确版本完成，源checkout全程base保持；3163ms，仅runner受控，无模型请求。

最终core与CLI严格源码编译退出0，九文件eslint --max-warnings 0、prettier --check及源码git diff --check退出0。首const lint问题已修；worktree格式命令曾因cwd重复路径只报找不到文件，已从repo根纠正。原记录保留，不扩展全量或冒烟。

E-404：Windows Node v24.19.0真实Config/gateway/ManageSwarmTool/注册workflow-auditor/AgentTool/LocalAgentExecutor/complete_task/SSE/Swarm与文件hash。两条loopback协议响应，0外部/付费请求；第一响应挂起期间宿主将报告A改B，真实complete_task返回通过却被Swarm暂停，原verdict保持、一次失败。显式post重审B并保存2个文件SHA；B改C后公开finish拒绝且状态字节保持，恢复B并加入无关文件后完成，导出verdict保持。

验证器首运行16项行为均true但finally重复释放响应触发ERR_HTTP_HEADERS_SENT，进程退出1，first日志/结果保留，不能算完整成功。验证器send增加重复释放保护后退出0。wake补强前成功另存before-legacy；最终编译源码再验16条件通过，7926ms，2本地请求，进程退出0。该结果不证明模型真正阅读了文件，managed-worktree另由上述定向检查覆盖，不混称同一原生场景。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu
- swarm-review-files-final-test.log/-final-junit.xml、-cli-test.log/-cli-junit.xml、-worktree-test.log/-worktree-junit.xml。
- swarm-review-files-legacy-before-test.log/-legacy-before-junit.xml（1旧失败），-legacy-test.log/-legacy-junit.xml（3相关通过）。
- swarm-review-files-legacy-core-compile.log、-release-cli-compile.log、-legacy-lint.log、-legacy-format-check.log；前序compile/lint/format记录同前缀保留。
- verify-source-swarm-review-files.mjs，source-swarm-review-files-first.log/-first-result.json、-before-legacy.log/-before-legacy-result.json、.log/-result.json。
- check-swarm-review-files-evidence.mjs、swarm-review-files-evidence-summary.json；verify-swarm-review-files-preservation.mjs、source-swarm-review-files-preservation.json。

F-132 -> agents/swarm.ts / swarmTools.ts：共享工作区交付物改动没有更新成员revision，旧批准仍可能完成；明确清单指纹及旧任务缺范围暂停修复此路径。文件指纹不是文件系统锁、OS隔离、掉电事务或跨进程原子快照，检查后外部进程仍可能改文件；也不验证证据事实、文件清单完备性或模型的审查质量。只核对声明范围，不推断[]任务批准了未列出的文件。

## 保全与下一步

保全passed=true：个人provider/locale/config/skill-tags.json精确SHA保持，ultra-tools.json仍不存在，全局1.0.0-preview.83；没有改个人数据库、真实凭据、工具安装或PATH。E-294及E-364两份旧真实失败文件SHA和passed=false保持，不覆盖、不重跑，当前门禁不能冒称复杂逆向准确性或输出截断质量已过。

沿用granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。只用独立profile/workspace与假凭据；关闭成员/服务后核对mkdtemp父目录及专用前缀清理。维护目标池与workitems/timeline/field-journal/evidence，源码/工程/Obsidian三份全文SHA一致；显式提交本轮文件并推隔离codex分支，skip ci，不合并master、不Release。

后续继续收敛真实协作任务可靠性，审查任务结束/续接时明确范围如何交接；复杂真实模型任务质量、跨机器与最终各平台包验收仍未完成。保持源码完善、Windows必要验证优先，整体目标active。
