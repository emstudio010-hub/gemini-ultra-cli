# Gemini Ultra CLI 多会话策略隔离交接

2026-11-15；WI-252 / E-559至560 / F-210。基线277171122fd93d5523606a08d3b43a9ee34464d1，分支codex/ultra-agent-portable。上一goal turn是progress（辅助取消已推送）。goal active；源码→Windows必要定向验证→功能收敛后最终三平台包，preview.83保留。无打包/重装/升版/三平台CI/付费重跑/子代理。

## Evidence → Finding → Path

F-210：Config构造时把全局Conseca单例setContext成最后一个Config，CheckerRegistry的静态内置Map又持有同一实例。一个Config创建/关闭可使其他Config的检查使用错误上下文或被关闭信号拒绝。缓存只比较userPrompt，不区分Config/trusted工具集合；check在await getPolicy后使用共享currentPolicy，另一检查更新缓存会使本检查执行错误策略；standalone重新setContext时迟到请求可覆盖新上下文缓存。

修复：getInstance(context)以WeakMap<Config,checker>保存所属实例，Config向自身CheckerRegistry传入context并注册所属检查器，registry解析Conseca优先取该Config实例；不带context的standalone接口保留，生产Config不再写它。缓存命中同时要求Config、prompt和trustedContent一致；setContext换Config清缓存；请求完成前后context对象不同则只返回原调用方的结果，不写新context缓存。check固定本次context和返回的局部policy，执行与遥测都使用该局部值。默认disabled、普通错误回退、模型选择、预算/重试策略保持。WeakMap不引入全局强引用Config表。

## E-559 必要源码证据

新增contextIsolation六项覆盖真实PolicyEngine/Registry Config归属及关闭互不影响、disabled不被另一个enabled激活、工具schema改变缓存失效/精确命中复用、standalone显式Config不串cache、上下文替换时旧pending不覆盖新cache，以及同Config并发更新cache后仍执行本次返回policy。

初baseline六项5失败/1通过；其中真实engine场景未初始化聊天，ContextBuilder读历史先失败，不能用此项当旧生产缺陷的行为证据。其余四项缓存/交错错误实际失败；强化交错case为唯一marker后单项旧源码再验仍失败/5未选，保留两套baseline。修后首30项28通过/2 engine因同一夹具初始化缺口失败，原日志/JUnit保留；仅补fixture getHistory空历史，不改生产绕过检查，再补两engine项通过/4未选，不重复28已过项。合计30不同相关检查（新6、旧checker10/registry4/integration1/取消9）。旧取消测试取所属Config实例；standalone兼容检查仍通过。

core首与最终tsc --build均退出0；首lint仅新测试五处one-var，机械fix后并行的第一次final lint读到修正前内容仍失败，原日志保留；fix/格式结束后clean-lint五TS零warning，五文件prettier check和diff退出0。无全量/冒烟/CLI重编。

工程前缀conseca-context：baseline.log/-baseline-junit.xml、interleave-baseline.log/-interleave-baseline-junit.xml；tests.log/-junit.xml、engine-tests.log/-engine-junit.xml；core-compile.log/-final-core-compile.log；lint.log/-lint-fix.log/-final-lint.log/-clean-lint.log；format-write.log/-format-followup.log/-format.log。主定向vitest仅contextIsolation/conseca/integration/registry/helperCancellation五文件；补验两engine与单交错分别选题名，coverage disabled。

## E-560 Windows实际多会话链

verify-source-conseca-context.mjs独立home/profile/workspace，真实两个同时初始化Config（含ready chat）、PolicyEngine/CheckerRunner/Registry/Conseca/Universal Chat HTTP。A/B通过各自显式成员模型scope指向同一loopback服务不同路径，服务端核对执行请求包含所属policy marker，没有执行read_file工具。仅脚本开始/最终reset测试singleton，各Config间不reset，无替代checker结果或生成器mock。

相同prompt的A/B各生成/执行两请求、各自缓存；B执行HTTP hold时A可独立检查；dispose B后27ms在1500ms观察窗内结束原HTTP/socket，CheckerRunner沿原逻辑DENY且server未释放，A仍活并只复用自己的policy再发执行请求；closed B零请求；释放迟到B响应不改A缓存；第三disabled Config检查ALLOW且无HTTP，所有执行请求policy marker归属正确。

12条件全true/11105ms总/首次退出0，7个loopback请求/0外部fetch/真实供应商付费/自动重试/旧任务重跑，provider字节保持。保存source-conseca-context-windows.log/-result.json。finally释放自有响应、dispose Config、恢复fetch/DrillStore/测试singleton、关自有server，经realpath父目录及前缀核验仅清自建temp。

## 保全与接续

verify-conseca-context-preservation.mjs及source-conseca-context-preservation.json确认个人provider/locale/skill-tags精确SHA、ultra-tools不存在/全局83、四旧真实失败精确SHA与passed=false、ULQ临时凭据删除均true。历史未跟踪文件/个人数据库/PATH/工具安装不动。沿用granted R26 code-audit及docs-generator，lead/cae/doc同会话，三份同SHA交接和目标池/case同步，显式stage、skip ci推隔离分支，不合master/Release。

边界：此证据是多Config策略归属，非实际LLM策略质量、完整Swarm协作或全部全局服务隔离。带context的检查器绑定首次Config上下文；任意外部直接调用setContext等内部API不属于保证。下一项回到启动冷加载和剩余功能收敛，保持六项目标、真实失败及最终分发未验收边界，不据本地通过关闭goal。
