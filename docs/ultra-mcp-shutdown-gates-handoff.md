# Gemini Ultra CLI MCP目录保全与管理器关闭门禁交接

日期2026-11-14，WI-216 / E-487至488 / F-174。基线e6a1a326817cd3b6d8ea9f9ea2ca6fd21cda81ef，分支codex/ultra-agent-portable。上一goal turn为progress（工具发现取消已推送）。整体goal active；源码→Windows必要定向验证→收敛后统一打包，不打包/重装/升版本/多平台CI/付费重跑，全局preview.83保持。

## Finding → Path

ToolRegistry成功命令发现（含没有配置命令时）原会删除DiscoveredMCPTool，但没有重新发现MCP，造成已连接工具无故消失。现私有清理方法改removeCommandDiscoveredTools，只删命令发现的DiscoveredTool；MCP由McpClientManager管理，保留原对象/连接。上轮“成功刷新仍清MCP”的兼容边界由本轮修复。

McpClientManager.stop原遍历已存clients后清map，没有终止发现入口；isFileEnabled还在await时，stop后可创建新client；CONNECTING时McpClient.disconnect原直接返回，连接迟到成功后manager继续discoverInto。现manager设置终止状态与stopController，公开maybeDiscover用withAbortSignal结束调用方等待，底层在启用判定/替换断连/连接完成等await后检查。迟到连接成功则再次disconnect、不进入列表发现。stop立即清当前map/发现引用与待刷新位，发空目录事件，设置COMPLETED并中止等待；共享stopPromise使重复stop等待同一关闭任务。终止后startConfigured/startExtension/restart/restartServer均不再启动；上下文回调/刷新/诊断和迟到状态发布被门禁阻断。

本轮不是完整MCP退出实现：没有改McpClient.connect/connectToMcpServer或discoverInto。连接传输可在后台一直等到原握手完成/既有超时，才由manager清理；已经进入discoverInto的列表请求仍可能在stop之后发布工具/提示/资源；通知刷新循环也未改。ExtensionLoader在await manager.startExtension返回后仍可能注册策略，尤其本轮manager等待立即结束会让这一后续更早到达，必须下一阶段给loader/Config.dispose加生命周期检查。源码未安装/发布，这些边界保持开放；不以manager map=0证明所有底层连接已关闭。认证/活动生成/Hook等退出也未验收。

## E-487 定向复现

新增5项：有/无命令两种成功刷新保留MCP并移除旧命令；manager等待启用时stop立即结束等待且迟到不建client；连接迟到后disconnect而不discover；stop后上下文回调和restart不再发起工作。原生产源码实际5失败，baseline日志/XML保全，无夹具错误/未处理拒绝。

修后新5+既有7个发现/聚合/状态/重启相关用例=12通过/70未选中，195ms测试/39.44s总耗时（非启动性能指标）。严格core tsc、4文件eslint --max-warnings0、Prettier和git diff --check退出0。未全量/冒烟或重复上轮10项，无新依赖/CLI重编。

## E-488 Windows实际MCP协议和命令

verify-source-mcp-shutdown-gates.mjs独立home/workspace，真实Config/ToolRegistry/MCP SDK接本机JSON-RPC HTTP server，原生Node命令产工具目录；fetch只放行自有loopback origin。

- isFileEnabled受控等待时Config.dispose；manager直接发现等待在release前结束，原Config取消；解除启用后再restart/restartServer/startConfigured均0连接、0协议请求。
- 实际发现MCP echo，调用一次成功。原生命令清单old_command→new_command刷新后，MCP工具仍为相同对象且再次实际调用成功；旧命令消失/新命令出现。
- 无命令的另一个实际Config，手动放一个旧DiscoveredTool后刷新；只移除旧命令、MCP同对象仍在，第三次实际tools/call成功。
- 另一Config在真实initialize HTTP响应处hold，观察McpClient为connecting。关闭Config先取消调用方；release握手后SDK连接完成、manager把迟到连接断开，status最终disconnected、map=0且该route无tools/list。没有宣称release前传输已中止。

最终13条件true、11 loopback请求/其中3 tools/call、6984ms、退出0、0外部网络/模型。首次验证器误用getMcpClient方法，已完成部分本地协议后在late观察阶段失败，method-failure原日志保全；实际API是manager.getClient。只修验证器后重新离线验证通过，未改产品迁就断言。finally释放启用/握手hold，恢复fetch，dispose自有Config/DrillStore/late client，关闭本机server全部连接，realpath核实后仅删除真实temp下ultra-mcp-gates前缀自有根。

没有外部MCP服务、实际账户、Stdio进程/取消握手、进行中列表/扩展策略、跨平台或终端渲染验收。数据保全：个人provider/locale/config skill-tags SHA、ultra-tools不存在、全局83、E-294/E-364/E-466三次真实失败SHA和false及临时凭据删除均true。个人数据库/PATH/工具安装不动，旧被拒清理目录不动。

## 证据与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：mcp-shutdown-gates-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-core-compile.log、-lint.log、-test-format.log/-format.log/-format-check.log；verify-source-mcp-shutdown-gates.mjs、source-mcp-shutdown-gates-method-failure.log、source-mcp-shutdown-gates.log/-result.json；verify-mcp-shutdown-gates-preservation.mjs、source-mcp-shutdown-gates-preservation.json。

沿用granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话，无子代理/外部扫描。目标池/case workitems/timeline/field-journal及E-487-488更新，Obsidian/源码docs/工程报告同全文SHA；显式stage、skip ci推隔离分支，不合并master/Release。下阶段首先补Config.dispose→ExtensionLoader生命周期以阻止晚策略/事件/刷新，再补McpClient连接/列表/通知刷新自己的取消，不能停在manager表层。复杂真实多Agent F-164及最终分发仍未验收，goal保持active。
