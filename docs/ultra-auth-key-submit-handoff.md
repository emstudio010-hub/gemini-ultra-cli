# Gemini Ultra CLI 手工密钥提交归属与输入保留交接

日期：2026-11-13。WI-170 / E-393至394 / F-127。源码基线 8c6ab1060e0541d74874058780a72bb5fc20f058，分支 codex/ultra-agent-portable，整体 goal active。继续源码优先、Windows 必要定向验证，最终各平台包后置；无打包、重装、升版本、多平台 CI 或付费任务重跑，全局 preview.83 保持。

## 修复范围

AppContainer 原手工提交依次等待 saveApiKey、reloadApiKey、refreshAuth，没有尝试归属；取消/新提交后旧结果仍可启动登录、发布错误、标已认证。并行保存还有旧写入最后完成的问题。

现在 handleApiKeySubmit 归入 useAuth，与自动认证共享 authAttempt、controller、卸载失效和 setAuthState 的同步取消。AppContainer 直接向 UIActions 传递此钩子处理器，删除原独立实现。在保存、重新读取、启动认证及返回后检查当前尝试和认证方式；refreshAuth 传第五参数 signal，取消后的旧结果不发布。完成后先解除 UI 对 controller 的持有，再发布已认证状态，保持 core 对成功认证后轮询的归属。

同一钩子实例的提交写入通过 Promise 队列串行。已经开始的凭据写入不能撤回，允许结束但不再触发旧认证；已失效的排队保存不开始；较新提交等较早写入结束后才保存，避免旧提交最后覆盖新密钥。保存失败不毒化后续队列。空输入双语提示，保存/读取失败与认证失败使用不同的固定双语诊断，不把底层异常或密钥拼进错误信息。

原生验证发现两个相邻问题并修复：

1. DialogManager 原以 apiKeyDefaultValue 为 ApiAuthDialog 的 React key，迟到的已保存密钥读取会重新挂载输入框，清掉用户刚输入的内容。现移除该 key；ApiAuthDialog 记录已应用默认值和编辑状态，只向未编辑的输入填入迟到默认值，提交/清空也标记已编辑。
2. ApiAuthDialog 的 Ctrl+C 删除凭据处理器为 Normal，TextInput 的 High 处理器先清空文字并吞掉按键，实际没有删除已保存密钥。现此模态专用处理器使用 Critical，只消费 CLEAR_INPUT，其余输入继续下传。原生验证确认同一次按键到达真实 clearApiKey 和隔离存储删除边界。

## Evidence → Finding → Path

E-393：useAuth.test.tsx 本文件49项通过，包括9个新增手工提交场景：保存resolve/reject后取消、重新读取期间取消、保存串行且只认证最新输入、已取消排队保存跳过、core认证时取消/卸载及脱敏保存/认证失败；40个原认证归属/信号/密钥加载/复用对照保持。不是因新增API旧源码不存在就宣称复现旧bug，本轮没有这类旧源码失败计数。

AppContainer仅新增提交接线场景，1项通过，直接确认 UIActions 接的是共享钩子回调并转发输入；没有跑其余127项。ApiAuthDialog最后3项通过：迟到默认值保留已编辑输入、填充未编辑输入、Ctrl+C删除凭据/清空及Critical选项。check-auth-key-submit-evidence.mjs合并共53个不同相关场景，全部通过，无全量/冒烟。

首lint两个合并let声明已拆开。ApiAuthDialog新增正向默认值用例首轮1过1失败，原因是可变mock buffer配合终端waitUntilReady没有产生期望的重绘；改为act内rerender后观察字段/回调合同，不把mock绘制同步问题归为产品故障。一次格式命令工作目录重复前缀，未触及源文件，已从仓库根纠正。最终七文件eslint/prettier、strict CLI源码编译与git diff --check均退出0；首失败日志保留。React act日志仍在。core本轮未改，不重复core编译/检查。

复现：packages/cli下 npx vitest run src/ui/auth/useAuth.test.tsx --coverage.enabled=false；
AppContainer.test.tsx -t 'routes manual API key submissions'；
ApiAuthDialog.test.tsx -t 'saved default arrives later|clearApiKey'。
仓库根 npx tsc -p packages/cli/tsconfig.json。

E-394：Windows Node v24.19.0，实际源码CLI/ConPTY/AppContainer/ApiAuthDialog/useAuth/真实Config及API-key生成器工厂。只对API-key服务的HybridTokenStorage方法使用进程内假凭据，首次保存用loopback屏障延后；不调用真实OS凭据库、不保存真实密钥。真实saveApiKey/loadApiKey缓存封装及core认证路径保留，未替换成假的refreshAuth。

实际按键：/auth → 下移两项选Gemini API Key → 页面刚出现即输入假旧密钥并Enter → 确认存储保存已挂起 → Esc回选择 → 释放旧保存并确认完成 → resize重绘，仍在选择且没有第三次认证 → Enter重新进入密钥输入 → Ctrl+C清掉隔离已保存密钥 → 输入假新密钥并Enter → 真实第三次Config认证成功 → /stats session → /quit。

首原生运行在0个保存请求时出现空输入错误，证实默认值读取导致重挂载丢输入；修复后可到达真实挂起保存。第二运行8步完成，输入替换和供应商保全判据未通过：验证器尝试Ctrl+U未替换旧输入、fixture缺imageModels默认字段且原比较依赖对象属性顺序；改为产品已说明的Ctrl+C、补fixture默认值及结构化比较，未为此放松产品业务断言。第三运行确认最新密钥正确保存，但明确记录没有key-deleted事件，实际暴露模态按键优先级问题；修复优先级后最终通过。前三结果/日志/终端记录独立保留。

最终8步/20条件通过，15659ms，CLI/验证器退出0；恰好1个本地保存屏障HTTP、0模型/外部fetch/自动重试。旧保存实际完成而不是被假装撤回，取消后无旧认证；新显式提交真实生成器初始化完成且signal存在。两次存储写入activeWrites均为1，最新假密钥内容正确，Ctrl+C有实际隔离删除事件。原生两次写入分别属于取消前与重新进入后的显式提交，真正并行提交顺序由hook队列定向场景证明，不冒称终端并行输入已验收。

供应商配置只有显式选原生方式时清空activeProviderId/activeModel，provider记录保持；settings只有显式selectedType变更，其他内容保持。转录文件含实际键入的FAKE_*，没有真实密钥或假网关FAKE_NOT_SENT；假凭据只在子进程内存中。个人配置及旧失败证据最终保全通过。

F-127 → Path：AppContainer.tsx手工提交缺少生命周期，迁入auth/useAuth.ts统一归属/串行写入；components/DialogManager.tsx不再用密钥值做React key；auth/ApiAuthDialog.tsx只填未编辑默认值、提高专用删除按键优先级。对应测试与原生按键验证覆盖上述路径。

## 证据、边界与接续

工程根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：

- auth-key-submit-test.log / -junit.xml、auth-key-submit-app-test.log / -app-junit.xml；
- auth-key-submit-input-test.log / -input-junit.xml、-input-final-test.log / -input-final-junit.xml、-input-release-test.log / -input-release-junit.xml；
- auth-key-submit-compile.log / -final-compile.log / -release-compile.log / -final-source-compile.log / -priority-compile.log；
- auth-key-submit-lint.log / -final-lint.log / -release-lint.log / -final-source-lint.log / -priority-lint.log；
- auth-key-submit-format.log、-input-format.log / -input-format-fix.log / -input-final-format.log、-final-format.log / -priority-format.log；
- observe-source-auth-key-submit.mjs、prepare-auth-key-submit-verifier.mjs、verify-source-auth-key-submit.mjs；
- source-auth-key-submit-{first,second,third}-result.json / .log / -terminal-output.txt；
- source-auth-key-submit-result.json / .log / -terminal-output.txt；
- check-auth-key-submit-evidence.mjs、auth-key-submit-evidence-summary.json；
- verify-auth-key-submit-preservation.mjs、source-auth-key-submit-preservation.json。

保全passed=true：个人provider/locale/config/skill-tags.json与既有精确SHA保持，旧E-294/E-364两个真实Swarm失败结果SHA与passed=false保持；ultra-tools.json不存在、全局1.0.0-preview.83。本轮未改个人配置/数据库/真实凭据、工具安装或PATH，未重跑付费任务。独立profile/workspace关闭后校验专用mkdtemp父目录/前缀再清理。

沿用granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit，同会话lead/cae/doc，无Codex子代理或外部扫描。维护目标池/workitems/timeline/field-journal，源码/工程/Obsidian三份全文SHA一致；只显式提交本轮源码/目标池/报告，推隔离分支并skip ci，不合并master、不Release。

队列只覆盖同一useAuth实例的submit保存，不包含其他进程/其他窗口/核心clearApiKey的并发操作；已开始的保存可能在取消后仍落入凭据库，不提供保存回滚。Ctrl+C清除与在途提交的跨入口排序、清除Promise失效处理、真实凭据库存储可靠性仍待下一阶段统一；本轮Ctrl+C验证发生在旧保存已经完成之后。配置变化/旧callback的所有组合、legacy AppContainer认证选择handler也未完成审查。真实Google账户、付费模型质量、最终包/跨平台均未验收。复杂真实Swarm的E-294/E-364仍失败，整体上线目标保持active。
