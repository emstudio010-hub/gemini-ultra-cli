# Gemini Ultra CLI 供应商旧界面目标交接

日期：2026-11-13。WI-136 / E-326至327 /
F-095。持续目标active。保持源码优先、Windows必要定向验证、最终统一打包。全局安装仍preview.83，本轮没有打包、全局重装、版本变化或跨平台CI。

## 修复内容

F-095：上一轮核心持久化ID已严格解析，但界面和演练台调用仍存在名称别名回退。配置窗口打开research目标后，若它在同进程被删除、剩余供应商显示名恰为Research，旧删除确认可删除剩余记录；旧模型清单保存可修改剩余供应商，Ctrl+R可读取错误凭据并请求目录。没有同名记录时，旧模型保存也可能误走新建分支。演练台provider-models请求则会读取同名记录的凭据；保存接口虽被核心拒绝，返回的是500而非目标不存在的404。

新增removeProviderById只删除精确ID；通用removeProvider保持原名称别名语义，通过解析一次再调用严格删除。配置窗口的删除确认使用严格接口，目标不存在时保留页面并提示错误；模型清单刷新和保存使用getProviderById，旧ID不存在就拒绝，不请求目录、不新建或修改同名供应商，保留草稿。演练台模型目录与保存的input.id使用严格查找，失效统一404，不读取另一供应商的凭据。正常新建、普通名称查询和正常模型默认值保持。

## 必要验证

E-326：3个旧界面场景实际失败（删除确认、保存清单、刷新清单）。修后Windows
Ink真实组件交互3项及原非首默认模型保留2个相关对照通过，1项未相关场景跳过；核心严格删除与通用名称删除兼容1项及已有ID优先3个对照通过，共9项。没有全量/冒烟或新增真实模型任务。

packages/cli命令：`npx vitest run src/ui/components/ProviderConfigDialog.test.tsx --coverage.enabled=false --testNamePattern='keeps a same-name provider intact|preserves a retained non-first default'`；packages/core命令：`npx vitest run src/providers/providerManager.test.ts --coverage.enabled=false --testNamePattern='refuses stale ID-only deletion|prioritizes a stable provider ID'`。core及CLI分别`npx tsc -p packages/core/tsconfig.json`、`npx tsc -p packages/cli/tsconfig.json`严格检查并编译源码；首CLI类型检查发现新增测试mock误带imageModels字段，修正为真实返回类型后退出0。5个修改源码/测试文件eslint退出0。没有调用package构建脚本。

E-327：Windows Node v24.19.0实际编译源码Drill Cockpit
HTTP服务，最小会话、隔离配置、假凭据和本机目录计数器。旧实现实际目录接口200并发出1次错误目录请求，保存接口500；保留原失败记录。修后两接口均404，目录端点0请求，配置文件及剩余供应商保持，5条件通过，5815ms/退出0。旧预期失败退出时验证进程还出现Windows
libuv
handle-closing断言，原日志及异常退出码保留；最终成功运行正常退出0，未改产品清理逻辑以回避该负向观察器的退出问题。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。provider-stale-ui-before.log/-junit.xml、provider-stale-ui.log/-junit.xml、provider-stale-id-core.log/-junit.xml、provider-stale-id-core-compile.log、provider-stale-id-cli-compile.log（首类型错误）、provider-stale-id-cli-compile-corrected.log、provider-stale-id-lint.log、verify-source-provider-stale-cockpit.mjs、source-provider-stale-cockpit-before-result.json/-before.log、source-provider-stale-cockpit-result.json、source-provider-stale-cockpit.log。辅助脚本不随包分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由当前会话承担。此次为终端组件逻辑和本地HTTP行为修复，没有视觉设计变更。没有个人供应商编辑、个人数据库修改、外部安全目标、付费任务重跑或原生逆向工具执行。个人locale/provider
SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 /
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

验证为已加载配置的同进程删除，未新增跨进程热刷新、浏览器视觉或本轮独立ConPTY验收；Ink组件测试不冒称完整终端进程验收。已在删除前发起的目录请求不在本轮取消范围，旧业务数据不自动还原。真实模型质量、其他源码功能收敛及最终Windows/macOS/Linux分发仍未完成，持续目标保持active。隔离codex分支同步带skip
ci，不合并master或正式Release。
