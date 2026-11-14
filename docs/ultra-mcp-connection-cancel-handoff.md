# Gemini Ultra CLI MCP连接、列表与通知取消交接

日期2026-11-14，WI-218 / E-491至492 / F-176。基线f9cc4ed239f4bdfcc992097641120c354162d98d，分支codex/ultra-agent-portable。上一goal turn为progress（扩展关闭隔离已推送）。goal active；源码→Windows必要定向验证→最后收敛后统一打包，不打包/重装/升版本/多平台CI/付费重跑，全局preview.83保持。

## Finding → Path

McpClient.disconnect原对CONNECTING直接返回，握手不能终止；discoverInto和三类通知刷新await后缺连接归属检查，关闭后资源/工具等可迟到写回。此轮真正下沉到client与SDK传输，不停在manager提前返回。

仅生产mcp-client.ts修改：每次connect独立controller，disconnect先abort并清注册目标/待刷新位，连接中也处置；连接成功局部SDK client通过最后检查才赋值，旧连接catch不改新连接状态。共享disconnectPromise覆盖重复关闭，重连新代不受旧代收尾影响。删除原从未赋值的transport字段，SDK client负责传输关闭。

connectToMcpServer可选signal，外层withAbortSignal结束等待，onAbort解绑workspace监听并关闭实际SDK client。内部连接函数接同一signal，统一connectTransport向SDK传signal；若createTransport迟到返回，连接前先close而不start。取消在HTTP/SSE/OAuth回退边界原样抛出，不启动下一条回退/重试；HEAD合并生命周期signal，OAuth发现/授权/取token等待也有屏障。已开始的OAuth提供器内部动作并未改成原生可取消，不声称可撤回已开启浏览器、token写入或所有凭据IO；本轮没有真实OAuth账户。

discoverInto把连接signal传给prompts/tools/resources，withAbortSignal覆盖三段等待，最终检查连接与registry仍注册后才同步发布。保留初始注册目标以接收启动期通知，但disconnect清空、removeRegistries被尊重。资源列表新支持signal选项。三类通知各捕获连接代际，连接signal与原超时合并，列表/500ms重试延迟/上下文回调均可取消，写入前再查信号和registry；旧代finally不覆盖新代刷新标志。列表取消不再作为server故障诊断，正常异常沿旧逻辑。

范围：MCP_DEFAULT_TIMEOUT_MSEC仍10分钟，显式server.timeout沿用；本轮提供取消而非新的整启动期限。无需用户取消时MCP初始等待仍须下一步审查默认期限与整次预算。同步解析不可抢占，OAuth已开始副作用、真实外部服务/跨平台/逃逸后代均未验收。活动模型生成和其他Agent质量不由本轮证明。

## E-491 回归与静态检查

原版新增5项实际失败：pending握手断连、提示/工具/资源三段发现取消、关闭前收到的工具通知晚写。baseline日志/XML保全，无夹具错误/未处理拒绝。

修后先5项通过；针对McpClient/动态通知/HTTP→SSE与OAuth回退筛选39通过/47未选中，其中新5+既有34。进一步补同一client旧握手迟到不覆盖新连接、提示/资源通知分支，取消集8项通过/81未选中；最后增加SDK列表真实abort型拒绝不报server失败，单项通过/89未选中。合计43个不同相关用例（新9+既有34）通过，不把重复运行累加。后两轮仅受改分支，不重跑整个文件/全量/冒烟。

core严格tsc初/最终/最后诊断guard均退出0，双文件最终eslint --max-warnings0与Prettier及git diff --check退出0。无CLI生产改动，不重复编译CLI，无新依赖。

## E-492 Windows SDK、HTTP/SSE与stdio

verify-source-mcp-connection-cancel.mjs独立home/workspace，实际编译Config/McpClient/MCP SDK，原生loopback JSON-RPC+SSE服务。fetch只允许自有origin，server显式hold响应，未替换client/SDK业务方法。20条件true/16103ms/退出0，36 loopback请求、1次实际tools/call、0外部网络模型。

1. initialize握手、prompts/list、tools/list、resources/list四种stage分别hold响应。Config.dispose立即AbortError；server观察对应HTTP响应在人工release之前且关闭起点2秒内关闭（fixture配置timeout=3秒，部分SDK列表仍有各自默认期限；均观测关闭起点2秒内，未把自然超时当取消）。释放后无工具/提示/资源注册，client disconnected，Config未就绪。自动HTTP→SSE识别配置在取消握手后没有GET回退或第二次initialize。
2. 同一实际McpClient disconnect→connect→discoverInto正常恢复，实际echo tools/call成功，证明不是只能换新Config。
3. 真正SSE GET通道发送notifications/tools/list_changed，第二次tools/list由server hold；关闭后请求在release前断开，释放后无重注册、无MemoryChanged上下文刷新。提示/资源通知对应覆盖在单位用例，不冒称三种真实SSE均运行。
4. 原生Node stdio进程确实启动但忽略initialize；关闭Config使初始化取消，process.kill(pid,0)观察进程最终退出，未收到握手响应；此stdio分支未单独计量终止延迟，不据此声称其早于配置超时退出。不证明其自行逃逸后代的清理。

finally释放自有hold、还原fetch、dispose Config/DrillStore，必要时仅终止自有PID，关loopback全部连接；realpath核实后只删真实temp下ultra-mcp-connection-cancel前缀自有根。此实际脚本首次执行通过，没有修改产品迁就验证器。

## 证据、保全与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：mcp-connection-cancel-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-related-tests.log/-related-junit.xml、-final-tests.log/-final-junit.xml、-diagnostic-tests.log/-diagnostic-junit.xml；-core-compile.log/-final-core-compile.log/-guard-core-compile.log；-lint.log/-final-lint.log/-guard-lint.log及各format日志；verify-source-mcp-connection-cancel.mjs、source-mcp-connection-cancel.log/-result.json；verify-mcp-connection-cancel-preservation.mjs、source-mcp-connection-cancel-preservation.json。

个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466原失败SHA和false、临时凭据删除均true；个人数据库/PATH/工具安装不动，旧被拒清理目录不动。沿用granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话，无子代理/外部扫描。

目标池/case workitems/timeline/field-journal与E-491-492更新，三份交接同全文SHA；显式stage、skip ci推隔离分支，不合并master/Release。下一阶段审查MCP启动发现整次期限（当前连接/工具默认10分钟、提示/资源并非一个总预算），以及OAuth提供器原生取消；随后继续剩余产品需求和真实复杂多Agent F-164。最终分发仍未验收，goal保持active。
