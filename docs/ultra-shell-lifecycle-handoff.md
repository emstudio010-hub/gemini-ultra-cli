# Gemini Ultra CLI 终端取消时序与原生 PTY 交接

日期：2026-11-11。WI-097/E-232/F-063，候选preview.64。沿用R26/code-audit自有源码case、lead/cae/doc、scope授权granted。本轮没有模型调用、外部目标或个人配置/数据库/逆向工具改动。

## 缺陷与修复

ShellExecutionService原先在入口和异步prepareCommand结束时都未检查signal；如果进入时已取消，或等待sandbox/命令环境准备期间取消，仍可能spawn进程，并因abort事件早已触发而错过终止。ShellTool虽有更早检查，但其后异步准备窗口仍可发生；服务也有直接调用者。新增4项旧回归实际均失败，分别PTY/管道和入口已取消/准备中取消，mock记录实际spawn调用，旧失败保留。

新增统一未启动取消结果：pid undefined、aborted true、executionMethod
none、无输出/错误及退出码。服务入口早退，PTY和管道prepare结束后都重新检查，已生成的准备cleanup调用一次再返回，不创建进程或fallback重复执行。原运行中终止与正常输出实现保持。取消不能回滚准备函数本身已经发生的动作，也不声称取消任意未遵守signal的远端sandbox准备立即结束。

Evidence → Finding → Path：4旧取消项仍spawn →
F-063异步准备窗口丢失取消 → 入口及准备后复核、一次cleanup/无pid结果 →
4新项及4相关已有执行/取消项通过，实际原生PTY/进程树链补充。

## 本地定向证据

8不同定向项通过：新增4取消项；匹配的4已有正常执行/运行中取消项。相关strict
type/lint通过。脚本首lint中AbortController
Node全局和空catch改显式globalThis及解释后单独复核，不重复已通过业务链。

新增verify-ultra-shell-lifecycle.mjs直接调用实际产品ShellExecutionService。source模式读构建模块，分发模式从bundle找到导出实现并调用，不用重写服务或替代pty。配置是本机NoopSandboxManager，命令通过产品shell配置与转义函数启动带空格路径的人工Node脚本，不运行不可信样本。4未启动取消组合均无pid且无文件落地，准备中cleanup一次。原生交互PTY的stdin/stdout
isTTY均true，writeToPty输入fixture-input后输出PTY_INPUT_fixture-input/退出0，executionMethod明确lydell-node-pty，未退化管道。再启动人工父子进程并取消，结果aborted
true，147ms后父子均终止且服务不再认为PTY活跃；最后独立pipe命令退出0、输出PIPE_OUTPUT_OK。共7场景、0模型；时间仅该次取消观察，非性能保证。

POSIX验收允许ps报告Z僵尸视为已终止但待系统回收，不冒充其PID立即消失；Windows使用真实process.kill(pid,0)检查。生成脚本自身15秒安全期限，验证器有8秒就绪/结束和5秒终止界限，finally只清理其已记录PID。此链证明服务和原生PTY生命周期，不是用户真实终端按键/resize、全CLI
UI交互或长时间FD泄漏验收。

工程证据：shell-start-cancel-before-junit.xml/-log、shell-start-cancel-junit.xml/-log、shell-start-cancel-types.log、shell-start-cancel-lint.log、shell-lifecycle-source.json/-log、shell-lifecycle-script-lint.log、shell-lifecycle-final-script-lint.log。没有全量、冒烟、未变更模型协作链或付费请求。

候选64待shell-lifecycle范围三平台包与全局安装，63最低Node及其他旧基线保留。goal
active，更多模型长任务、语义质量、完整终端UI和复杂跨机逆向继续。不合并master或创建正式Release。
