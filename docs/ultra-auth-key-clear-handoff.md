# Gemini Ultra CLI 密钥保存与清除统一排序交接

日期：2026-11-13。WI-171 / E-395至396 / F-128。源码基线 0c220f1433b6a9824c9a032d694a394f42a743c7，分支 codex/ultra-agent-portable，整体 goal active。上一轮已将手工提交归入useAuth，本轮消除提交与Ctrl+C清除的独立队列和迟到界面更新。继续源码优先、Windows必要定向验证，最终Windows/macOS/Linux包后置；未打包、重装、升版本、多平台CI或重跑付费任务，全局preview.83保持。

## 修复范围

先前submit保存只在useAuth自己的队列中串行，ApiAuthDialog直接调用clearApiKey，二者可并行；在保存未完成时Ctrl+C先删除，随后旧保存仍可把密钥写回。清除包装Promise在取消后不再resolve/reject，且旧清除成功还可能清空用户后来编辑/提交的内容。

现在useAuth新增handleApiKeyClear，与submit共用keyMutationQueue、authAttempt和controller。清除使旧提交失效，等已开始保存结束后再删除；新提交也等已开始的删除结束后再保存。已经失效的排队清除不派发，已开始的删除不能撤回，但完成后只由当前尝试发布结果。成功清除发布空默认值/清除旧错误，返回true；取消、卸载、被更新提交取代或删除失败返回false，不把旧结果发布成当前成功。

UIActions、AppContainer和DialogManager显式接线handleApiKeyClear；ApiAuthDialog改为请求这一owner回调，移除直接存储调用和不会结束的取消包装Promise。其本地mounted/clear编号在新清除、提交、Esc和卸载时更新，只有当前且成功的清除才可清空输入；通过最新buffer引用和清除前内容比较，保护期间新输入。上一轮Ctrl+C专用Critical优先级与迟到默认值不覆盖编辑保持。

core.clearApiKey新增可选throwOnError。既有无参数调用仍保持原记录错误/不抛出的行为；本UI明确传throwOnError:true，存储删除失败会拒绝，useAuth发布双语固定诊断，不把异常详情或凭据拼入错误。显式严格路径在抛出前不记录底层异常；默认旧路径不变。本轮不扩展成所有凭据消费者的统一全局事务。

## Evidence → Finding → Path

E-395：core/apiKeyCredentialStorage.test.ts本文件9项通过，新增严格清除失败拒绝，对照原无参数清除失败不抛出及save/load/cache行为保持。CLI只运行本次相关组共23项：14个手工提交/清除场景、ApiAuthDialog的8个输入/清除场景和1个AppContainer接线场景。新增hook5项覆盖save→clear排序和旧auth阻断、clear→新save排序和旧结果失效、排队清除取消、在途清除卸载、严格删除错误脱敏及后续保存可继续；新增窗口5项覆盖清除期间编辑、提交、Esc、卸载和owner返回false后不擦掉输入。App接线断言同时核对submit与clear。合计32个不同相关场景全部通过。

测试全部使用存储mock/回调fixture，无个人ProviderManager或凭据库操作。直接函数测试不替代实际快捷键路由；那一部分由E-396验证。不将旧源码缺新增API视为旧缺陷复现，本轮无这类旧失败计数，也无失败重跑。未跑全量/冒烟或更新快照。

core严格源码编译结束后才运行CLI严格源码编译，均退出0；11个受影响文件eslint退出0、0warning，prettier --check及git diff --check退出0。React act日志保留，不隐藏。未新增全局依赖或改个人工具路径。

复现：packages/core下 npx vitest run src/core/apiKeyCredentialStorage.test.ts --coverage.enabled=false；
packages/cli下 npx vitest run src/ui/auth/useAuth.test.tsx src/ui/auth/ApiAuthDialog.test.tsx src/ui/AppContainer.test.tsx -t 'manual API key submission|newer input after|saved default arrives later|clearApiKey|routes manual API' --coverage.enabled=false；
仓库根依次 npx tsc -p packages/core/tsconfig.json 与 npx tsc -p packages/cli/tsconfig.json。

E-396：Windows Node v24.19.0实际源码CLI、ConPTY、AppContainer、DialogManager、ApiAuthDialog、useAuth、真实saveApiKey/clearApiKey封装和真实Config/API-key生成器工厂。只有API-key服务的HybridTokenStorage方法使用进程内假凭据，首保存通过loopback屏障挂起；不接触真实OS凭据库、不打印或持久化真实密钥。

真实按键：/auth → 下移两项选择Gemini API Key → 输入假旧密钥并Enter → 确认旧save仍挂起 → 按Ctrl+C但不退出窗口 → 等500ms核对尚无删除事件 → 释放旧save → 核对实际save结束后才有删除、删除时确实已有密钥且activeWrites=0 → resize重绘，同一表单显示空输入/placeholder且没有旧认证 → 输入假新密钥并Enter → 第三次真实Config认证完成 → /stats session → /quit。

6步/22条件全部通过，17006ms，CLI/验证器退出0；恰好1个本地保存屏障HTTP、0模型请求/外部fetch/自动重试。事件严格save1-end < key-deleted < save2-start，两次写入activeWrites均为1。删除发生前实际已有旧保存结果，故不是删除空记录就声称修复写回；删除完成后旧auth没有启动，新提交保存了正确假密钥并带signal成功初始化。首运行通过，没有重复执行该原生场景。

独立provider记录保持，只有显式原生选择清除activeProviderId/activeModel；settings仅selectedType按用户显式选择变更，其他内容保持。终端包含实际键入的FAKE_*，无真实凭据和假网关FAKE_NOT_SENT。该观测不是Google凭据有效性或模型质量验证。

F-128 → Path：auth/useAuth.ts与auth/ApiAuthDialog.tsx分别调submit保存和clear删除，缺跨入口归属及串行；窗口取消包装Promise不结算。共享owner队列、成功布尔回执、本地clear编号和最新buffer检查修复这些路径；core/apiKeyCredentialStorage.ts显式严格选项使真实删除错误可以上达UI。

## 证据与接续

工程根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：

- auth-key-clear-core-test.log / -core-junit.xml、auth-key-clear-cli-test.log / -cli-junit.xml；
- auth-key-clear-core-compile.log、auth-key-clear-cli-compile.log、auth-key-clear-lint.log；
- auth-key-clear-format.log、auth-key-clear-input-format.log、auth-key-clear-final-format.log；
- prepare-auth-key-clear-verifier.mjs、observe-source-auth-key-clear.mjs、verify-source-auth-key-clear.mjs；
- source-auth-key-clear.log / -result.json / -terminal-output.txt；
- check-auth-key-clear-evidence.mjs、auth-key-clear-evidence-summary.json；
- verify-auth-key-clear-preservation.mjs、source-auth-key-clear-preservation.json。

保全passed=true：个人provider/locale/config/skill-tags.json精确SHA保持，旧E-294/E-364两个真实Swarm失败文件SHA与passed=false保持；ultra-tools.json不存在、全局1.0.0-preview.83。未改个人配置、数据库、真实凭据、工具安装或PATH，未重跑付费任务。原生验证独立profile/workspace，关闭服务/终端后核对mkdtemp绝对父目录和专用前缀再清理。

沿用granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit，同会话lead/cae/doc，无Codex子代理或外部扫描。维护目标池/workitems/timeline/field-journal，源码/工程/Obsidian三份全文SHA一致；显式提交本轮文件、推隔离codex分支并skip ci，不合并master、不Release。

队列仅覆盖同一useAuth实例的UI submit/clear，不序列化其他窗口/进程/直接core调用。已经开始的OS保存或删除不能取消/回滚，操作挂起时仍只允许取消UI与使排队项失效，未新增凭据库总超时。严格删除失败由mock证明；原生实际存储为内存fixture，没有真实系统Credential Manager接受证据。缓存并发读取和跨入口其他调用仍需审查，legacy AppContainer认证选择handler也未收敛。真实Google登录、付费模型质量、最终包/跨平台未验收。复杂真实Swarm的E-294/E-364仍失败，完整Agent上线目标保持active。
