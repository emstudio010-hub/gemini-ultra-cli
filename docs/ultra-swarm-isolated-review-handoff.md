# Gemini Ultra CLI Swarm 隔离复核原文保留交接

日期：2026-11-13。WI-176 / E-405至406 / F-133。源码基线4e2f3384cda5ca2bb750ef5c0ec6c39514e4d1c6，分支codex/ultra-agent-portable，整体goal active。上一goal turn有真实源码/Windows验证/同步进展；本阶段继续源码优先、Windows必要定向验证，暂不打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 根因与修复

检查Swarm任务结束/续接的文件范围交接时，发现managed worktree在复核期间变化的异常路径仍会丢失新返回的复核正文。swarm.ts先将result/fullResult写入内存，再调用agentWorktreeTree核对审查前后树；树不同时抛错，catch重新readSwarm得到尚未保存新结果的旧成员状态，只记录错误。长正文虽已写入不可变文件，但当前fullResult引用丢失，导出/续接只能得到错误文字。

E-405在修前实际复现：真实Windows临时git库/产品prepareAgentWorktree、review_files=['seed.txt']，runner边界修改隔离文件再返回超过12000字符的passing JSON。readSwarmResultText实际只得到“Isolated files changed during independent review...”错误而非原文，1场景失败。它不是模型真实审查场景，也不表示模型能越权修改文件。

修复仅在completed且waiting的workflow-auditor进入复核判定时，先saveSwarm保存原始结果和归档引用，再执行verdict/文件系统事后检查。此时verifiedRevision/verifiedTree/reviewedFiles仍未赋值，持久化原文不授予批准；随后的异常恢复从磁盘读到本轮原始证据，再记录lastError/paused及一次failed turn。既有worktree拒绝、文件指纹、预算、显式唤醒和归档完整性规则保持，不自动重试，不新增完整工作区扫描。

修改涉及packages/core/src/agents/swarm.ts及agentWorktree.test.ts；没有改变公开命令、locale、provider、模型预算或个人配置。原文保持既有JSON格式，不把错误诊断混入verdict正文。

## 定向与Windows实际执行证据

E-405最终9个不同相关场景通过：新增长隔离复核原文/归档保留1个，上一阶段managed-worktree文件变化/恢复1个，以及5个无效verdict和2个合法通过/否决对照。未跑完整工作树套件、全量或冒烟。源码core/CLI严格tsc编译、两文件eslint --max-warnings 0、prettier --check及git diff --check退出0。此阶段没有检查失败后反复放宽门槛；修前失败日志及JUnit保持。

E-406通过Windows Node v24.19.0真实Config/gateway/ManageSwarmTool/注册auditor/AgentTool/LocalAgentExecutor/complete_task/SSE/Swarm、真实临时git managed worktree及产品归档/导出。独立profile/workspace、假凭据，模型协议只准loopback；第一条响应挂起时宿主修改隔离REPORT A→B，随后真实complete_task交付长passing JSON。Swarm正确paused，verified标记均空，累计1轮/1请求/1失败，lastError保持工作树变化原因；长正文、fullResult引用、不可变文件及导出内容精确保持。导出不修改members.json，公开finish拒绝。

显式manage_swarm post带name/review_files/@reviewer重新审查当前B，第二条loopback响应返回不同的合法verdict；成员取得当前reviewedFiles且目录是隔离worktree，公开finish完成并保存acceptedTree。第一轮长归档仍逐字保持，源checkout报告A/HEAD/index及隔离profile provider文件不变。未执行workspace apply，不把隔离结果写回源checkout。

17条件全部true，9392ms，2条本地模型协议HTTP，0外部/付费请求，验证器进程退出0。仅宿主改fixture，模型没有调用文件编辑或shell工具。真实Agent执行链与结构/保存/门禁得到证明；模型真正读取文件的智能、复杂逆向产物事实准确性、跨进程文件锁或最终包不是本次验收范围。

工程证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu
- swarm-isolated-review-before-test.log/-before-junit.xml：旧1失败，实际正文丢失。
- swarm-isolated-review-test.log/-junit.xml：修后9相关通过。
- swarm-isolated-review-core-compile.log、-cli-compile.log、-lint.log、-format.log、-format-check.log。
- verify-source-swarm-isolated-review.mjs、source-swarm-isolated-review.log/-result.json。
- check-swarm-isolated-review-evidence.mjs、swarm-isolated-review-evidence-summary.json。
- verify-swarm-isolated-review-preservation.mjs、source-swarm-isolated-review-preservation.json。

F-133 -> agents/swarm.ts：未持久化的当前verdict在worktree postflight抛错时被旧状态覆盖。先保存未批准证据，再作可能抛错的检查，修复当前正文/归档引用丢失路径。此改动不承诺磁盘写失败、进程在保存前退出或外部篡改时仍可保全；它也不增加旧短结果历史版本或文件系统事务。

## 保全、同步与接续

最终preservation passed=true：个人provider/locale/config/skill-tags.json精确SHA保持；ultra-tools.json仍不存在，全局1.0.0-preview.83。E-294/E-364旧真实失败文件SHA和passed=false保持，不覆盖不重跑，不把本地受控协议结果当作真实复杂模型质量已过。没有改个人数据库、凭据、工具安装或PATH。

沿用granted case work/gemini-ultra-agent-20261110、PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。服务和成员退出后核对专用mkdtemp父目录/前缀清理。目标池及workitems/timeline/field-journal/evidence更新，源码/工程/Obsidian报告全文SHA一致；显式stage本轮文件、提交skip ci并推codex隔离分支，不合并master、不Release。

继续完善协作任务结束与续接的可靠性，真实模型复杂任务质量和最终Windows/其他平台包仍未验收。保持源码收敛后再统一打包的顺序；整体目标active。
