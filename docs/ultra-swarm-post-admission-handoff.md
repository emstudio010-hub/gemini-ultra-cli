# Gemini Ultra CLI Swarm留言与状态一致性交接

日期：2026-11-13。WI-186 / E-425至426 / F-143。源码基线4dcdc91915f49da4c0331dc67efc9aa70e0b87bd，分支codex/ultra-agent-portable。上一阶段为源码/Windows验证及提交推进，整体goal active。继续源码→Windows必要定向验证→最终统一打包；无打包、重装、升版本、多平台CI或付费任务重跑，全局preview.83保持。

## 根因与源码

SwarmEngine.add/remove/finish原先先保存members状态、再appendPost；board已满、4MiB容量不足、JSON损坏或锁冲突时，命令抛错但新成员已添加、旧成员已killed或任务已completed。ManageSwarmTool的post带review_files还先setReviewFiles，失败留言会改掉复核范围及旧快照。

新增内部同步withPreparedPost：先获取既有board锁，读取/验证board和待追加留言、500项与4MiB容量通过，再执行有限同步状态变更并追加留言，finally释放锁。add只有提交成功后才wake，remove成功后才abort本机成员；finish的worktree批准和completed状态也在留言准入之后。普通appendPost沿用同一助手。

post可携带明确协调者@mention的复核范围变更，ManageSwarmTool把改范围与留言交给同一入口；在锁/容量/格式拒绝之前不会先改reviewFiles或清除旧审批快照。普通成员发帖、原有显式setReviewFiles、范围校验和本地取消行为保持；没有更改budget、自动重试、board上限或删历史。

这是可预检错误与board锁范围的一致性修复，**不是多文件磁盘事务**。准入通过后若磁盘写入/append突然失败，仍不保证members/owner/worktree/board原子回滚；未做故障注入或跨进程压力验证。owner恢复/历史resume的其他状态转换不在本轮改动范围。

## E-425 定向源码证据

新增swarmPostAdmission.test.ts。旧源码12个场景实际均因保存文件被改写而失败：add/remove/finish各full/overflow/damaged/locked；最后可用槽位finish正常对照通过。不是缺接口或夹具初始化失败。修后新增review-post四场景，共17项通过；与既有swarm.test.ts共36不同场景通过，再补swarmReviewFiles.test.ts的11项，合计47不同相关检查通过。覆盖正常writer序列、finish独立复核、取消/恢复、公开工具复核清单变更等相关对照，未跑全量/冒烟。

core/CLI严格tsc退出0，三个修改/新增文件eslint --max-warnings 0、prettier --check及git diff --check退出0。首次默认开启coverage的复现进程一直无测试结果输出，经确认进程仍在后停止；保留initial-runner日志。测试比较改为逐文件Buffer.equals避免大Buffer差异格式化，关闭全源码coverage后旧12失败及修后结果均快速退出；不把首次无输出当作产品通过。第一次格式命令误从core目录传仓库相对路径，未改产品，最终从repo根格式化及检查通过。

## E-426 Windows编译源码公开工具

Node v24.19.0，真实编译ManageSwarmTool.build/execute→getSwarmEngine→SwarmEngine→members/owner/board文件。每场景独立任务根，minimal会话config、保存的两个成员与结构化verdict夹具；提前绑定workspace，finish用明确[]成员报告范围，未冒称实际模型复核。

四类操作各四种board错误共16次拒绝：全任务文件名集合和SHA保持、phase仍active、无运行成员；包括公开post重新分配范围，旧verdict与范围未被错误清除。第17次独立任务board499条时公开finish正常completed、追加第500条并保留全部旧board前缀。4汇总条件true、18358ms、退出0，modelCalls=0、fetchCalls=0，专用临时根finally清理成功。无需为本地状态拒绝缺陷引入模型请求；不是供应商推理/真实独立审查、ConPTY或最终包验收。

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- swarm-post-admission-initial-runner.log、-before-test.log/-before-junit.xml（旧12失败/1正常）、-test.log/-junit.xml（17项）、-related-test.log/-related-junit.xml（36）、-review-test.log/-review-junit.xml（11）。
- swarm-post-admission-core-compile.log / -cli-compile.log / -lint.log / -format.log / -format-check.log。
- verify-source-swarm-post-admission.mjs、source-swarm-post-admission.log/-result.json；verify-swarm-post-admission-preservation.mjs、source-swarm-post-admission-preservation.json。

F-143 -> swarm.ts add/remove/finish与swarmTools.ts post(review_files)：状态先于可拒绝留言保存。board锁内先准入后同步变更修复四条明确路径；原始证据不丢、失败不自动推进或发起模型轮次。

## 保全与接续

preservation passed=true：个人provider/locale/config/skill-tags精确SHA保持，ultra-tools.json不存在，安装preview.83。E-294/E-364旧真实复杂任务SHA及passed=false保持，不覆盖、不付费重跑；其复杂交付质量仍待验收。不改个人数据库、凭据、工具安装或PATH。

上一阶段因SQLite占用及后续自动审批拒绝而暂留的ultra-cockpit-review-scope-S0wWvh不重试删除、不绕过审批；本轮只清理自身专用新夹具，无同类占用。沿用granted case / PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理或外部扫描。

更新源码目标池、case workitems/timeline/field-journal/evidence，源码/工程/Obsidian三份全文SHA一致。显式stage本轮源码与报告、skip ci提交推codex隔离分支，不合并master或Release。后续继续实际Agent交付/失败恢复及Windows源码收敛，复杂真实任务质量、更多模型和最终Windows/macOS/Linux包仍待；整体goal active。
