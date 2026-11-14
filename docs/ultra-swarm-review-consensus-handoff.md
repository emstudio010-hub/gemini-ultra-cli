# Gemini Ultra CLI 多审核员完成一致性交接

日期2026-11-15，WI-223 / E-501至502 / F-181。基线d4399f7c30e8f853ff650504a7d7029df597308f，分支codex/ultra-agent-portable。上一goal turn为progress（继承模型与压缩路由已推送）。goal active，源码优先→Windows必要定向验证→功能收敛后最后打包；不打包/重装/升版本/多平台CI/旧付费重跑，全局preview.83保持。

## Evidence → Finding → Path

读取E-466实际否决与既有完成门禁：原单审核员确实正确拒绝了引用错误，本轮不将该真实失败改成成功。独立发现F-181：SwarmEngine.finish用find挑第一位当前通过的审核员，未要求其他未移除审核员也有效。因此第一位通过可以掩盖第二位合法否决、第二位负责文件后来变化或其保存正文已无效，任务仍完成。

swarm.ts现在收集所有非killed workflow-auditor，必须至少一位，且每一位都有当前revision、同一verifiedTree标识、重新解析有效且passed=true的原始verdict，以及自己声明的全部reviewedFiles仍与快照相同。只要任一不满足，完成入口拒绝，保持当前任务/公开板/预算。通过后仍用既有acceptReviewedAgentWorktree接受已复核的不可变树，不新增Git snapshot调用。工作中/排队/paused成员的前置门禁保持。

显式remove仍按既有能力将角色标killed，保留原否决和预算记录；不自动移除、自动重审或自动加预算。本轮没有新人工确认步骤、配置字段或状态迁移。swarmTools模型反馈同步说明所有active auditors都需通过，某一通过不能覆盖另一否决或过期复核。只改两个生产文件和新增定向回归。

## E-501 源码回归与静态检查

新增suite首4场景：第二位否决、第二位文件变化、第二位保存正文空白但旧approval仍在，原版均实际未拒绝（3失败）；全通过对照原本通过（1通过），退出1，无夹具/未处理异常。

修后新5+既有声明文件11+verdict9，25项通过；再将旧第二位approval检查扩展为invalid verdict/different worktree两个分支，受改2项通过/4未选，原分支重验不累加。最终26不同相关（新6+既有20），其中显式修正保留旧失败计数、已移除审核员结果仍保存、其他未声明文件不干扰、legacy显式file scope、单审核员行为均有对应选择。different worktree分支是保存标记不一致的单位场景，不冒称真实多审核员Git工作树验收。

core tsc --build退出0；3个变更TS最终eslint --max-warnings0、Prettier及git diff --check退出0。新增测试扩展仅改夹具，不重复编译无改动生产；CLI生产无改动不重编。无全量/冒烟/新依赖。

## E-502 Windows实际原生成员链

verify-source-swarm-review-consensus.mjs独立home/profile，实际编译Config/gateway/ManageSwarmTool/内置workflow-auditor/AgentTool/LocalAgentExecutor/GeminiChat/read_file/complete_task/SSE/Swarm；fetch仅允许自有loopback。没有替换业务方法，判决为脚本响应，不冒充模型理解。

- 两个真实具名审核员first/second各自调用read_file读取first.md/second.md；本机端点观察实际tool receipt后，first返回passed=true、second返回passed=false。4协议请求/2成员轮次/1失败，任务仍active。
- finish通过真实ManageSwarmTool拒绝，错误明确every active auditor，members.json和board.jsonl字节保持，0新增请求/轮次。
- 只在自有fixture把second.md改为SECOND_GOOD，并显式post一次@second纠正；第二位实际重新read_file读出新标记后通过。旧否决逐字节存入pastResults不可变归档，未被清除，当前两位通过标记都匹配revision。
- 只改second负责文件为审核后不同内容，finish再次拒绝，状态字节保持且不新增请求，即使first文件与审批仍正常。恢复精确已审核字节后，两位当前通过允许完成。

12条件全true，首次执行退出0，9918ms，总6 loopback模型协议请求（3实际read_file+3结构化verdict响应），3成员轮次/1失败累计保留，first文件与provider文件原字节保持，0外部/付费/旧失败任务重放。finally取消自有controller/成员、等待收尾、dispose配置/恢复fetch/关闭server及DrillStore，realpath核实后只清真实temp下自有ultra-swarm-review-consensus前缀目录。

## 证据、保全与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：swarm-review-consensus-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-final-tests.log/-final-junit.xml；-core-compile.log；-lint.log/-final-lint.log及格式日志；verify-source-swarm-review-consensus.mjs、source-swarm-review-consensus.log/-result.json；verify-swarm-review-consensus-preservation.mjs、source-swarm-review-consensus-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466旧失败SHA及false、旧临时凭据已删除均保全true；个人数据库/PATH/工具安装和旧被拒清理目录不动。granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。目标池/case同步，Obsidian/源码/工程三份交接全文同SHA，显式stage/skip ci推隔离分支，不合并master/Release。

本轮证明多审核员结果不能被挑选性忽略，不能自动证明通过判决本身事实正确、确实理解每项用户约束，或防止协调者主动缩减角色。旧真实复杂Swarm F-164质量仍未通过；未新增真实供应商、原生终端、完整多审核员Git工作树或最终跨平台验收，整体goal active。

## 接续目标（已授权继续）

1. 继续深入结构化交付字段与正文/源证据的语义一致性，完善任务契约与独立审核交接。
2. 继续收敛可复现源码缺陷，保持必要Windows定向验证；旧付费失败任务不原样重跑。
3. 维护目标池并导出Obsidian交接；功能收敛后再做最终Windows及macOS/Linux分发。
