# Gemini Ultra CLI 扩展关闭与迟到注册隔离交接

日期2026-11-14，WI-217 / E-489至490 / F-175。基线c3c27497cc6ee3c6818eb0347fbb608bb34288b7，分支codex/ultra-agent-portable。上一goal turn为progress（MCP管理器门禁与目录保全已推送）。整体goal active，源码→Windows必要定向验证→收敛后统一打包；不打包/重装/升版/多平台CI/付费重跑，全局preview.83保持。

## Finding → Path

ExtensionLoader在等待MCP.startExtension/工具刷新后未检查关闭状态，会继续添加规则/检查器并发完成事件；收尾记忆刷新也会逐步启动系统提示/Hook/Agent/技能刷新。上轮MCP manager立即结束等待会让这条旧竞态更早到达。

ExtensionLoader新增生命周期controller和dispose/protected throwIfDisposed。Config.dispose在处理其他子系统前中止实际_extensionLoader。初始start、MCP启动/停止、工具刷新及记忆/Hook/Agent/技能收尾等待使用withAbortSignal，关键await之后检查才进入下一步；记忆refresh也接signal。关闭后拒绝start/load/unload/restart，在SimpleExtensionLoader目录变更前检查；finally继续维护计数但不发关闭后的完成事件，不再启动收尾刷新。CLI ExtensionManager在super.start/stop返回之后、主题注册/注销之前检查，并在restart入口及unload返回后检查，避免派生类绕过基类关闭边界。

范围：停止本层等待和后续阶段，不回滚关闭前已注册策略或已完成目录变化；已进入的MCP/Hook/Agent/技能/文件IO仍靠各自生命周期，不能以本轮证明所有底层副作用中止。McpClient.connect/discoverInto及通知刷新尚未改，握手未返回/列表已开始时的传输取消仍待。CLI主题正常功能有用例/编译，但未做实际主题退出渲染验收。

## E-489 缺陷复现与源码检查

新增实际Config+SimpleExtensionLoader集成用例：MCP扩展启动受控hold期间config.dispose，release后观察真实PolicyEngine.addRule。原版确实注册了关闭后的源规则，单项失败退出1，baseline日志/XML保全；不以调用原版不存在的loader.dispose作为缺陷证据。

另加4个loader生命周期用例：初始MCP等待取消且不加策略/检查器/工具/晚事件；动态工具刷新取消不继续策略/记忆；记忆刷新取消不继续提示/Hook/Agent/技能；closed入口不改目录。loader新4+既有10=14通过/1既有skip；Config新集成1通过/290未选中；CLI既有主题2通过/37未选中。共17不同相关用例通过，无全量/冒烟或上轮12项重跑。

core与CLI严格tsc均退出0，五文件最终eslint --max-warnings0、Prettier、git diff --check退出0。首次lint发现测试中5个one-var声明格式错误，原日志保留，自动拆声明后最终通过，仅测试格式变化不重跑行为。CLI编译因改实际派生类边界而必要，无打包/版本/安装变更或新依赖。

## E-490 Windows实际Config、策略与刷新链

verify-source-extension-shutdown.mjs独立home/workspace，实际编译Config/SimpleExtensionLoader/McpClientManager/PolicyEngine和真实GEMINI.md读取处理，0网络模型。

1. 初始扩展isFileEnabled hold，Config.dispose后release；初始化取消，源规则/检查器不注册、完成事件不增加、memory未创建/MCP client0。closed loader拒绝restart/load，目录数保持。
2. 正常动态加载/卸载实际扩展，真实规则与检查器分别加入/移除，保持原可用行为。
3. 第一版实际验证hold的是manager.startExtension内的第一次记忆刷新（12条件true/7435ms），保存为-mcp-stage.log/-mcp-stage-result.json，不误称loader收尾阶段。
4. 进一步把命名GEMINI.md hold到第二次读取，确认MCP第一次刷新已发布正常正文且扩展策略已注册，确实到达loader finally收尾。此时关闭Config，动态load在release前AbortError；释放受控迟到字节（追加LATE_AFTER_CLOSE）后，原记忆快照不被替换、系统提示更新次数保持、Agent reload及技能reload均0，晚事件不增加。这里已完成策略不回滚。底层迟到解析日志仍会出现，不声称物理IO停止。

最终13条件true/24365ms/退出0（含当时并行静态检查负载，非普通启动基准）。仅fs命名文件hold/可控字节和启用回调，Agent/提示/技能方法只是计数转发原方法，没有替换loader或Config业务逻辑。无MCP连接、实际CLI主题渲染/外部账户/跨平台验收。

finally释放hold、还原fs/fetch、dispose自有Config/DrillStore，仅清理realpath核实在真实temp且ultra-extension-shutdown前缀的自有根。个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466原失败SHA及false、临时凭据删除状态全部true；个人数据库/PATH/工具安装不动，旧被拒清理目录不动。

## 证据与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：extension-shutdown-baseline.log/-baseline-junit.xml、-loader-tests.log/-loader-junit.xml、-config-tests.log/-config-junit.xml、-cli-themes-tests.log/-cli-themes-junit.xml、-core-compile.log/-cli-compile.log、-lint.log/-test-lint-fix.log/-final-lint.log及各format日志；verify-source-extension-shutdown.mjs、source-extension-shutdown-mcp-stage.log/-mcp-stage-result.json、source-extension-shutdown.log/-result.json；verify-extension-shutdown-preservation.mjs、source-extension-shutdown-preservation.json。

沿用granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话，无子代理/外部扫描。目标池/case workitems/timeline/field-journal及E-489-490更新，三份交接同全文SHA，显式stage、skip ci推隔离分支，不合并master/Release。下一阶段具体处理McpClient的CONNECTING断连、connectToMcpServer握手/传输关闭、discoverInto及通知刷新晚发布，不能以本轮声称MCP完整退出。复杂真实多Agent F-164与最终分发仍开放，goal继续active。
