# Gemini Ultra CLI 按需记忆等待与关闭隔离交接

日期2026-11-14。WI-212 / E-479至480 / F-170。基线6063622d5bb88f20afad3e37e3683b4e9eb0d9d3（上一轮记忆刷新事务已推送），分支codex/ultra-agent-portable。goal active，源码优先→Windows必要定向验证→最后功能收敛后统一打包。无打包/重装/升版本/多平台CI/付费重跑，全局preview.83保持。接续首先读本Obsidian交接。

## 缺陷、实现与范围

文件工具主要工作完成后，discoverJitContext仍无界等待MemoryContextManager.discoverContext的子目录GEMINI.md；原管理器并发读相同旧缓存、在撤信/刷新/关闭后可返回迟到正文并标为已加载。原Config.dispose没有处置记忆管理器。

MemoryContextManager新增每请求10秒时限（包括排队与等待当前refresh）、可选调用方signal、JIT串行队列和独立代际controller。执行时等待前序和当前刷新结束，再把已加载路径/文件身份的副本交给loader。只有成功读取、仍受信任且未取消时才格式化并提交路径/身份；格式化先于标记。新refresh中止旧代所有JIT，新代请求等待刷新快照；dispose中止活动refresh与活动/排队JIT并拒绝后续入口。排队请求取消立即返回，但队列屏障仍等待活动前序，不让第三请求越过。Config.dispose首先处置现有记忆管理器。read_file/list_directory/read_many_files/write_file/replace五条工具链把执行signal经discoverJitContext传给manager。

MemoryContextTimeoutError提供中英说明；现有discoverJitContext继续把补充上下文错误转空串，文件主要操作结果保留。本轮没有新增终端超时警告，直接manager调用才得到该错误。工具写入如果已完成，不因补充读取取消而回滚。刷新必需规则首次超时仍沿WI-211明确失败，不等同于这里补充记忆的兼容处理。

边界：取消结束等待和阻止发布，没有向memoryDiscovery所有原生IO/递归解析传新signal，后台不可取消IO/同步解析可能继续；每次JIT请求10秒，不是整个批量文件工具/整启动总上限。Config.dispose覆盖已创建的manager，不冒称已补全dispose发生在整个Config.initialize早期、manager尚未赋值的生命周期。原memoryDiscovery对单文件读取错误返回null、fileIdentities与成功files对应关系仍需继续审查；本轮没有改该层或证明所有读取失败均可正确重试。JIT原有不发MemoryChanged的行为保持。

## E-479 源码回归

原版用git show HEAD读取，先备份提案、临时换manager单文件、只运行并发缓存及撤信两项，finally原样恢复，不用reset。两项均失败：第二请求提前读取旧身份缓存，撤信后仍返回Scoped rule。首测试mock内断言还触发一个未处理拒绝，首输出保全；将断言改为记录快照后再核对，refined原版复现仍2失败且无Unhandled Rejection。不是将原产品失败改成通过。

修后manager21项+helper9项=30通过；新增manager7个展开用例（中英文timeout为2）及helper1项，既有22项。随后仅对调整断言的并发/排队2项复核通过，不累计成45项。五工具仅筛选JIT context discovery，13通过/207未选中；首有1条旧两参数expect未包含新增signal，保留initial-argument-failure日志/XML，补断言后通过。合计43个不同定向检查通过，非全量/冒烟。

core严格tsc最终退出0（编译产生Windows实际验证所用dist），12个改动文件eslint --max-warnings0退出0，Prettier最终检查与git diff --check退出0。一次单测试格式命令从packages/core误寻根node_modules失败，原日志保全；改回仓库根后成功。无新依赖/CLI重编。实际Windows后只改测试断言位置/格式和helper注释，生产行为未变，不重复实际验证。

## E-480 Windows实际文件与Config

verify-source-jit-memory-lifecycle.mjs独立home/workspace、实际编译Config与ReadFileTool，真实GEMINI.md发现/文件身份去重/导入解析；fs adapter只hold指定临时GEMINI.md读取，未替换manager或工具业务方法。创建子目录在首次初始化之后。17条件true，28230ms，退出0，0网络/模型。

- ReadFileTool补充读取实际超过10秒后返回PAYLOAD正文、不带未完成规则且不标缓存；释放迟到读取仍不标，明确重试正常附规则，后续读取不重复附规则。
- 实际ReadFileTool执行signal取消后立即结束补充等待、仍返回已读正文；迟到读取不进缓存。
- 同目录第一读取hold，第二排队取消，第三100ms观察仍未越过；释放第一后仅一份规则返回，第三空、该GEMINI.md实际只读一次，身份去重成立。
- 新refreshMcpContext中止旧JIT，迟到结果不重填路径，随后文件操作加载当前规则。
- Config.dispose中止活动JIT、拒绝新JIT、释放后不发布。第二真实Config的refreshMcpContext hold全局GEMINI.md时dispose，中止refresh，释放后原正文/路径保持。

finally释放各自hold、恢复fs/fetch、dispose自有Config/DrillStore。仅清理realpath校验过、位于真实temp且ultra-jit-lifecycle前缀的自有根。无真实网络共享故障、终端取消渲染、跨机器/跨平台验收。

## 保全、证据与接续

个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466的失败SHA及passed=false、E-466临时凭据已删除全部true；无个人数据库/PATH/工具安装改动，旧被拒清理目录不动。沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话、无Codex子代理或外部扫描。WI-211交接测试计数更正为新增6+既有8=14，三份同步SHA536f3171363ad9a23f4f13fe9d22351b0176306c1227cef722acc11d0a071827。

工程证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：jit-memory-lifecycle-tests.log/-junit.xml、-final-tests.log/-final-junit.xml、-refined-tests.log/-refined-junit.xml、-core-compile.log/-final-core-compile.log、-lint.log/-final-lint.log、各format日志及-final-format-check.log；jit-memory-tool-integration-tests.log/-junit.xml、-initial-argument-failure.log/-initial-argument-failure-junit.xml、-final-tests.log/-final-junit.xml；reproduce-jit-memory-publication.mjs及refined脚本、jit-memory-publication-before.log/-before-junit.xml及-refined-before.log/-refined-before-junit.xml、两份proposed.ts；verify-source-jit-memory-lifecycle.mjs、source-jit-memory-lifecycle.log/-result.json；verify-jit-memory-lifecycle-preservation.mjs、source-jit-memory-lifecycle-preservation.json。

目标池/case workitems/timeline/field-journal及E-479-480更新，Obsidian/源码docs/工程报告同全文SHA，显式stage与skip ci推隔离分支，不合并master/Release。下轮继续审查JIT成功文件与身份缓存对应、Config早期关闭生命周期及全需求剩余质量；真实多Agent复杂推理F-164仍开放，三次真实失败保全不付费重跑，最终分发未验收，goal继续active。
