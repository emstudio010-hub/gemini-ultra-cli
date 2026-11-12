# Gemini Ultra CLI 已删除供应商身份交接

日期：2026-11-13。WI-135 / E-324至325 /
F-094。持续目标active。继续源码优先、Windows必要定向验证、最后统一打包。全局安装仍preview.83，本轮没有打包、重装、版本变化或跨平台CI。

## 修复

F-094：ID优先修复解决了ID仍存在时的冲突，但getProvider仍允许名称别名回退。供应商research被删除后，另一家名称恰为Research时，保存的research:model成员路由、显式前缀解析及旧编辑草稿仍可能匹配剩余记录。4个旧复现全部失败，包括成员作用域建立前/后删除、显式路由和旧编辑。

新增getProviderById，仅按不区分大小写的ID查找并返回副本；getProvider仍先ID后名称，作为通用别名查询。持久化身份位置改用严格方法：编辑input.id、活动供应商/活动生图供应商、显式模型前缀及成员模型正规化。删除后的成员ID不可用时明确拒绝，不回退同名显示名称，不修改旧任务模型选择。名称别名普通查询继续可用；显式provider:model和成员选择要求提供配置中列出的稳定ID，显示名称不再充当这些位置的ID。没有配置迁移或个人配置更改。

## 验证

E-324：4个新增旧复现失败；修后4项加普通配置切换和ID仍存在时的冲突路由2个直接相关对照共6项通过，16项不相关场景跳过。strict
core类型检查及源码编译、4个修改文件eslint退出0，没有全量/冒烟。

packages/core命令：`npx vitest run src/providers/providerManager.test.ts src/agents/agentModelRouting.test.ts --coverage.enabled=false --testNamePattern='does not replace a deleted provider ID|refuses a deleted member route|can upsert, resolve and switch providers|keeps a saved member provider ID'`。根目录`npx tsc -p packages/core/tsconfig.json`只编译源码，未运行package构建脚本。

E-325：Windows Node
v24.19.0，实际编译源码ProviderManager、SwarmEngine保存角色及UniversalContentGenerator，隔离profile/假凭据和真实loopback请求计数器。第一场景保存成员模型后删除对应供应商，保留另一家的同名显示名称；启动成员时在进入runner前失败，paused、原roleModels保持、modelsUsed为空、请求计数0、失败轮1。第二场景在withAgentModel作用域建立后删除目标，调用前再次正规化拒绝。两场景均0HTTP/0原生dispatch，旧编辑拒绝、剩余记录及主选择保持、删除后配置字节保持，通用名称查询仍可用。17条件通过，5495ms/退出0。没有真实模型或外部服务调用。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。provider-deleted-id-before.log/-junit.xml、provider-deleted-id.log/-junit.xml、provider-deleted-id-source-compile.log、provider-deleted-id-lint.log、verify-source-provider-deleted-id.mjs、source-provider-deleted-id-result.json、source-provider-deleted-id.log。辅助脚本不随包分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由本会话承担。没有外部安全目标、旧付费任务重跑、个人数据库修改或原生逆向工具执行。个人locale/provider
SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 /
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

这里覆盖当前进程已加载配置的明确删除，不宣称其他进程编辑后自动刷新或处理所有主模型无效前缀的fallback问题；通用removeProvider接口仍保留既有名称别名语义，未将其改为ID专用接口。不是完整终端配置窗口、真实供应商语义或最终跨平台验收。更多源码完整性、复杂长任务和最终Windows/macOS/Linux交付仍待收敛，持续目标保持active。隔离codex分支同步带skip
ci，不合并master或正式Release。
