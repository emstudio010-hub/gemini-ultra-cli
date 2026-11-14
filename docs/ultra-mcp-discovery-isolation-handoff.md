# Gemini Ultra CLI MCP并行预算隔离交接

日期2026-11-14，WI-220 / E-495至496 / F-178。基线721bbc183e96b61935211b9f66bac64fefe2b085，分支codex/ultra-agent-portable；前阶段MCP发现预算交接仍保全。goal active，源码优先→Windows必要定向验证→最后统一打包；不打包/重装/升版本/多平台CI/付费重跑，全局preview.83保持。

## Evidence → Finding → Path

F-178：复查新增发现预算时，发现discoverMcpServer最后返回全局discoveryPromise，虽然自身连接/列表已完成，也会等待此前其他服务。后加入的健康服务若timeout较短，会在等待别人的时候被误关。前阶段三服务均故意卡住的验证未覆盖该并行情形，本阶段补正，不用已通过证据推论健康服务隔离。

生产mcp-client-manager.ts仅将返回值改为本服务boundedDiscoveryPromise并解释意图；全局aggregate promise、UI完成跟踪和最后世代归属判断保留。因此本服务完成即清自身timer，别的服务继续受各自预算限制，所有服务完毕时全局才completed。不改变默认10秒、显式timeout/配置合并、工具调用默认10分钟。既有调用入口已核查，start/restart/扩展/子Agent均等待自身任务或Promise.all。

## E-495 回归与静态检查

新增一个用例：先启动悬挂的slow，再启动timeout1000但立即健康的独立mock client；计时前健康应已settled，1秒后无错误/断连，slow期间全局仍IN_PROGRESS，释放slow后最终COMPLETED。修前实际失败，退出1，无夹具异常。修后相关选择16通过/30未选，包含原预算/关闭/合并/重启及并行全局状态；原16与本16有重叠，不累加声称32。

首lint发现mock对象按McpClient类型展开触发no-misused-spread；显式列出健康mock字段后，单个受改用例再次通过/45未选。core tsc --build退出0；双文件最终零warning eslint、Prettier及git diff --check退出0。首lint失败保全。生产仅一处return和注释，无依赖/CLI生产变更，不全量/冒烟/重复编译CLI。

## E-496 Windows实际Config/SDK

verify-source-mcp-discovery-isolation.mjs独立home/profile，真实编译Config与SDK、loopback JSON-RPC：slow先启动、timeout3000并hold initialize；healthy随后启动、timeout1000且正常发现。健康握手起1.5秒时，healthy仍connected、lastError为空，slow HTTP未关闭、Config初始化未结束、全局仍in_progress；此时实际echo tools/call成功，证明没有等慢服务才可用。slow约3秒后单独超时、请求在人工release前关闭，Config初始化完成、全局completed，healthy仍连接无误。释放slow后无迟到工具。

8条件全true、退出0；初始化3188ms，总10889ms，5 loopback JSON-RPC请求、1实际工具调用、0外部网络模型。首次执行通过。finally仅释放自有hold/dispose配置/恢复fetch/关闭server及DrillStore，并realpath校验后清自有ultra-mcp-discovery-isolation前缀临时目录。没有重跑前阶段10秒三服务或旧付费任务。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：mcp-discovery-isolation-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-final-tests.log/-final-junit.xml；-core-compile.log；-lint.log（首lint错误）/-final-lint.log；-format.log；verify-source-mcp-discovery-isolation.mjs、source-mcp-discovery-isolation.log/-result.json；verify-mcp-discovery-isolation-preservation.mjs、source-mcp-discovery-isolation-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466原失败SHA及false、临时凭据删除均保全true。个人数据库/PATH/工具安装与旧被拒清理目录不动。granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话，无子代理/外部扫描。目标池/case同步，Obsidian/源码/工程三份交接全文同SHA；显式stage、skip ci推隔离分支，不合并master/Release。

OAuth提供器内部原生取消、外部账户/MCP、同步CPU抢占、复杂真实Swarm F-164质量、最终跨平台分发仍未验收；本次不宣称整体上线。

## 接续目标（已授权继续）

1. 继续深入OAuth发现/授权/token流程原生取消，保留已开始副作用的真实边界。
2. 继续目标池其余源码缺陷与Windows必要验证，不重跑旧付费任务。
3. 维护证据链与导出Obsidian交接；功能收敛后再做最终Windows以及macOS/Linux分发。
