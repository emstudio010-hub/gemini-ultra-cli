# Gemini Ultra CLI MCP发现总预算交接

日期2026-11-14，WI-219 / E-493至494 / F-177。基线55d90e3e79b06beb1b84051727998175625a36aa，分支codex/ultra-agent-portable。goal active。继续源码→Windows必要定向验证→最后功能收敛后统一打包；不打包/重装/升版本/多平台CI/付费重跑，全局preview.83保持。

## Evidence → Finding → Path

F-177：前阶段已能取消MCP连接和列表，但没有发现整次期限；原默认连接/工具请求10分钟，连接、提示、工具、资源列表可逐段累计，慢服务仍阻塞启动。mcp-client-manager.ts现在每服务每次发现默认共享10000ms，从公开入口计时，覆盖旧连接断开、启用检查、握手和清单发现。各服务并行，未把期限逐段重置。

显式正数server.timeout沿既有扩展/用户合并优先级，用作此次发现总预算；有限且不超过Node计时器上限2147483647ms，否则安全回落10秒。不新增配置字段。工具调用原默认600000ms保持。超时立即取消本次等待并disconnect实际client，中英诊断含服务名、秒数、CLI继续、/mcp restart和增大timeout建议。lastErrors保存本次诊断，成功重试清除；普通发现错误也绑定serverName，避免保留旧超时。总预算结束后discovery状态可完成，即使底层迟到返回也检查信号、不晚注册；重连碰到DISCONNECTING等待共享关闭后再连接。

修改生产manager、对应定向回归与docs/tools/mcp-server.md三文件；未改McpClient、CLI生产入口、依赖或个人配置。沿用granted scope，PRIMARY R26 code-audit，lead/cae/doc同会话，无子代理/外部目标。

## E-493 源码回归与静态检查

新增4个展开用例：en/zh默认10秒期限（2）、连接3秒+发现3秒共同受显式5秒预算（1）、启用检查等待遵守显式20秒且迟到后不启动（1）。原版4项实际失败，baseline退出1，不是夹具异常。首修后12断言通过但存在3个未捕获异常，不算成功：既有mock disconnect返回undefined，与真实async API不符。只修mock为mockResolvedValue(undefined)，未迁就夹具改生产。

最终相关选择16通过/29未选中，退出0，无Unhandled/Errors；覆盖新增4、关闭门禁、发现/重启/配置合并等12既有。最终core tsc --build退出0，双文件eslint --max-warnings 0退出0，三文件Prettier与git diff --check退出0。没有全量/冒烟/CLI重编。

## E-494 Windows真实协议与进程时序

verify-source-mcp-discovery-deadline.mjs使用独立home/profile、实际编译Config/MCP SDK及loopback JSON-RPC。一次Config并行三个服务：stalled hold initialize；staged initialize延迟4秒、prompts/list再延迟4秒、tools/list hold；explicit timeout=2000 hold initialize。三个HTTP请求均在人工release之前关闭，各服务诊断/断连、无部分清单及晚发布；启动继续、isInitialized=true、全局发现completed。staged约8秒已进入tools/list，仍在整次10秒期限关闭，证明不逐段重置。整体初始化10172ms。

恢复stalled为健康后restartServer，真实发现和echo tools/call成功、lastError清除。补前阶段stdio关闭时序：原生Node进程记录PID、忽略握手，timeout5000；看见实际进程后立即dispose，调用者AbortError且process.kill(pid,0)观察进程2ms内消失，早于自然期限。仅说明本次本机观测，不承诺其他机器固定2ms/逃逸后代。

26条件全true，退出0，总16943ms，12 loopback JSON-RPC请求、1工具调用、0外部网络模型。首次执行通过，无产品迁就验证器。finally释放自有hold、还原fetch、dispose配置和DrillStore、仅必要时处理自有PID、关闭loopback；realpath校验后只清自有ultra-mcp-discovery-deadline前缀临时目录。

## 证据与边界

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：mcp-discovery-deadline-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml（首轮3夹具异常保留）；-final-tests.log/-final-junit.xml（最终16通过）；-core-compile.log/-final-core-compile.log；-lint.log/-final-lint.log；-final-format.log；verify-source-mcp-discovery-deadline.mjs、source-mcp-discovery-deadline.log/-result.json；verify-mcp-discovery-deadline-preservation.mjs与source-mcp-discovery-deadline-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466原失败SHA及false、临时凭据删除逐项保全。数据库/PATH/工具安装不动，旧被拒清理目录不动。目标池/case同步；Obsidian/源码/工程三份交接全文同SHA。显式stage、skip ci推隔离分支，不合并master/Release。

本阶段只解决MCP可选服务发现的启动等待；显式长timeout仍按用户配置等待。同步CPU无法抢占，OAuth提供器内部已开始动作尚非原生可取消，真实账户/外部MCP/跨平台/最终分发未验收。复杂真实Swarm三次失败仍保留，F-164质量未完成，不能称产品已上线。

## 接续目标（已授权继续）

1. 继续深入OAuth发现/授权/token流程原生取消，减少已取消启动后的迟到副作用。
2. 继续目标池其余源码缺陷，保持Windows定向验证；不重跑旧付费任务。
3. 持续导出Evidence→Finding→Path与Obsidian交接；功能收敛后再做最终Windows及macOS/Linux分发。
