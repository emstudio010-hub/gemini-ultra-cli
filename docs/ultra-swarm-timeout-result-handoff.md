# Gemini Ultra CLI Swarm 超时结果交接

日期：2026-11-12。WI-130 / E-315至316 /
F-090。持续目标active。源码优先，Windows必要定向验证，最后统一打包。全局安装仍preview.83，本轮没有打包、重装、版本变化或跨平台CI。

## 修复

F-090：成员运行器收到的是“外层取消+10分钟超时”的组合信号，结果接收却只检查外层信号。运行器在超时后仍返回completed=true时，会覆盖旧成果、使成员waiting、接受正面审核，且不计失败额度。3个新增旧复现全部失败。

现在保留实际传给运行器的同一组合信号，用于接收输出、成员状态及超时判定。超时后返回的输出标为未接受，旧成果保持，成员paused，正面审核不获得verifiedRevision。当前任务仍active且外层未取消的超时计一次失败，达到累计失败额度后blocked；用户取消仍不额外计失败。默认10分钟上限及起算位置保持，不新增自动重试。此处检查信号是否触发，不保证强制终止不响应信号的运行器。

## 必要证据

E-315：3个旧超时复现失败；修后3项加4个停止后结果保留相关对照共7项通过，6项不相关场景跳过。strict
core类型检查及源码编译、两个修改文件eslint退出0。没有全量/冒烟或旧付费任务重跑。

packages/core命令：`npx vitest run src/agents/swarmTurnTimeout.test.ts src/agents/swarmResultRecovery.test.ts --coverage.enabled=false --testNamePattern='after its deadline|returned after its deadline|timed-out member returns|preserves accepted evidence when a completed|labels an initial late completed'`。根目录`npx tsc -p packages/core/tsconfig.json`只编译源码，未运行package构建脚本。

E-316：Windows Node
v24.19.0，实际编译源码SwarmEngine，隔离验证器只把原600000ms超时请求映射为250ms的原生AbortSignal.timeout，未改产品时限；不是等待10分钟的耐久验证。真实Node子进程收到原生TimeoutError后自然退出0，受控运行器故意返回completed=true；旧成果保持、成员paused、一次失败使任务blocked。耗尽额度不能直接resume；显式提高额度并resume/mention后正常纠正结果接收，累计失败仍1。另一auditor原生计时到期后返回passed=true也保持paused、无verifiedRevision且不能finish。11条件通过，7335ms/退出0，4次成员超时参数均来自原600000ms请求。没有模型/供应商请求。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。swarm-timeout-result-before.log/-junit.xml、swarm-timeout-result.log/-junit.xml、swarm-timeout-result-source-compile.log、swarm-timeout-result-lint.log、verify-source-swarm-timeout-result.mjs、source-swarm-timeout-result-result.json、source-swarm-timeout-result.log。隔离辅助脚本不随包分发。

## 接续边界

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由当前会话承担。没有外部安全目标、个人数据库改动或原生逆向工具执行。个人locale/provider
SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 /
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

覆盖受控迟到返回和原生计时信号，不是完整终端UI、真实供应商语义质量、强杀或最终平台验收；不撤销成员已发生的工作区副作用。更多源码完整性、复杂长任务及最终Windows/macOS/Linux交付仍未完成，目标继续active。隔离codex分支同步带skip
ci，不合并master或正式Release。
