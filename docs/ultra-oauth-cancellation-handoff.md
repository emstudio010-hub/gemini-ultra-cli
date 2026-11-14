# Gemini Ultra CLI MCP OAuth原生取消交接

日期2026-11-14，WI-221 / E-497至498 / F-179。基线12a0a9ef4d42bf06e5ecef032259b7b799f9d752，分支codex/ultra-agent-portable。上一goal turn为progress（发现总预算与健康服务隔离已推送）。goal active。继续源码→Windows必要定向验证→功能收敛后最终打包；不打包/重装/升版本/多平台CI/付费重跑，全局preview.83保持。

## Evidence → Finding → Path

F-179：此前MCP连接外层可取消，但OAuth工具内部没有生命周期signal，元数据/动态注册/刷新/令牌交换仍可继续；取消刷新被当普通失败时可能删除旧凭据，迟到授权同意可能开浏览器，回调端口可能继续等待。此次把生命周期真正接入OAuth网络和交互，不止让调用者提前返回。

McpClient.createTransport/getStoredOAuthToken/handleAutomaticOAuth和两条自动授权路径向每个新MCPOAuthProvider与DynamicStoredOAuthProvider传连接signal。供给器用构造参数保存，公共authenticate/getValidToken等原调用签名保持；不提供signal的手动调用保留原行为。动态供给器在返回缓存前也检查取消，读取迟到不缓存。

OAuthUtils验证/发现选项新增可选signal，DNS等待用withAbortSignal（不能撤回已启动的系统DNS），HTTP fetch接原生signal，读取JSON也有限期等待，catch先检查取消，禁止把AbortError转换为null后继续下一候选/回退。保留SSRF、资源归属、私网显式许可及issuer策略。注册、HEAD检查、shared oauth-flow交换/刷新HTTP均接原生signal与迟到屏障。

MCPOAuthProvider在所有相关凭据读取、刷新、保存等等待上检查signal，取消原样抛出，不发刷新失败反馈、不删除旧凭据，token未提交前不会启动晚保存。token storage saveToken/setCredentials/deleteCredentials可选signal，在读/建目录后、启动写删之前检查；加密keychain委托前也检查，不声称撤回已启动的系统凭据操作。回调server.cancel现在同时拒绝未完成port与response，监听回调若取消后才到则立即close；authenticate在注册/同意/浏览器等待/回调阶段监听取消并清理端口与listener。

getConsentForOauth可选signal：预取消不展示，交互等待可拒绝并忽略晚确认，终端readline取消或EOF会关闭/结束。ConsentRequestPayload可选signal，AppContainer只清理当前所属弹窗，旧请求取消/旧确认不影响新弹窗，卸载解绑。已开启浏览器不能撤回；没有修改浏览器启动器、Google凭据提供器内部实现、用户配置/令牌/数据库/PATH/工具安装。

## E-497 定向源码检查

初始新suite因实际TokenStorage导入循环未收集（HybridTokenStorage is not a constructor），不计行为基线；按测试用途mock令牌存储后，工具类网络取消已改、供给器未改时7项中6项实际失败、1项通过，退出1；两份原日志/XML保全。另增加注册取消，使新OAuth取消用例共8项。

相关四文件首轮81通过/1失败（共82）：新增OAuth8、authConsent10、issuer回调6、私网/SSRF/参数透传58。唯一失败是无signal时deleteCredentials多传undefined导致旧spy参数不符，实际删除仍正确；改为仅有signal时传可选实参后，针对R4一项通过/57未选。随后共享token响应/取消及storage选择42通过/74未选，其中OAuth8重复、共享flow23、storage11。CLI只选择授权事件3通过/126未选，验证当前取消、旧请求与新弹窗隔离及解绑。合计119个不同相关用例通过（core116+CLI3；新16、既有103），不把重复运行相加，不声称全量。

首core编译报告闭包中tokenUrl/refreshToken收窄丢失，改为const快照后最终core tsc --build退出0；CLI tsc --build退出0。首lint发现新测试3处act返回Promise未await，修正后14个变更TS/TSX最终eslint --max-warnings0退出0；15个代码/文档Prettier及git diff --check退出0。没有全量/冒烟/打包，无依赖或版本变化。

## E-498 Windows实际协议、回调端口与令牌文件

verify-source-oauth-cancellation.mjs使用独立home/profile、实际编译Config/MCP SDK、OAuthProvider/shared flow/plain token storage及原生loopback HTTP。仅在脚本进程模拟TTY标志以走交互事件分支，不把它当原生终端输入验收。fetch只允许自有origin，没有替换Config/SDK/提供器业务方法、没有外部OAuth或模型。

1. metadata：MCP实际401/HEAD挑战后hold protected metadata。dispose使调用者AbortError，服务端观察响应在人工release前且关闭起点2秒内断开；无well-known回退、无晚工具/凭据。
2. registration：实际发现OAuth、分配真实callback端口、动态注册POST被hold。先TCP证实端口监听，dispose后HTTP在release前2秒内断开，端口关闭；释放后无同意步骤、凭据或工具晚写。
3. consent：实际动态注册成功后hold ConsentRequest。dispose后payload.signal已取消、回调端口关闭、初始化取消；再调用旧onConfirm(true)没有authorize HTTP请求、没有凭据写入。浏览器函数不被晚调用由单位用例的spy证明；缺少authorize请求本身不单独当浏览器进程观测。
4. refresh：隔离真实令牌文件预置过期假凭据，SDK动态供给器实际刷新POST被hold。dispose后调用者取消，HTTP在release前2秒内断开；释放后文件SHA完全保持，未误删除旧凭据。
5. exchange：实际shared code exchange POST被hold，AbortController取消使调用者AbortError且HTTP在release前关闭，原文件SHA保持；再做一次正常刷新控制，实际新token成功保存并读回。

27条件全true，首次执行退出0，总20139ms（包括模块导入，不是启动速度基准），22 loopback请求、3 token POST（取消刷新/取消交换/正常刷新），0外部网络模型。finally释放自有hold/dispose配置/恢复fetch与TTY描述符/解绑事件/关闭loopback和DrillStore，realpath核实后只清真实temp下自有ultra-oauth-cancel前缀目录。

## 证据、保全与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：oauth-cancellation-baseline.log/-baseline-junit.xml（初导入夹具错误）；-provider-baseline.log/-provider-baseline-junit.xml（6行为失败）；-tests.log/-junit.xml（初7通过）；-related-tests.log/-related-junit.xml（81通过1旧参数spy失败）；-guard-tests.log/-guard-junit.xml（R4修后通过）；-flow-storage-tests.log/-flow-storage-junit.xml（42通过）；oauth-consent-ui-tests.log/-junit.xml（CLI3通过）；oauth-cancellation-core-compile.log/-final-core-compile.log/-cli-compile.log；-lint.log/-final-lint.log及格式日志；verify-source-oauth-cancellation.mjs、source-oauth-cancellation.log/-result.json；verify-oauth-cancellation-preservation.mjs、source-oauth-cancellation-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466原失败SHA及false、旧临时凭据已删除均保全true。旧被拒清理目录不动。granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话，无子代理/外部扫描。目标池/case更新、Obsidian/源码/工程三份交接全文同SHA；显式stage、skip ci推隔离分支，不合并master/Release。

未验收：外部OAuth账户/实际浏览器批准、原生终端输入、OS keychain原生取消、已启动写删或浏览器动作回滚、Google凭据内部IO、同步CPU抢占、跨平台及最终分发。复杂真实Swarm F-164仍有保留失败，本阶段不证明其质量已修好，不能称整体上线。

## 接续目标（已授权继续）

1. 回到模型配置和Agent协作质量，核对所选供应商/模型与子任务实际路由及错误恢复。
2. 继续深入F-164原始失败证据对应源码，先用离线与本地协议定位，旧任务不付费重跑。
3. 维护目标池与导出Obsidian交接；功能收敛后再做最终Windows及macOS/Linux分发。
