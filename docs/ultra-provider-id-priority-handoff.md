# Gemini Ultra CLI 供应商ID优先交接

日期：2026-11-12。WI-134 / E-322至323 /
F-093。持续目标active。源码优先、Windows必要定向验证、最后统一打包。全局安装仍preview.83，本轮没有打包、重装、版本变化或跨平台CI。

## 修复

F-093：ProviderManager.getProvider原先在同一个find中匹配ID或名称，列表中靠前的显示名称可抢占另一供应商的稳定ID。通过正常改名即可复现：先创建Alpha与Research，再把Research改名Research
Gateway、把Alpha改名Research；随后请求ID
research会选中Alpha。影响显式模型路由、活动供应商读取，以及按ID编辑/删除。4个旧查找、更新、删除和成员路由复现均失败。

现在先不区分大小写匹配稳定ID，找不到才按名称别名查找；空格处理和返回副本行为保持。无需修改已有配置、改名或迁移ID。存在歧义时稳定ID优先，名称别名不能覆盖它；非冲突名称继续可用。按ID路由对应的端点和凭据随同一正确记录解析，避免选错配置。

## 必要证据

E-322：4个新增旧复现失败；修后4项加原有普通配置切换、并行成员模型隔离2个直接相关对照共6项通过，12项不相关场景跳过。strict
core类型检查及源码编译、3个修改文件eslint退出0，没有全量/冒烟或旧付费任务重跑。

packages/core命令：`npx vitest run src/providers/providerManager.test.ts src/agents/agentModelRouting.test.ts --coverage.enabled=false --testNamePattern='prioritizes a stable provider ID|keeps a saved member provider ID|can upsert, resolve and switch providers|isolates parallel member routes'`。根目录`npx tsc -p packages/core/tsconfig.json`只编译源码，未运行package构建脚本。

E-323：Windows Node
v24.19.0，实际编译源码ProviderManager、SwarmEngine角色模型及UniversalContentGenerator，两个真实loopback协议端点与假凭据。正常创建及改名形成名称/ID冲突后，保存researcher的research:review-model并启动受控成员，唯一HTTP请求到research端点，primary端点0次、原生fallback0次；实际model字段及认证头匹配目标配置，成员modelsUsed记录正确路由，累计请求1，主选择和配置文件在调度过程中保持。随后按research
ID编辑、删除只改变该记录，另一记录对象保持。10条件通过，5685ms/退出0。认证头只记录匹配布尔值，不输出凭据；没有真实模型或外部服务请求。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。provider-id-priority-before.log/-junit.xml、provider-id-priority.log/-junit.xml、provider-id-priority-source-compile.log、provider-id-priority-lint.log、verify-source-provider-id-priority.mjs、source-provider-id-priority-result.json、source-provider-id-priority.log。辅助脚本不随包分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由当前会话承担。没有个人供应商编辑、个人数据库修改、外部安全目标或原生逆向工具执行。个人locale/provider
SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 /
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

本轮是稳定身份解析与本地协议调用验收，不是新供应商模型质量、完整终端配置窗口或最终平台验收；既有被错误操作造成的历史配置不会自动还原。源码完整性、复杂长任务及最终Windows/macOS/Linux交付仍待收敛，持续目标保持active。隔离codex分支同步带skip
ci，不合并master或正式Release。
