# Gemini Ultra CLI Swarm多轮历史成果保全交接

日期：2026-11-13。WI-190 / E-433至434 / F-147。源码基线70f9ebffa9898495187c42904cf791939ebd9a8d，分支codex/ultra-agent-portable。上一阶段为源码/Windows验证及提交进展，整体goal active。继续源码→Windows必要定向验证→最终统一打包；无打包、重装、升版本、多平台CI或旧付费任务重跑，preview.83保持。

## 根因与实现

Swarm成员后续返回新结果时直接替换member.result/fullResult/modelsUsed，旧公开留言只有4000字符。旧短结果超过4000的中尾部可丢失，旧长结果文件虽在却没有持久可发现引用；完整reports只导出最新结果。旧源码两个short/long三轮复现均预期3份实际1份失败。

新增swarmResultHistory.ts及member可选pastResults：替换primary result之前校验原结果，并为短文强制创建已有SHA命名正文档案；长文复用/校验原档案。历史引用保存beforeTurn（被哪次后续回合替换，不冒称原生成轮号）及原字节/SHA/字符信息，每成员最多1000引用；新结果不落盘前不清旧结果。既有失败/迟到结果保留逻辑不变，历史保存的是曾被primary result持有的原文，不等同于已独立验收。包括旧无效review或初次未完成primary文本也只是历史证据，非新授权。

swarmContextSnapshot/memberContext仅提供previousResults的count/indexPath/SHA/historicalOnly，一个不可变索引列出历史档案路径，不直接展开所有历史正文或原引用数组。索引写入wx、已存在校验类型/字节/正文，外部改动不覆盖。上下文明确历史不代表当前结论/权限；raw status/UI保存状态仍保留真实结构，演练台详情不增加历史正文读取。

exportSwarmReports先保持所有当前成员报告原位置，再按成员和保存顺序追加完整历史正文，标签含historical/not a current verdict。逐份既有8MiB字节/SHA校验，损坏拒绝完整导出；不会用历史通过替代最新failed验收或恢复verifiedRevision。当前finish门禁仍只看当前verifier、revision与当前文件指纹。

历史是有限保存、增加磁盘和元数据成本，非所有未完成尝试全文记录/旧已丢文本恢复，也没有完整保存每份旧结果的原模型路由元数据。state与档案非多文件磁盘事务，极端I/O/崩溃/1000引用上限未压力验收；清单超限会明确拒绝，不静默截断。

## E-433 源码定向

旧两个short/long三成功回合场景均导出仅1而非3。修后两项通过，与swarmResultRecovery10、swarmFullResults、swarmContext、agentReports合计30不同相关场景通过。随后新增history changed/missing拒绝完整导出且当前正文/state保持、旧passing不能替代当前failed三项，并补模型snapshot索引/轮号/正文精确断言；本文件最终5项通过，总33不同相关检查，不重复计数。未跑全量/冒烟。

core/CLI严格tsc、6修改/新增文件eslint --max-warnings 0、prettier --check、git diff --check最终退出0。首扩展测试patch因prettier后上下文变化未匹配、未改文件，重读后精确应用；首lint测试const双声明修正为两行，不改产品逻辑。无模型服务重试或放宽验收。

## E-434 Windows真实公开Swarm链

Node v24.19.0，独立profile/workspace、假provider、loopback-only。真实Config/gateway/公开ManageSwarmTool/注册researcher与workflow-auditor/AgentTool/LocalAgentExecutor/complete_task/SSE。

显式reader三轮：第一份约7k字符（早期内容超board4000但原短文无需长档案）、第二份长Unicode、第三份短current；verifier两轮先passing后failed，全部由公开add/post/wait调度。旧报告字节精确保全，beforeTurn=2/3，第三轮实际Agent请求含历史指针。模型snapshot仅count/indexPath，完整导出2当前+3历史共5，标签明确旧结论性质；全新Windows进程同样导出5且snapshotSHA相同。

当前verifier失败后公开finish拒绝、verifiedRevision为空、phase active；历史passing仍可查但不批准。宿主修改旧reader档案后完整导出拒绝且不覆盖，当前details仍可读，task state原字节保持；预算5请求/5轮/1failed，研究与复核3/2精确。provider字节、空workspace保持。15条件true、7841ms/退出0、5loopback、0外部/付费，最终显式cancel该fixture并清理临时根成功。

这是实际执行器和保存/导出链证据，不是模型真实推理或独立阅读质量、复杂逆向成果、ConPTY或最终包验收。

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- swarm-prior-results-before-test.log/-before-junit.xml（2旧失败）、-test.log/-junit.xml（30相关）、-final-test.log/-final-junit.xml（本文件5）。
- swarm-prior-results-core-compile.log / -cli-compile.log / -lint.log / -format.log / -test-format.log / -format-check.log。
- verify-source-swarm-prior-results.mjs、source-swarm-prior-results.log/-result.json；verify-swarm-prior-results-preservation.mjs、source-swarm-prior-results-preservation.json。

F-147 -> swarm.ts新primary结果替换导致旧结果不可发现/导出，board短预览非原文。保留旧正文档案及可校验引用、索引和完整导出修复该路径，当前验收与历史证据分开。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持、ultra-tools.json不存在、全局preview.83；旧E-294/E-364真实复杂任务SHA及passed=false保持，无覆盖/付费重跑。不改个人数据库、凭据、工具安装或PATH。旧被拒清理的ultra-cockpit-review-scope-S0wWvh不重试删除。

沿用granted case / PRIMARY R26 code-audit，同会话lead/cae/doc，无Codex子代理或外部扫描。目标池/case四项更新，三份全文SHA一致，显式stage本轮源码/报告，skip ci提交推codex隔离分支，不合并master/Release。继续Agent实际交付与Windows源码收敛，复杂真实任务质量/更多模型及最终Windows/macOS/Linux统一包仍待，整体goal active。
