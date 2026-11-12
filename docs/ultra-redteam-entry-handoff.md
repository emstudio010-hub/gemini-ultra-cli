# Gemini Ultra CLI 红队协作入口交接

日期：2026-11-13。WI-144 / E-342至343 / F-103。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装仍preview.83；本轮没有打包、重装、版本变化或跨平台CI。

## 修复

F-103：Swarm添加/派发redteam-analyst时检查readDrillGrant，但invoke_agent和spawn_subagents通过AgentTool可直接启动同名本地角色，未核对既有演练授权；等待调度槽位期间撤销授权也不会重新检查。角色自身提示词中的范围限制不能代替执行入口约束。

提取agentAuthorization共享检查，Swarm既有两处使用同一实现。AgentTool的确认、执行排队前、取得调度槽位后三处核对本地角色；拒绝发生在onStart、子执行器构造/执行及模型请求前。普通研究员/开发员和远端角色保持原行为；预取消仍优先返回原signal.reason。恢复授权后必须显式重试，不自动发起任务。按当前/language输出单一中文或英文，命令/drill逐字保留。没有增加新授权弹窗、改变授权存储或扩大既有任务范围。

## Evidence → Finding → Path

E-342：首夹具makeFakeConfig未创建AgentRegistry导致5项初始化失败，不能当产品复现；补实际registry夹具后，5项旧行为失败：legacy/session直接调用和确认未拒绝、队列撤销后仍进入执行器、批量进入子执行器而非授权拒绝（mock未返回结果，后续returnDisplay异常属于夹具路径）。原日志完整保留。修后新增5项及既有Swarm无授权添加/撤销复查2项、LocalSession选择对照1项共8通过、10项不相关跳过。首次lint指出测试let声明与异步expect未await；改为await已观察的Promise outcome后，仅重验受影响排队场景1通过、4跳过。最终严格core类型及源码编译、4文件eslint/格式退出0。没有全量/冒烟。

命令（packages/core）：`npx vitest run src/agents/redteamAuthorization.test.ts src/agents/swarmRedteam.test.ts src/agents/agent-tool.test.ts --coverage.enabled=false --testNamePattern='refuses direct redteam|refuses ungranted redteam|rechecks a queued direct redteam|marks an ungranted parallel redteam|refuses an unauthorized redteam|rechecks authorization before dispatch|should use LocalSessionInvocation when flag is enabled'`；最终测试修正仅选rechecks a queued direct redteam。根目录`npx tsc -p packages/core/tsconfig.json`。

E-343：确认编译退出0后，Windows Node v24.19.0，实际源码Config.initialize、内置角色注册/工具集、AgentTool、SpawnSubagentsTool与共享单槽调度。legacy/session子执行与确认方法为受控适配器，其余入口真实。两种语言无授权时直接执行/确认均拒绝、无混用语言且子执行器/启动计数0；批量failed=1/succeeded=0且不启动；已有槽位占用时入队后撤销，释放槽位后仍不启动。恢复授权后显式legacy重试/确认成功，session有授权成功、撤销后拒绝；预取消原reason保持，普通researcher在无grant下仍可进入。预算文件字节保持、最终grant明确false、网络0。12条件通过、5147ms/退出0，3次受控子执行不代表模型调用。初始化缺省.geminiignore提示与debug日志保留。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。redteam-entry-before.log/-junit.xml、redteam-entry-before-fixed.log/-junit.xml、redteam-entry-test.log/-junit.xml、redteam-entry-source-compile.log、redteam-entry-lint.log、redteam-entry-final-test.log/-junit.xml、redteam-entry-final-source-compile.log/-lint.log及format日志；verify-source-redteam-entry.mjs、source-redteam-entry.log、source-redteam-entry-result.json。验证脚本不随包分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，本会话承担lead/cae/doc。只统一现有演练授权在本地委派入口的语义，不是外部安全目标评估。没有运行原生逆向工具、付费模型任务或修改个人数据库/工具安装/PATH。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

不承诺已运行子任务的实时强制撤回，不回滚副作用；本次只验证确认/执行/排队后的入口检查、受控恢复及普通角色对照。真实红队任务语义、长会话、复杂逆向与最终Windows/macOS/Linux交付仍未完成。隔离codex分支同步带skip ci，不合并master或正式Release；继续源码收敛及必要Windows验证，goal保持active。
