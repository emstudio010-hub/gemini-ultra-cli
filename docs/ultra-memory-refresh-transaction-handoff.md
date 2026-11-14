# Gemini Ultra CLI 记忆刷新事务与限时交接

日期2026-11-14。WI-211 / E-477至478 / F-169。基线4950a66739805e2e86cf1d57262e933a68337281，分支codex/ultra-agent-portable。上一goal turn为progress（Agent重载顺序与关闭隔离源码及Windows证据）。整体goal active；源码优先→Windows必要定向验证→功能收敛后统一打包，不打包/重装/升版本/多平台CI/付费任务重跑，全局preview.83保持。

## 缺陷与源码

MemoryContextManager.refresh原开始就清空loadedPaths/loadedFileIdentities，再无时限等待发现/文件身份去重/读取；抛错时旧正文还在而路径已空。并发旧刷新可迟到覆盖新正文，读取卡住又是Config.initialize启动必经等待。

仅memoryContextManager.ts生产修改：每次refresh独立controller/10秒时限、可选外部signal；新refresh中止旧refresh（旧调用方得到AbortError），复用withAbortSignal覆盖发现、去重与内容读取等待。准备阶段只产生局部contentsMap/paths/identities与各层正文，分类及MCP说明也先完整计算；成功且未被中止时一次同步替换四层正文、路径/身份缓存，再发MemoryChanged。失败/超时/取消不清除原快照、不发成功事件，迟到结果不回写。每次finally清timer，仅当前controller能清当前请求引用。

MemoryRefreshTimeoutError双语说明检查记忆文件、/memory refresh或启动失败时重启。与可选技能/Agent目录不同，首次记忆超时原样使初始化失败，不静默跳过可能包含用户约束的GEMINI.md。getEnvironmentMemory随当前信任状态返回内容，撤销信任后不因保留旧快照继续暴露项目正文。

范围边界：withAbortSignal结束等待/拒绝发布；本轮未给memoryDiscovery各个文件系统/导入递归原语传新signal，不保证取消底层不可取消IO或后台解析。同步解析也不能被timer抢占。单文件错误被既有readGeminiMdFiles处理为null的兼容行为未变，本轮快照保全针对抛出/取消/超时，不声称所有缺失文件均保留旧内容。JIT discoverContext的并发/时限和Config.dispose下的记忆加载生命周期未改，仍待后续审查，不以本轮证明全部记忆任务可取消。

## E-477 定向回归

新增6个展开用例（其中中英文时限展开为2项）：发现失败保留正文/路径/事件；中英时限与迟到文件隔离；新刷新取代旧刷新仅发布新内容；外部取消保持路径；分类失败保留快照并撤销信任后项目正文不可读。与既有8项共14项通过，59ms测试/2.06s总耗时，非性能基准。

用git show读取原始HEAD manager，先备份本轮提案源码，再临时运行单个“发现失败保留路径”用例，实际旧路径变[]、退出1，finally恢复本轮源码；无reset/用户修改覆盖。原版无时限的无限等待没有另外卡住运行，源码直接可达性与修后真实时限分列。

core严格tsc、双文件eslint --max-warnings0、Prettier及git diff --check退出0。无全量/冒烟、CLI重编或新依赖。

## E-478 Windows实际Config与记忆文件

verify-source-memory-refresh-transaction.mjs独立home/workspace，真实Config.initialize/refreshMcpContext、GEMINI.md发现/身份去重/导入处理；fs adapter只hold命名fixture全局GEMINI.md读取，不替换memory manager业务方法。初始规则与路径加载正常。

1. 已初始化Config触发refreshMcpContext，hold读取超过实际10秒，得到带/memory refresh的MemoryRefreshTimeoutError；原正文与路径逐字保持、无MemoryChanged。释放迟到读取后仍保持旧正文；恢复正常读取并明确再刷新，更新规则及路径一次发布。
2. 新的Config冷初始化也hold相同文件读取，超过实际10秒返回同类错误、isInitialized=false；释放迟到读取，冷manager正文仍空/路径0，没有静默采用过期或不完整规则。恢复读取、dispose失败Config，创建全新Config初始化成功，读到更新规则；这证明“修复后重新初始化”，不是同一个拒绝initPromise自动重试。

最终11条件true、0网络/模型、退出0。总耗时见source-memory-refresh-transaction-result.json（包含两次真实10秒期限，非普通启动基准）。没有真实网络盘故障、终端错误渲染或模型遵从规则质量验收。

首次验证器误调用不存在的config.refreshMemory，实际API为refreshMcpContext；在任何受控超时前退出，保全verifier-method-failure日志。改方法后所有超时/快照条件true，但两个文件路径断言直接比较Windows斜杠形式导致false，保全path-check-failure日志/结果；仅把验证器文件身份比较改为path.resolve等价后重跑通过，未改产品迁就断言。原始失败输出不覆盖。

finally恢复fs/fetch、解绑MemoryChanged监听、dispose自有Config/DrillStore、仅清理自有前缀临时根。个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466失败SHA和passed=false及E-466临时凭据删除状态全部保全true。

## 证据与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：memory-refresh-transaction-tests.log/-junit.xml（14项）、-core-compile.log、-lint.log、-format.log/-format-check.log；reproduce-memory-refresh-path-loss.mjs、memory-refresh-path-loss-before.log/-before-junit.xml、memory-refresh-transaction-proposed.ts；verify-source-memory-refresh-transaction.mjs、source-memory-refresh-transaction.log/-result.json、-verifier-method-failure.log、-path-check-failure.log/-path-check-failure-result.json；verify-memory-refresh-transaction-preservation.mjs、source-memory-refresh-transaction-preservation.json。

沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理或外部扫描。未改个人数据库/工具安装/PATH，旧被拒清理目录不动。目标池/case四项和证据更新，三份交接同SHA；显式stage、skip ci推隔离分支，不合并master/Release。JIT记忆等待、其他初始化及F-164复杂真实模型质量/最终分发仍未验收，goal active。
