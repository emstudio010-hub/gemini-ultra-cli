# Gemini Ultra CLI Swarm 留言异常恢复交接

日期：2026-11-12。WI-132 / E-319至320 /
F-092。持续目标active。源码优先、Windows必要定向验证、最后统一打包。全局安装仍preview.83，本轮未打包、重装、改版本或运行跨平台CI。

## 修复

F-092：resumeSwarmState原先先保存active及所有者，再调用appendPost校验恢复留言。500条已满、追加将超过4MiB、原JSONL损坏时，命令报错但旧任务已变active。历史任务恢复失败后，其状态和当前绑定还可能不一致。3个旧拒绝复现均证实保存状态变化；499条正常边界旧检查通过。

现在把原有留言构造/格式/容量检查提取为私有preparePost，恢复在任何任务写入之前检查要追加的恢复留言。实际appendPost仍在原留言锁内调用同一检查，不移除二次校验、不提高容量、不丢弃旧留言。已知留言异常先拒绝，保留旧任务、累计预算和当前绑定；正常恢复仍先保存状态再追加留言/更新绑定。此处只解决前置校验失败，不提供跨文件事务，后续实际append、锁或磁盘写入故障仍可能部分落盘。

## 必要证据

E-319：旧3拒绝复现失败、1正常边界通过；修后4项及正常公开留言唤醒1个相关对照共5项通过，14项不相关场景跳过。首轮大文件失败比对器输出缓慢，原检查已自然完成、37.17秒/退出1；改为按文件检查字节相等布尔值，避免打印整份大Buffer，没有放宽文件/内容比对。修后检查2.37秒/退出0。strict
core类型检查及源码编译、两个修改文件eslint退出0，没有全量/冒烟。

packages/core命令：`npx vitest run src/agents/swarm.test.ts --coverage.enabled=false --testNamePattern='refuses historical resume with a|resumes at the final available board slot|posts publicly under native member identity'`。根目录`npx tsc -p packages/core/tsconfig.json`只编译源码，未运行package构建脚本。

E-320：Windows Node v24.19.0，最新编译core及原未修改的已编译CLI slash
handler、最小UI/config适配器，4个隔离真实文件场景。满500条、追加后超4MiB、损坏JSONL的历史ID恢复均不提交提示，全部任务文件字节保持、旧任务仍cancelled、当前较新任务绑定保持、累计请求1和权限保持。499条可用边界正常返回原ID协调提示、active、旧留言逐字前缀保持、只追加seq500恢复留言、累计用量不清零。共24条件通过，9042ms/退出0。近4MiB输入是可被既有读取schema接受的超长历史行夹具，不表示当前正常post允许超过4000字符。没有模型/供应商请求。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。swarm-resume-board-before.log/-junit.xml、swarm-resume-board.log/-junit.xml、swarm-resume-board-source-compile.log、swarm-resume-board-lint.log、verify-source-swarm-resume-board.mjs、source-swarm-resume-board-result.json、source-swarm-resume-board.log。辅助脚本不随包分发。

## 接续边界

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由当前会话承担。没有付费任务重跑、外部安全目标、个人数据库修改或原生逆向软件调用。locale/provider
SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 /
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

本轮是留言前置检查和正常边界，不是完整终端UI、真实模型质量、所有持久化错误的原子恢复或最终跨平台验收。源码完整性、复杂长任务和最终Windows/macOS/Linux交付仍未完成，持续目标保持active。隔离codex分支同步带skip
ci，不合并master或正式Release。
