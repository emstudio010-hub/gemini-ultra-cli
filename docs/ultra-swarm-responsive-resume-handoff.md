# Gemini Ultra CLI Swarm 恢复命令响应交接

日期：2026-11-12。WI-131 / E-317至318 /
F-091。持续目标active。保持源码优先、Windows必要定向验证、功能收敛后统一打包。全局安装仍preview.83，本轮没有打包、重装、版本变化或跨平台CI。

## 修复

F-091：resumeSwarm原先进入时先await现有engine.wait，成员仍在执行或清理时，CLI恢复命令会一直等待，长任务下表现为没有返回。它原本不会提前恢复；本轮修复的是本地命令的阻塞响应，不是此前声称已存在的状态穿越。

现在本机引擎仍有运行成员时，立即以当前中文/英文提示“仍在执行或清理，尚未恢复”，带对应任务ID的/swarm
status命令，要求收尾后显式恢复。不改任务/预算/留言/指针、不停止已有工作、不增加模型调用。引擎空闲后保持原恢复流程，历史选择、所有权、累计预算和完成任务的本地返回规则保持；协调者有意等待成员仍使用manage_swarm
wait。

## 必要证据

E-317：成员执行中、已取消但清理未完成2个旧复现均无法及时返回；测试用受控释放收尾，不等待默认长超时。修后这2项及历史任务重绑定、累计失败预算恢复2个直接相关对照，共4项通过，11项未相关场景跳过。strict
core类型检查及源码编译、两个修改文件eslint退出0，没有全量/冒烟。

packages/core命令：`npx vitest run src/agents/swarm.test.ts --coverage.enabled=false --testNamePattern='refuses resume promptly while members|rebinds an explicitly resumed historical swarm|blocks after two failed turns'`。根目录`npx tsc -p packages/core/tsconfig.json`只编译源码，未运行package构建脚本。

E-318：Windows Node v24.19.0，最新编译core及未修改的已编译CLI slash
handler，最小UI/config适配器和两个真实Node子进程。英文执行中场景7ms、中文取消清理场景2ms返回本地错误，两组各7条件通过，整体8886ms/退出0。状态目录全部文件字节保持、原运行/取消信号保持、不带ID状态仍可查；释放子进程自然退出0后，显式resume正常返回原ID协调提示，不自动重新启动成员，累计唤醒1/失败0保持。没有任何供应商请求。2秒为验证器有界观察阈值，不是产品跨机性能保证；两次响应数字不是启动或完整终端UI基准。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。swarm-responsive-resume-before.log/-junit.xml、swarm-responsive-resume.log/-junit.xml、swarm-responsive-resume-source-compile.log、swarm-responsive-resume-lint.log、verify-source-swarm-responsive-resume.mjs、source-swarm-responsive-resume-result.json、source-swarm-responsive-resume.log。辅助脚本不随包分发。

## 接续边界

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由当前会话承担。没有付费任务重跑、外部安全目标、个人数据库修改或原生逆向工具执行。个人locale/provider
SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 /
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

此为本机已有引擎的响应改进，跨进程任务仍按原所有者检查，不提供进程强杀或自动恢复；测试没有证明真实模型质量、完整终端交互或最终跨平台验收。源码完整性、更多复杂长任务和最终Windows/macOS/Linux交付仍待收敛，持续目标不标完成。隔离codex分支同步带skip
ci，不合并master或正式Release。
