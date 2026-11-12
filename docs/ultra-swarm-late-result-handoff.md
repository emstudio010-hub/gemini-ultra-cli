# Gemini Ultra CLI Swarm 停止后迟到结果交接

日期：2026-11-12。WI-129 / E-313至314 /
F-089。持续目标active。源码优先，Windows定向验证，功能收敛后统一打包。全局安装仍preview.83，本轮没有打包、重装、改版本或跨平台CI。

## 修复

F-089：原处理器只在result.completed=false时保留既有成果。运行器收到取消后可能迟到返回completed=true，此时成员状态虽然被标paused或killed，既有成果正文/fullResult/modelsUsed却被迟到输出覆盖；首次迟到结果也没有未接受说明。取消、移除、仅中断及首次输出4个旧复现均失败。

现在在接收输出时检查当前轮信号、蜂群phase和成员killed状态。停止后的返回不论completed值都作为未接受输出：保留原成果及模型记录，增加停止诊断；长输出按已有机制单独归档，留言和模型快照可见诊断与归档路径。没有原成果时也显式标注“late
output was not
accepted”，不把迟到完成当作成功。paused/killed、失败额度及明确恢复机制保持；显式恢复并得到新的正常结果后才替换成果、清除诊断。取消后实际文件修改不会自动回滚，保存的结果证据不能代替工作区状态复核。

## 验证证据

E-313：4个旧复现失败；修后4项及已有短/长未完成输出保留2个直接相关对照共6项通过，4项未相关场景跳过。strict
core类型检查及源码编译、两个修改文件eslint退出0。没有全量/冒烟或原有付费任务重跑。

packages/core命令：`npx vitest run src/agents/swarmResultRecovery.test.ts --coverage.enabled=false --testNamePattern='preserves accepted evidence when a completed|labels an initial late completed|preserves an accepted report when a later incomplete'`。根目录`npx tsc -p packages/core/tsconfig.json`只编译源码，没有运行package构建脚本。

E-314：Windows Node
v24.19.0，实际编译源码SwarmEngine及一个真实协作退出的Node子进程。首轮接受长成果；后续成员收到取消并让子进程自然退出0，适配器故意仍返回completed=true和不同长输出。7183ms/退出0，14个条件通过：cancelled/paused且running清空、原成果全文/归档SHA引用和字节保持、原模拟模型记录保持、迟到全文单独归档、公开留言及模型快照含诊断、导出仍是旧成果、累计唤醒2/失败0。显式resume及mention后第三轮正常结果被接收且诊断清除，累计唤醒3/失败0，旧归档仍保持。

运行器与模型观察标签是受控夹具，子进程只响应取消/退出，不访问模型服务，不是供应商真实迟到语义验证。验证覆盖核心成果接收、归档、快照、导出与明确恢复，不冒称完整终端UI或跨平台验收。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。swarm-late-result-before.log/-junit.xml、swarm-late-result.log/-junit.xml、swarm-late-result-source-compile.log、swarm-late-result-lint.log、verify-source-swarm-late-result.mjs、source-swarm-late-result-result.json、source-swarm-late-result.log。辅助脚本不随包分发。

## 接续边界

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由当前会话承担。没有外部安全目标、付费请求、个人数据库改动或原生逆向工具执行。locale/provider
SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 /
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

本轮保持原8MiB归档上限及诊断长度限制，不新增无限历史存储，不保证停止后的外部副作用撤销。更复杂长任务/真实模型质量、源码完整性和最终Windows/macOS/Linux交付仍未验收，持续目标不标完成。隔离codex分支同步带skip
ci，不合并master或正式Release。
