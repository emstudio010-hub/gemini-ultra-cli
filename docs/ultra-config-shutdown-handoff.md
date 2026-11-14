# Gemini Ultra CLI 初始化关闭与迟到就绪隔离交接

日期2026-11-14，WI-214 / E-483至484 / F-172。基线0278e0cd60a3a3b9d7c4cf9bdb0f1337fe825cda，分支codex/ultra-agent-portable。上一goal turn为progress（记忆部分失败恢复已推送）。整体goal active，源码→Windows必要定向验证→功能收敛后统一打包；不打包/重装/升版本/多平台CI/付费重跑，全局preview.83保持。

## Finding → Path

Config.dispose原仅处置当前已有对象，未中止initialize；storage/git/工具等等待完成后仍可继续创建manager/注册监听/标就绪，ready配置关闭后initialized仍true。GeminiClient.dispose原仅解绑事件，未阻止startChat的异步历史/聊天/contextManager迟到赋值。

config.ts增加生命周期controller：initialize入口拒绝已关闭配置，共享initPromise用withAbortSignal立即结束调用方等待；_initialize在每个自有await后检查同一signal，阻止下一阶段；工具注册表先局部准备，关闭检查后才赋值；createToolRegistry入口/逐工具注册/ripgrep返回/最终发现完成均检查生命周期。技能发现和记忆刷新传递signal，聊天初始化也接收signal。dispose先abort并置initialized=false，再沿用资源处置。MCP聚合结束后关闭时不再输出初始化错误日志。

client.ts增加自身生命周期controller，dispose中止所有当前startChat等待；可选外部signal和自身signal合并，历史、GeminiChat.initialize、contextManager准备等待均可取消。contextManager和初始化chat在最后关闭检查后才提交，取消原样抛AbortError，不作为聊天初始化异常另写错误报告。已完成会话的历史未主动清空，供既有退出摘要使用；不声称GeminiClient.isInitialized在曾成功启动后dispose会变false，本轮Config.isInitialized明确变false。

范围：立即停止调用方等待、阻止本层迟到推进/发布；不可取消文件IO、Storage自身注册/迁移、已开始的chat记录、MCP/扩展/Hook/自定义工具发现内部操作可能继续，不等于停止所有进程。当前认证刷新和活动模型生成未纳入此controller。尤其ToolRegistry.discoverAndRegisterToolsFromCommand与MCP/ExtensionLoader自身待后续专门收尾，不能以本轮作为完整退出验收。

## E-483 定向回归

先补齐Config测试中原有off/client.dispose/AgentRegistry.dispose/MCP.stop mocks，再加6项：storage/tools/client三个等待点关闭前立即拒绝、迟到不就绪与早期不创建记忆，ready Config关闭拒绝再初始化；客户端聊天初始化中关闭不发布/不记telemetry，以及关闭后拒绝startChat。原生产代码实际6失败，无夹具错误/未处理拒绝，baseline日志/XML保全。

修后先10项通过；复核增加局部准备/提交检查，并加入4个受影响的既有记忆初始化/技能启动超时或异常检查，最终14通过/367未选中，1.20s测试/26.15s总耗时（非启动性能指标），未全量/冒烟。严格core tsc、4文件eslint --max-warnings0、Prettier与git diff --check均退出0。无新依赖/CLI重编。

## E-484 Windows实际初始化

verify-source-config-shutdown.mjs独立home/workspace，实际编译Config/GeminiClient/Storage/记忆/环境上下文。只通过fs adapter挂起命名runtime目录mkdir、另一Config的workspace readdir，未替换初始化/聊天业务方法。13条件true/6352ms/退出0/0网络模型。

1. runtime mkdir未完成时dispose，initialize在释放IO前已拒绝；未创建AgentRegistry/记忆manager，isInitialized=false。释放后等待原Storage初始化确实收尾，本层仍不继续；同一closed Config拒绝initialize。
2. 另一实际Config已加载记忆、聊天尚未就绪，在真实环境目录树readdir处hold。dispose使调用方在release之前拒绝；release后真实目录读取完成，Config/新client均未变就绪，closed client拒绝startChat。
3. 第三个全新Config正常完整初始化成功，dispose后Config变未就绪，拒绝再启动。没有同一disposed实例自动恢复。

finally释放hold/还原fs及fetch/dispose自有Config和DrillStore；仅删除realpath校验在真实temp下且ultra-config-shutdown前缀的自有根。无真实磁盘故障、终端退出动画、MCP子进程/扩展晚连接、认证或多平台验收。

## 证据、保全与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：config-shutdown-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-final-tests.log/-final-junit.xml、-core-compile.log、-lint.log、-test-format.log/-format.log/-format-check.log；verify-source-config-shutdown.mjs、source-config-shutdown.log/-result.json；verify-config-shutdown-preservation.mjs、source-config-shutdown-preservation.json。

个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466原失败SHA及false、E-466临时凭据删除状态全部true。个人数据库/PATH/工具安装不动，旧被拒清理目录不动。沿用granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话、无子代理或外部扫描。

目标池/case workitems/timeline/field-journal及E-483-484更新，Obsidian/源码docs/工程报告同全文SHA，显式stage、skip ci推隔离分支，不合并master/Release。下一阶段具体审查自定义工具发现命令的prepare/spawn/退出后注册与MCP/扩展内部晚连接收尾，随后继续全需求剩余质量；复杂真实多Agent F-164与最终分发仍未验收，goal保持active。
