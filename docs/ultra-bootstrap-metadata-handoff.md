# Gemini Ultra CLI 认证元数据限时与界面复用交接

日期：2026-11-13。WI-164 / E-381至382 / F-121。源码基线 758544fa7f79d978fed2070a2f4b8ee5cc5a69c9，分支 codex/ultra-agent-portable，整体 goal active。继续源码优先与 Windows 必要定向验证，功能收敛后才最终 Windows/macOS/Linux 打包；全局 preview.83 不动，无打包、重装、版本变化、多平台 CI 或付费任务重跑。

## 修复

Config.refreshAuth 在内容生成器创建后等待 quota 与 experiments，原先两条可选数据链均无上限。现在 bootstrap quota 有 10 秒期限并向已有 refreshUserQuota/HTTP 传递 signal，完成后清理计时器；超时仍按原非致命路径处理，不把未知额度设成无限或伪造配额。取消后迟到结果不得更新缓存。

getExperiments 原为全局单份 Promise：没有后端时的空结果会影响后来 Google 登录，不同后端会串用，失败 Promise 也会永久占位。现在用 WeakMap 按 CodeAssistServer 实例共享在途/成功读取；无后端的默认空结果不进入原生缓存，失败后移除本次缓存，允许后续调用显式读取，不新增自动重试。每次实际加载有 10 秒总限时，覆盖本地覆盖文件、客户端元数据及 HTTP 等待，复用 withAbortSignal；超时后的元数据不会再派发请求，迟到结果不晋升缓存。listExperiments 新增可选 signal，传入已有 requestPost/authClient.request，不带 signal 的旧调用形状保留。GEMINI_EXP 成功读取及损坏时回落行为保留。

Windows 验证进一步暴露 UI 在已完成初始化后再次 refreshAuth，重复触发等待。Config 新增 isAuthReady：开始或失败的认证不标就绪，仅原 refreshAuth 整段正常结束才为 true。useAuthCommand 只在首次 UI 尝试、同 Config 已就绪且认证方式匹配时复用；强制认证方式、API key 读取、validateAuthMethod 与环境校验照常执行，初始错误不复用。后续显式重新登录、未就绪或不同认证方式仍刷新；复用判断在异步校验完成后重新检查就绪状态，防止校验期间失效后仍复用。原管理员设置读取/轮询、认证创建和授权判断未省略。

## Evidence → Finding → Path

E-381：旧源码新增 7 个场景均失败，覆盖空后端缓存影响后来原生读取、不同后端串缓存、失败占位、挂起实验/客户端元数据超时、HTTP signal 与 bootstrap quota 等待。首 Config fixture 缺少 createContentGeneratorConfig 返回值，在释放挂起请求后另产生 TypeError；已纠正并保留日志。纠正 fixture 后单独对旧源码重验 quota，明确因为 10 秒后尚未结束而失败，无该异常。

修复后分批共 40 个不同相关场景通过，check-bootstrap-metadata-evidence.mjs 依 classname/name 汇总三份 JUnit，remainingFailed=[]。包含实验加载 9 项、本地覆盖文件 5 项、endpoint 2 项、Config 15 个不同相关场景、UI auth 9 项。新的就绪失败状态、首次复用/再次显式登录、强制认证/验证/环境拒绝、未就绪/不同方式对照均直接检查。首次有一条旧 Pro 降级断言依赖其他测试先设置 authType；为两个对照明确补上 Google authType 后验证通过，未弱化原权限断言。首失败保留，不当成产品权限退化。

必要命令在 packages/core：
npx vitest run src/config/config.test.ts src/code_assist/server.test.ts src/code_assist/experiments/experiments.test.ts src/code_assist/experiments/experiments_local.test.ts -t 'experiments|listExperiments endpoint|forwards experiment cancellation|bounds optional bootstrap quota|should refresh auth and update config|should switch to flash model if user has no Pro access|should NOT switch to flash model' --coverage.enabled=false
补充 Config 就绪/上述四项相关对照：
npx vitest run src/config/config.test.ts -t 'bounds optional bootstrap quota|should refresh auth and update config|does not expose a failed reauthentication|should switch to flash model if user has no Pro access|should NOT switch to flash model' --coverage.enabled=false
在 packages/cli：
npx vitest run src/ui/auth/useAuth.test.tsx -t 'reuses ready startup|does not reuse startup auth invalidated|still rejects|refreshes startup auth|should authenticate successfully for valid auth type|should handle refreshAuth failure' --coverage.enabled=false

core/CLI npx tsc -p packages/{core,cli}/tsconfig.json 最终退出 0；8 个受影响文件 eslint、prettier --check 及仓库 git diff --check 通过。只验证本次调用链和相关回归，无全量、冒烟或跨平台 CI。

E-382：实际 Windows Node v24.19.0 源码 CLI/ConPTY，独立 profile/workspace。认证使用本地假凭据的 gateway；preload 只在元数据所有者调用期间提供真实 CodeAssistServer 实例，并把其 authClient.request 传输适配到 loopback。真实 Config.refreshAuth、getExperiments、requestPost、quota 缓存、isAuthReady、UI auth 与模型窗口都运行。没有执行 Google OAuth/账号 setup，也没有伪造已获取的 flags 或 quota。

预先用真实 getExperiments() 做一次无后端读取，原生实验请求仍真实派发。启动现有 partial/full 两个初始化阶段各挂起一次 quota 与 experiments；四条连接分别约 10 秒取消，两次 refreshAuth 在 10020/10008ms 结束，isAuthReady=true，quota/experiments 均仍未知。进入 UI 后没有第三次认证；手动 /model 又取得 remainingFraction=0.15，实际显示 85% 已用；/language 中文、/stats session、/quit 正常。

4 步/18 条件通过，35229ms，CLI 与验证器退出 0。共 5 次本地元数据 HTTP：两轮启动各 2 次 + 显式模型配额 1 次，0 模型生成请求；全部 signal 到达 HTTP，挂起连接关闭，provider/settings 原字节保持，未尝试外部 fetch。该 35 秒包含有意制造的两轮 10 秒挂起和源码加载，不能声称整体启动 10 秒或秒级，也不是性能基准。末轮复核把就绪重查移到异步校验之后，该失效竞态由新增定向 UI 场景证明；Windows 主链记录在此小改动前取得，未用它冒称失效竞态验收。

首原生验证按一轮 bootstrap 假设编写，观测到三次真实 refreshAuth/六次元数据请求，45 秒观察上限触发，停在模型命令就绪前。该证据促成本次 UI 复用修复；最终观测保留源码本来需要的 partial/full 两轮，并将原先全局后端适配收窄到 auth/quota 所有者期间。首结果、终端、观察器和验证器副本保留，不把首观察上限当作底层请求永不终止，也不宣称首次即通过。

F-121 → Path：config.ts 的 bootstrap quota 无时限、experiments.ts 的全局挂起/失败/跨后端缓存，以及 useAuth.ts 初次重复认证形成加载等待链。按后端缓存、限时取消和只复用已完成认证共同修复这些路径，未删除配额/实验功能或跳过策略检查。

## 边界、证据与接续

未验证真实 Google 登录/管理员服务可用性、任意供应商请求质量、最终安装包或跨平台兼容。管理员设置请求、OAuth/账号 setup 本身的取消/限时不在本次改动中；partial/full 两个初始化阶段仍各可能花费一轮元数据上限，跨阶段复用继续处理。Config 并行切换认证的完整事务隔离也未由本次证据证明。

工程根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
bootstrap-metadata-before.log / -before-junit.xml、bootstrap-quota-before.log；
bootstrap-metadata-test.log / -junit.xml、bootstrap-metadata-config-final-test.log / -final-junit.xml、bootstrap-metadata-config-ready-test.log / -ready-junit.xml、bootstrap-auth-ui-test.log / -junit.xml；
bootstrap-auth-ui-final-test.log / -final-junit.xml / -final-compile.log / -final-lint.log；
bootstrap-metadata-{core,cli}-final-compile.log、bootstrap-metadata-final-lint.log、bootstrap-metadata-format.log；
observe-source-bootstrap-metadata.mjs、prepare-bootstrap-metadata-verifier.mjs、verify-source-bootstrap-metadata.mjs；
source-bootstrap-metadata-first-result.json / -first.log / -first-terminal-output.txt、observe-source-bootstrap-metadata-first.mjs、verify-source-bootstrap-metadata-first.mjs；
source-bootstrap-metadata-result.json / -final.log / -terminal-output.txt、check-bootstrap-metadata-evidence.mjs、verify-bootstrap-metadata-preservation.mjs、source-bootstrap-metadata-preservation.json。开发验证脚本不作为用户功能分发。

保全检查 passed=true：个人 provider / locale / config/skill-tags.json SHA 保持，ultra-tools.json 仍不存在，全局 1.0.0-preview.83，旧 E-294/E-364 失败文件 SHA 与 passed=false 保持；未重跑付费任务，未改个人数据库、工具安装、PATH 或真实凭据。本地 mkdtemp 清理前检查绝对父目录及专用前缀。

沿用 granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit、同会话 lead/cae/doc，无 Codex 子代理或无关扫描。同步目标池、workitems、timeline、field-journal；三份正式交接全文 SHA 相同，只显式提交本轮源码/目标池/报告，推隔离分支并 skip ci，不合并 master、不正式 Release。真实复杂 Swarm 的 E-294/E-364 失败边界仍保留，整体目标 active。
