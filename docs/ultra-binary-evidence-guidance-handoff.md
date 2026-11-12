# Gemini Ultra CLI 逆向证据推断指引交接

日期：2026-11-13。WI-145 / E-344。持续目标active。源码优先、Windows必要定向核对、功能收敛后最终统一打包。全局安装仍preview.83；本轮没有打包、重装、版本变化、跨平台CI或付费任务重跑。

## 已有失败与改动依据

复查E-294保留工件及宿主独立复核：真实任务仍blocked/退出1。其报告引用7个原文摘录仍无法支撑全部推断；CALL地址把实际0x401089/0x401044写成0x401091/0x401064，还把入口ret前未读取eax当作返回值被丢弃，并对edi写入后的rdi高位保留错误不确定性。这不是新增工具输出故障。精确地址对照已有WI-120源码与三平台证据，本轮不重复实现或运行分析器，也不修改失败报告伪装修复。

在ultraSpecialists中给researcher、reviewer、redteam-analyst及workflow-auditor的实际系统提示直接追加简短证据规则：复制精确地址/先引用opcode再分列推断、区分CALL位点与函数入口、反编译void原型和compiler选择不能当原始接口/构建来源、按目标架构/ABI核对寄存器宽度及返回值。明确x86-64的eax/edi写入会零扩展，ret无需显式读eax即可把值留给调用者；有限窗口不能证明无调用者或丢弃返回。coder/writer工具权限及任务状态机未改。

内置local-reverse指南新增Interprocedural evidence章节，补充逐条artifact/address/原文摘录→独立推断→未决限制的交接结构、窗口覆盖不能由计数巧合证明、静态计算值不是已观测输出/退出码。并同步WI-144已实现的直接/批量/Swarm红队授权前提说明。没有将样本的169答案或正确报告直接注入角色，规则对架构证据和一般调用链适用。

## E-344 源码核对

根目录`npx tsc -p packages/core/tsconfig.json`及`npx eslint packages/core/src/agents/ultraSpecialists.ts`退出0，相关Markdown/TS格式与git diff --check通过。此为提示及技能资产修改，不新增镜像实现的单测或跑全量/冒烟。

确认编译退出0后，Windows Node v24.19.0、隔离home/workspace执行实际Config.initialize及AgentRegistry prompt getter，四个只读角色各收到一次新指引且仍无shell工具。实际源码SkillLoader解析源builtin目录，以公开SkillManager.addSkills显式注入该源码资产并标记builtin，再由实际ActivateSkillTool确认/激活；完整skill.body进入llmContent，技能SHA256为6273910a2d9db8497c8e0b0791006eebe8d66ce283e589cd291e3392d175a342。此步骤是源码资产加载验证，未复制dist资产或声称安装包自动发现已更新。

离线读取E-294现有15份输入全部SHA匹配，保留原引用/真实指令和错误CALL对照、任务仍failed/blocked且result字节未变。没有重新调用Ghidra/r2、运行样本、模型请求或外部HTTP。10条件通过，5891ms/退出0。初始化缺省.geminiignore和debug日志保留。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。binary-evidence-guidance-format.log、binary-evidence-guidance-source-compile.log、binary-evidence-guidance-lint.log、verify-source-binary-evidence-guidance.mjs、source-binary-evidence-guidance.log、source-binary-evidence-guidance-result.json。既有preview82-live-multifunction-swarm-result.json、workspace/evidence及independent-review.json只读复用，原付费任务请求数仍21。验证器不随产品分发。

## 边界与接续

本轮证明指引在实际角色提示和源码技能加载链中送达，不能证明模型理解/稳定遵循、真实复杂逆向任务已成功、任意ABI正确或全部报告推断可靠。E-294失败仍未重新通过，不将提示检查当作质量验收。后续围绕具体证据缺口继续源码收敛，再在必要的新真实任务中验证行为；不原样重跑旧付费任务。

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，本会话承担lead/cae/doc。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在；不改个人数据库、工具安装或PATH。隔离codex分支同步带skip ci，不合并master或正式Release。长会话语义、更多供应商质量、复杂逆向和最终Windows/macOS/Linux交付仍待收敛，goal保持active。
