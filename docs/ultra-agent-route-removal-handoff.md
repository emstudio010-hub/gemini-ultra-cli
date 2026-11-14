# Gemini Ultra CLI 成员路由失效诊断交接

2026-11-15；WI-238 / E-531至532 / F-196；基线697356645b49372ce3a3f1b082a6f874cfdc7355，分支codex/ultra-agent-portable。持续goal active。源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包；preview.83保持，不打包/重装/升版/三平台CI/旧付费重跑。

## 持续目标池

1. 启动与加载：继续收敛真实阻塞、取消和退出问题，最终包再量稳定收益。
2. CLI与演练台：双语六档、模型配置与草稿保护、交互动效保持；按实际缺陷维护。
3. Agent协作：Teamwork/Boost/Grill me/Swarm模型路由、失败恢复、累计预算与独立验收；复杂任务质量仍未全面通过。
4. 原生红队与可移植逆向：保留本机工具路径配置与缺工具诊断；最终跨电脑和跨平台分发待功能收敛。

## Evidence → Finding → Path

F-196：成员指定模型在scope开始时有效，但供应商随后被删除，UniversalContentGenerator.resolve会再次normalizeAgentModel。后者原抛普通Error，导致getModelContextWindow可选容量读取也失败，生成/流/计数未使用既有ProviderRouteError本地诊断分类。生成原本已拒绝，没有观察到串路由或付费请求。

修复仅在agentModelRouting.ts为缺失供应商抛现有ProviderRouteError，不吞任意错误、不加自动恢复/模型重试。容量按既有处理返回undefined；generate/stream/countTokens继续严格本地拒绝。保存的角色/成员模型与全局选择不改，实际生成前失败不消耗请求额度；Swarm失败turn仍按原规则累计。

## E-531 必要源码检查

新增generate/stream/tokens/capacity四场景，在有效scope内删除供应商。原源码4项实际断言失败（3项普通Error分类、1项容量抛错），退出1。修后agentModelRouting完整相关文件23项通过（新4+旧19），退出0；覆盖并发、显式/原生路由与工作流/成员模型优先级。不是全量或冒烟。

core tsc --build、双TS eslint --max-warnings=0均退出0。之后Prettier仅格式化新测试，两文件check与git diff --check退出0，无行为改动不重复测试或编译。无CLI重编。

## E-532 Windows编译Swarm与路由恢复

verify-source-agent-route-removal.mjs使用独立home/profile、实际编译SwarmEngine/ProviderManager/UniversalContentGenerator/ExternalFallbackGenerator和原生loopback HTTP；runner可控，未调用LocalAgentExecutor/实际LLM。

首执行导入漏dist/src，在任何成员/模型请求前ERR_MODULE_NOT_FOUND退出1，source-agent-route-removal.log保留。查实际编译文件路径后纠正。

首次完整执行：成员scope内删除供应商，容量unknown；三入口ProviderRouteError，0HTTP/0请求预算；成员暂停且失败turn=1；同ID恢复供应商后仅显式@alpha唤醒，实际POST只到research模型；成员waiting/modelsUsed正确，requests=1、failedTurns=1、turns=2；父调用随后仅到primary，scope已释放，父请求未计入成员预算；无原生fallback、provider字节保持，整任务仍active未声称交付。

该次19条件中18项true，验证器错误要求首次失败member.result为空，实际既有recordMemberFailure在没有旧成功结果时把诊断放入result，所以该条false。原passed=false结果保留SHA256 b7a8d4ac61a7965d2096487572e78a3f4896ac6e2a5346706938b6e2d3568f18，7382ms、2本地HTTP。assert失败后还出现Node Windows UV_HANDLE_CLOSING断言，进程返回-1073740791；不将此异常退出记为产品通过，也未确定其底层原因。

保留initial脚本，仅增加--diagnostic-only分支补验失败路径：paused、三入口本地错误、result与lastError保留同诊断、failedAttempts归档error、0请求、失败turn保留，6条件true/6818ms/退出0/0HTTP；不重跑恢复与父请求场景。严格组合脚本校验原false唯一项和原SHA与补证6项，source-agent-route-removal-evidence.json passed=true。组合证据不是把原false改true。

## 证据、保全与接续

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：agent-route-removal-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-core-compile.log、-lint.log、-format-write.log/-format.log；verify-source-agent-route-removal[-initial].mjs、source-agent-route-removal.log/-windows.log/-result.json/-diagnostic.log/-diagnostic-result.json；verify-agent-route-removal-evidence.mjs及source-agent-route-removal-evidence.json；verify-agent-route-removal-preservation.mjs及source-agent-route-removal-preservation.json。

个人provider/locale/skill-tags SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装，旧未跟踪文件保持。沿用granted R26 code-audit case；lead/cae/doc同会话，无Codex子代理。三份交接同SHA，目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

接续优先检查协作任务在恢复/重新配置时的实际入口与诊断展示，再处理目标池中用户可见缺陷。模型路由本轮未发现新的成员/角色优先级错误；不为推进虚构补丁。原生终端/浏览器视觉、跨电脑工具运行、真实复杂协作质量及最终分发仍未全面验收，goal保持active。
