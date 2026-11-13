# Gemini Ultra CLI 认证等待取消与迟到状态隔离交接

日期：2026-11-13。WI-166 / E-385至386 / F-123。源码基线 5754bd11ddcc2d24e465427cf99c4d0e5a930a48，分支 codex/ultra-agent-portable，整体 goal active。保持源码优先、Windows 必要定向验证，最终各平台包后置，全局 preview.83 不变。未打包、重装、升版本、跑多平台 CI 或重跑付费任务。

## 修复范围

useAuthCommand 原先在切换选择窗口、取消或卸载后仍接受异步校验、refreshAuth 和密钥读取的结果。迟到成功会把界面重新标为已登录，迟到失败会覆盖用户当前取消信息；校验晚到还会在用户取消后开始 refreshAuth。

现在每次认证有独立尝试编号和 effect 生命周期。公开 setAuthState 在状态变化请求发生时同步使旧尝试/旧密钥读取失效，不必等待 React 的 effect cleanup；异步校验、密钥读取与 refreshAuth 返回/异常后的界面写入都只接受当前尝试。设置中的认证方式已改变时也不采纳旧结果。卸载后不再派发后续认证或更新密钥显示。

保留 React setter 形式，并增加状态修订计数，使“显式重试但请求的状态仍为 Unauthenticated”也能启动新尝试，避免失效旧请求后因相同状态没有触发 effect 而挂住。首次已就绪认证复用、强制认证方式与环境校验、后续显式重登仍按上一轮规则执行。

reloadApiKey 使用读取序号，只让最近且仍相关的结果更新默认值；旧读取不覆盖新读取，取消后到达的旧密钥不再显示或触发认证。内部保存密钥读取失败会结束等待，给出中英文固定诊断，不展示底层异常中的私有详情；外部 reloadApiKey 仍返回原值/拒绝，保留 AppContainer 显式提交的处理合同。

这是自动认证钩子和其密钥加载的界面状态保护。没有给 Config.refreshAuth 或共享 OAuth 工作增加取消信号，没有终止原生认证传输，也没有证明底层 Config 不会被迟到操作修改。AppContainer 的手工 API key 提交/认证选择异步处理器仍需单独审查，不能称整个认证事务已经可取消。

## Evidence → Finding → Path

E-385：新增 9 个定向场景在旧源码全部失败，包括取消后 resolve/reject、取消后的两种校验结果、旧密钥到达、旧失败覆盖较新成功、卸载后校验继续派发、密钥加载异常和两次密钥读取乱序。旧代码的密钥加载异常还产生 1 次未处理 Promise 拒绝；该错误来自受控凭据读取失败，不记作真实 Windows 凭据库故障。

修复后 useAuth.test.tsx 全文件 33 项通过。最后补上“相同状态的显式重试”场景，并对取消成功/失败、密钥加载异常、密钥读取顺序重验 5 项通过；check-auth-lifecycle-evidence.mjs 合并 JUnit 得到 34 个不同场景、无剩余失败。含 10 个新增场景及 24 个原有校验/复用/登录错误对照，未运行全量或冒烟检查。

测试中同一认证类型的 settings 在单个用例内保持稳定对象，避免仅输入默认密钥变化就人为生成新 settings 身份而重新启动 effect；每个用例重置，不改变产品配置。首 lint 的 3 个 ref cleanup 提示通过共享生命周期对象整理消除，最终两文件 eslint 退出 0、0 warning。渲染器仍记录部分 React act 提示，未隐藏；没有把它当成产品失败或更新无关快照。

复现命令在 packages/cli：
npx vitest run src/ui/auth/useAuth.test.tsx --coverage.enabled=false
最终补充：
npx vitest run src/ui/auth/useAuth.test.tsx -t 'ignores a late auth|reports saved key loading failure|newest saved key read|fresh explicit attempt even' --coverage.enabled=false
根目录 npx tsc -p packages/cli/tsconfig.json、两文件 eslint / prettier --check 与仓库 git diff --check 均最终退出 0。core 业务源码未改，不重复 core/跨平台检查。

E-386：Windows Node v24.19.0 实际编译源码 CLI、ConPTY、useAuth、DialogManager、AuthDialog、Config 与独立 profile/workspace。preload 只把第三次 refreshAuth 的 Promise 通过 loopback 屏障延后，启动前两次使用真实隔离 gateway 初始化，不替换 Config；成功场景释放后实际执行原 Config.refreshAuth，失败场景返回受控晚到异常。

实际按键顺序：/auth 打开选择 → Esc 进入认证等待 → Esc 取消 → 观察已回选择窗口 → 释放旧 Promise → 终端 resize 要求当前画面重新绘制，仍为认证选择且无旧异常 → 高亮清除取消消息后 Esc 显式重试 → 真实认证完成 → /stats session → /quit。没有仅靠旧终端缓冲区曾出现过选择窗口就声称保留状态。

resolve 场景 7 步/18 条件通过，14726ms；reject 场景 7 步/18 条件通过，13239ms。两者 CLI/验证器均退出 0，各只有 1 个本地等待屏障 HTTP，0 模型请求/0 尝试外部 fetch。记录确认原等待连接取消后仍存在，随后由验证器显式释放；没有将“停止界面等待”误报成网络已取消。4 次认证调用分别为两次启动、旧等待、后续显式重试，最后一次真实完成；provider/settings 字节保持，终端无假 Key 或晚到异常详情。

真实 Google OAuth、账户切换、操作系统凭据库、180 秒计时器触发和手工 API key 提交不在上述原生验证范围。定时器仍调用同一个 onAuthError/setAuthState 失效路径，但没有由本轮按键场景证明实际三分钟计时。没有验证最终安装包或其他平台。

F-123 → Path：useAuth.ts 缺少尝试身份、effect cleanup 和密钥结果顺序控制，使旧异步结果可覆盖当前界面，凭据读取异常无人接住。同步失效、返回前检查和只发布最新密钥结果修复这些界面路径；底层认证事务隔离留待下一阶段，整体目标不标完成。

## 证据、保全与接续

工程根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
auth-lifecycle-before.log / -before-junit.xml；
auth-lifecycle-test.log / -junit.xml、auth-lifecycle-final-test.log / -final-junit.xml、auth-lifecycle-release-test.log / -release-junit.xml；
auth-lifecycle-release-compile.log、auth-lifecycle-lint.log / -release-lint.log、auth-lifecycle-format.log；
observe-source-auth-lifecycle.mjs、prepare-auth-lifecycle-verifier.mjs、verify-source-auth-lifecycle.mjs；
source-auth-lifecycle-{resolve,reject}.log、source-auth-lifecycle-{resolve,reject}-result.json / -terminal-output.txt；
check-auth-lifecycle-evidence.mjs、verify-auth-lifecycle-preservation.mjs、source-auth-lifecycle-preservation.json。验证脚本不随产品分发。

保全 passed=true：个人 provider / locale / config/skill-tags.json 及旧 E-294/E-364 失败文件 SHA 保持，旧失败仍 passed=false；ultra-tools.json 不存在、全局仍 1.0.0-preview.83。未改个人数据库、工具安装、PATH 或真实凭据，未重跑旧付费任务。只使用隔离 profile 与假凭据，清理 mkdtemp 前核对绝对父目录和专用前缀。

沿用 granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit，同会话 lead/cae/doc，无 Codex 子代理或无关扫描。维护目标池/workitems/timeline/field-journal，源码/工程/Obsidian 三份正式交接全文 SHA 相同；只显式提交本轮源码/目标池/报告，推隔离分支并 skip ci，不合并 master、不正式 Release。

接续优先处理 Config 认证事务的取消/并发提交边界和手动提交路径，再收敛管理员数据加载等剩余功能；E-294/E-364 真实复杂 Swarm 质量仍未通过，完整 Agent 上线与最终 Windows/macOS/Linux 包仍未完成，goal active。
