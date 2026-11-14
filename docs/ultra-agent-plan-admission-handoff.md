# Gemini Ultra CLI 排队协作成员模式复核交接

2026-11-15；WI-240 / E-535至536 / F-198；基线cf0192511cc2c0321ed8ef5d91c5f30a3f6099f0，分支codex/ultra-agent-portable。上一goal turn为progress（CLI蜂群留言Plan门禁已推送）。goal active；源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包；preview.83保持，无打包/重装/升版/三平台CI/旧付费重跑。

## Evidence → Finding → Path

F-198：ManageSwarmTool/RunAgentWorkflowTool只在操作开始检查Plan。原生协作成员可先排队等writer/worktree或会话并发名额，用户随后切Plan；AgentTool获得名额后只检查取消与红队grant，仍会构造并执行成员。CLI message门禁无法覆盖已接纳且尚未启动的任务。默认Plan策略允许codebase_investigator/cli_help，所以不能简单禁止全部子代理。

扩展既有assertAgentAuthorization(agent, approvalMode?)，在当前PLAN且角色属于既有swarmRoleSchema（researcher/coder/workflow-auditor/redteam-analyst）时抛准确双语未启动诊断。AgentTool本地成员的确认、execute入口及获得并发名额后的execute闭包均传当前Config.getApprovalMode，不捕获旧模式。缺省mode的既有engine红队grant校验保持。未扩展到用户自定义/远程代理，仍沿原策略入口；Plan帮助/调查角色不受本门禁影响。

拒绝发生在onStart和子invocation构造/execute之前，会话调度器finally照常释放名额。不自动切模式或重新排队，退出Plan后的显式重试沿原调度器正常执行。取消原因先于授权判断。未新增模型/网络重试，不重置预算。

## E-535 必要源码检查

新增agentPlanAdmission6项：legacy/session各一条真实排队后切Plan→无child/onStart→显式DEFAULT重试可执行；一条覆盖三非红队原生角色的确认/执行拒绝；codebase_investigator、cli_help、custom-reader各一个原路径控制。child invocation构造为Vitest mock，队列是实际scheduleSubagent。

原源码6项中3行为失败/3正常控制通过，退出1。修后新6+既有红队授权5+AgentTool9共20不同相关检查通过，退出0。core tsc --build与三TS eslint --max-warnings=0首次退出0。随后只格式化新测试，三文件Prettier check及git diff --check退出0，纯格式不重复测试/编译；无CLI重编、全量或冒烟。

## E-536 Windows编译入口

verify-source-agent-plan-admission.mjs独立home/profile、实际Config.initialize/registry/AgentTool/scheduleSubagent。legacy/session child execute与confirm仅受控收件adapter，execute在临时workspace写marker；不调用LocalAgentExecutor或LLM，不冒称真实复杂协作质量。

并发single下由命名barrier占用名额，正常模式接纳coder排队；切PLAN并释放占用后，英文legacy/中文session两条均准确本地拒绝，onStart/child adapter未触达、marker未改、模式与任务请求预算原字节保持。各自切DEFAULT明确重试后，正常分别到legacy/session，证明拒绝后slot释放。授予仅临时profile的drill grant后，四原生角色在Plan确认与执行都拒绝且无confirm adapter；两个Plan帮助角色仍可沿原路径执行；已取消signal保持同一个AbortError对象。

14条件全true/7651ms/首次脚本退出0，4次受控child收件（两次显式重试、两次帮助控制），0fetch/HTTP/模型/外部/付费/旧任务重跑。finally release自有barrier、恢复两个child原型及session方法、dispose自有Config、恢复fetch/DrillStore，经realpath父目录与前缀核验仅清自建temp根。

## 证据、保全与接续

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：agent-plan-admission-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-core-compile.log、-lint.log、-format-write.log/-format.log；verify-source-agent-plan-admission.mjs与source-agent-plan-admission.log/-result.json；verify-agent-plan-admission-preservation.mjs与source-agent-plan-admission-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装或旧未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。三份交接同SHA、目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

边界：仅原生协作角色启动前复核当前Plan；不取消已运行的成员，不重新评估整套自定义策略，不保护自定义runner绕过AgentTool的外部实现。工作流/Swarm外层可能已计入失败turn，失败/部分结果按既有规则保留，没有发出模型请求；这不是整套动态模式切换或实际终端验收。接续检查失败诊断如何引导用户显式恢复，同时继续原目标池启动/加载、双语配置/演练台、真实协作质量及可移植逆向能力；最终跨电脑与多平台包仍待，goal active。
