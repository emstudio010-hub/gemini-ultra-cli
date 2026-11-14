# Gemini Ultra CLI Agent 重载顺序与关闭后迟到隔离交接

日期2026-11-14。WI-210 / E-475至476 / F-168。基线8fbb53486677d5b8b016cc13da729c2737785fe8，分支codex/ultra-agent-portable。上一goal turn为progress（自定义目录限时源码与Windows实际证据）。整体goal active；源码优先→Windows必要定向验证→功能收敛后统一打包，不打包/重装/升版本/多平台CI/付费任务重跑，全局preview.83保持。

## 缺陷与源码

AgentRegistry的initialize/reload原来可以交错执行：两次loadAgents同时清空/填充共享agents/allDefinitions、动态策略和A2A缓存，旧扫描晚返回会补入新一代已移除的定义。dispose原仅删除事件监听，旧目录或远程卡片返回仍可注册Agent和策略、发送刷新事件。

仅registry.ts生产修改：实例级Promise队列串行执行initialize、reload、acknowledge和ModelChanged刷新；每个调用保留各自Promise/结果，不合并或丢弃后一次请求，后一次读取执行时的当前文件。前一次失败由队列内部观察并释放，失败仍原样返回调用方，不堵后续。相同reload流程内部每个目录/远程agent的并行度保持，队列不序列化模型工作者任务。

disposed标志在排队任务开始、目录结果、ack读取/写入、远程auth/card await之后及注册入口/刷新发布前检查；dispose后等待中和排队操作拒绝，不再注册迟到结果/新策略/刷新事件。原始已发布状态和dispose前已写的ack数据不回滚；远程discovered metadata可能已在请求前加入allDefinitions，不冒称dispose清空它。新增最后一个assert在项目扫描后、开始用户目录前，避免已关闭实例再开启下一目录读取。

本轮不实现无中断/原子目录切换：重载仍按原逻辑先清空再加载，期间自定义Agent可能短暂不可用；队列解决竞态顺序而非旧目录全程可用。关闭不会强制撤销所有底层IO或A2A缓存写入，已发卡片请求可完成，拒绝的是注册表/策略/刷新发布。队列也不为config.reloadAgents的用户回调添加总期限，目录继续沿用每目录10秒，远程card沿用既有限时。

## E-475 定向回归

新增4项：重叠reload旧结果不能补入新目录、前一次settings失败后下一次能执行、dispose后活动/排队重载拒绝且不发布、远程card晚返回不注册或新增策略。修前两个核心用例实际失败（并发第二次提前读取、关闭后仍发布），保全before日志/JUnit。

首before夹具遗漏fake A2A manager的clearCache，造成TypeError及一个未处理拒绝；该输出另存fixture-failure日志/JUnit，不算产品缺陷。补充新用例配置为无A2A manager后重跑原版两个核心用例，确实2失败/退出1，无该夹具异常。修后整个registry文件66通过/1既有skip，700ms测试/24.97秒总耗时（非性能基准）；新增远程case后只运行4个受改用例通过（总68定义、其余64未运行），不重复全文件。

全文件运行出现fake Config累计的3类MaxListenersExceededWarning（model/memory/approval各超100）；保留原输出，不调大limit掩盖、不据此宣称产品无监听泄漏。这些测试大量建fake Config未统一dispose；本轮没有归因验证真实长会话是否有同类问题，边界保留。

core严格tsc首次/最终及最后guard后通过；双文件eslint最终通过，最后guard单文件lint/格式/diff通过。无全量/冒烟、CLI重编或新依赖。最后仅在项目阶段后补同类disposed检查，不重复Windows链路；此前Windows验证所涉用户读取/card分支源码保持。

## E-476 Windows实际文件与A2A HTTP

verify-source-agent-registry-queue.mjs独立home/workspace与真实Config/AgentRegistry。自定义local.md最初initial-agent。fs adapter只hold第一重载读取的实际old-agent字节；期间把实际文件改为new-agent并发第二重载，第二次没有提前读文件。release第一读取后两次独立扫描依次完成；第一summary新增old-agent，第二新增new-agent/删除old-agent，最终只有new-agent，initial/old均不在active registry。没有替换注册业务方法或返回虚构定义。

随后创建真实remote.md指向自有loopback卡片端点，服务器hold真实HTTP响应；该重载等待时再排队一次重载，调用registry.dispose再释放有效A2A卡片。活动/排队Promise均拒绝disposed；无late-remote active定义、无新增策略、无agents-refreshed事件、卡片仅1次请求，排队操作没有第二请求。A2AClientManager自身日志仍可显示已load卡片，这不等于已注册或被允许执行；本轮不改manager缓存生命周期。

最终11条件true，10224ms/退出0、本地两次文件读取/1卡片HTTP/0外部或模型。无真实远程代理推理/鉴权、终端UI、跨平台或安装包验证。没有恶意样本或外部安全目标。

首Windows验证11条件已true但finally二次releaseCard重复writeHead导致ERR_HTTP_HEADERS_SENT、退出1，不能当成功。保全cleanup-failure日志及before-cleanup-fix-result，修验证器为已结束/销毁响应不再release后重跑通过。首残留自有临时根EOStWV在进程确认退出后，核绝对realpath父目录为os.tmpdir且basename完全匹配，再删除；agent-registry-queue-first-fixture-cleanup.json保留。未重试此前被拒的其他目录。最终finally恢复fs/fetch、关自有HTTP、dispose Config/DrillStore、清理仅自有命名前缀临时根。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：agent-registry-queue-before.log/-before-junit.xml、-fixture-failure.log/-fixture-failure-junit.xml；-tests.log/-junit.xml（66通过/1skip含warning）、-final-tests.log/-final-junit.xml（4通过）；-core-compile.log/-final-core-compile.log/-last-core-compile.log；-format.log/-final-format-write.log/-final-format.log/-last-format.log；-lint.log/-final-lint.log/-last-lint.log。

verify-source-agent-registry-queue.mjs、source-agent-registry-queue.log/-result.json、-cleanup-failure.log/-before-cleanup-fix-result.json；agent-registry-queue-first-fixture-cleanup.json；verify-agent-registry-queue-preservation.mjs、source-agent-registry-queue-preservation.json。

保全全true：个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83，E-294/E-364/E-466真实失败SHA及passed=false保持，E-466临时凭据仍已删。未改个人数据库/工具安装/PATH。沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理。目标池/case四项及证据更新、三份交接同SHA；显式stage、skip ci推隔离分支，不合并master/Release。原子热重载、其他初始化等待及F-164复杂真实模型质量/最终分发仍未验收，goal active。
