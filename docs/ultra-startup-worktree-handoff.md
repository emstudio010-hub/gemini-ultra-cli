# Gemini Ultra CLI 启动工作树探测交接

2026-11-15；WI-253 / E-561至562 / F-211；基线47f5bfb590fc12196ecaf2c97bd5bc5887c01242，分支codex/ultra-agent-portable。上一goal turn为progress（多Config策略已推送）。goal active；源码→Windows必要定向验证→功能收敛后最终三平台包；preview.83保留，无打包/重装/升版/三平台CI/付费重跑/子代理。

## Evidence → Finding → Path

F-211：CLI普通启动在loadCliConfig前会解析工作树。show-toplevel、core getProjectRootForWorktree 的 git-common-dir 和 HEAD 三次外部git调用原无总期限，任一步卡住会阻止首屏。现resolveWorktreeSettings共享2秒AbortController；三次execa传cancelSignal/100ms forceKill，入口和每步后复核signal，超时返回undefined继续启动。core getProjectRootForWorktree新增可选signal，默认调用行为不变；普通仓库、托管worktree与非Git目录路径保持。

## E-561 源码证据

新增worktreeStartup.test五项：三个阶段分别持有非合作Promise，旧实现5项超时/未结束；修后每项约2秒结束、signal aborted、迟到结果不再追加调用；正常managed worktree仍返回name/path/baseSha，不读HEAD的普通仓库只做必要探测。core worktreeService原有getProjectRootForWorktree定向3项通过；新CLI测试修后5项通过。CLI/core tsc build退出0，三源码/测试文件eslint零warning，Prettier与git diff --check通过。旧baseline与新测试日志保留；未跑全量或冒烟。

工程证据前缀startup-worktree：baseline.log/-baseline-junit.xml、isolated-baseline.log/-isolated-baseline-junit.xml（旧实现失败保留）、tests.log/-junit.xml、core-tests.log/-core-junit.xml、compile.log/-final-compile.log、lint.log/-final-lint.log、format-write.log/-format.log。源码位于packages/cli/src/config/config.ts、packages/core/src/services/worktreeService.ts，测试packages/cli/src/config/worktreeStartup.test.ts。

## E-562 Windows定向链

verify-source-startup-worktree.mjs使用独立Windows temp/home/workspace和真实git init/worktree add，导入编译dist的resolveWorktreeSettings；只在选定git rev-parse阶段把child_process.spawn替换成自有idle Node worker，记录PID/终止信号，其他Git命令真实执行。三阶段分别约2008至2015ms返回undefined，所有自有子进程收到SIGTERM；实际managed结果name/path/baseSha正确，ordinary repo/non-repo继续，11 helper条件全true。另保留真实编译CLI ConPTY观察：因独立fixture provider/auth启动尝试访问被禁止的https端点，prompt未在15秒内出现且最终超时；这不是worktree超时条件，结果与终端输出保留，不纳入passed helperChecks，也不称CLI整机启动已通过。总运行81229ms，helper首次退出0，0授权外部请求，provider/profile无修改；不是最终冷启动基准或分发包验收。

## 保全与接续

source-startup-worktree-result.json仍含完整checks、helperChecks与CLI单独观察；无个人文件/数据库/PATH/工具安装改动。沿用granted R26 code-audit及docs-generator，lead/cae/doc同会话，三份同SHA交接和目标池/case同步后显式stage，skip ci推隔离分支，不合master/Release。下一轮继续检查其他启动等待（扩展/认证/设置读取）并回到用户要求的双语、模型配置、演练台及真实协作收敛；最终三平台包和整体上线未完成，goal保持active。
