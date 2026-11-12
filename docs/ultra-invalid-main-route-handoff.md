# Gemini Ultra CLI 主模型无效路由交接

日期：2026-11-13。WI-137 / E-328至329 /
F-096。持续目标active。源码优先、Windows必要定向验证、最后统一打包。全局安装仍preview.83，本轮没有打包、重装、版本变化或跨平台CI。

## 修复

F-096：主模型请求携带未配置的provider:model前缀时，UniversalContentGenerator原先解析不到外部供应商就返回null，进入原生fallback。gateway模式下会得到ExternalFallbackGenerator错误，其他认证模式可能进入原生生成器；请求预算在解析前已记账。本地故障还会被Turn当作API错误生成报告。成员模型此前已有严格校验，但不能代替主请求路径。

现在先用既有解析器匹配已登记供应商或裸模型；未解析且含供应商前缀的请求抛轻量ProviderRouteError，按当前语言提示/provider
list与/model，不回显用户输入或凭据。已登记的含冒号裸模型（例如local-model:latest）仍可正常匹配；明确的native成员作用域仍保留原行为。未知无前缀裸模型的既有原生fallback规则未改变。

生成及流式生成均先解析路由，再进行Swarm/工作流调度预算记账；token计算和容量读取也不会将失效前缀交给原生生成器。Turn对该本地错误直接返回错误事件，不创建API故障报告或schema深度诊断；真实API错误仍按原规则报告。仍错误退出，不伪装任务完成，不自动切换供应商、修改选择或重试。

## 必要证据

E-328：旧4项生成/流式/token/容量复现及Turn本地错误分支均失败，已登记冒号裸模型对照旧实现通过。修后5项加上述裸模型、显式native成员、普通API故障对照，共8项通过，31项不相关场景跳过。strict
core类型检查及源码编译、5个修改文件eslint退出0。首类型检查发现新增测试回调联合返回推断问题，改为Promise<unknown>后编译成功；原日志保留，没有改变产品实现来适配检查。

packages/core命令：`npx vitest run src/agents/agentModelRouting.test.ts src/core/turn.test.ts --coverage.enabled=false --testNamePattern='rejects an unavailable main provider prefix|returns a local provider route error|configured bare model containing a colon|should yield Error event and report if sendMessageStream throws|selects native fallback explicitly'`。根目录`npx tsc -p packages/core/tsconfig.json`只编译源码，未运行package构建脚本。没有全量/冒烟或付费任务重跑。

E-329：Windows Node
v24.19.0实际源码CLI非交互入口，隔离gateway配置、loopback端点、preload预置同进程active
Boost预算，执行`-m missing-provider:fixture -p <夹具提示> --output-format json`。9419ms，CLI预期退出1、无超时，stderr
JSON类型ProviderRouteError及对应诊断；无Gemini
API故障报告、0端点请求、预算文件与供应商文件字节保持。验证器本身退出0。首次入口核对在编译终态确认前启动，因类型错误未更新的产物仍走旧fallback、预算改变，6条件中3项失败；已保存stale-compile原输出/结果并明确不作为最终源码证据。修正类型、确认编译退出0和当前模块后才重新核对并通过。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。provider-invalid-route-before.log/-junit.xml、provider-invalid-route.log/-junit.xml、provider-invalid-route-source-compile.log（首类型错误）、provider-invalid-route-source-compile-corrected.log、provider-invalid-route-lint.log、seed-source-invalid-provider.mjs、verify-source-invalid-provider-cli.mjs、source-invalid-provider-cli-output.txt、source-invalid-provider-cli-result.json、source-invalid-provider-cli.log、source-invalid-provider-cli-stale-compile-output.txt/-result.json/.log。辅助脚本不随包分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由当前会话承担。没有真实模型调用、外部安全目标、个人数据库修改或原生逆向工具执行。个人locale/provider
SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 /
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

这里覆盖显式前缀不可解析，不保证所有无前缀模型ID都能在本地识别；额度记账仍为应用级模型调度而非SDK内部HTTP重试。实际终端为非交互源码入口，不是新ConPTY/配置窗口/真实供应商或最终跨平台验收。源码完整性、复杂长任务及最终Windows/macOS/Linux交付仍待收敛，目标保持active。隔离codex分支同步带skip
ci，不合并master或正式Release。
