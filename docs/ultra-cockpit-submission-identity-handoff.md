# Gemini Ultra CLI 演练台提交与会话归属交接

2026-11-16；WI-261 / E-576至577 / F-219至220；路径提示续接 WI-262 / E-578 /
F-221。源码基线 184643dfad392dd6074076254123642dc1eb9a8b，分支 codex/ultra-agent-portable。goal
active；源码优先，暂不打包。

## Evidence → Finding → Path

F-219：页面提交期间定时 refresh 可用 ready=true 重新启用按钮；处理器没有防重入。现在 taskSubmitting 与 sessionReady 分开维护，首次状态加载前禁用提交；提交期间刷新不能解锁按钮，键盘/重复事件不再发第二个 POST；表单 aria-busy 和中英文等待文案反映请求状态。finally 强制获取新状态再释放客户端锁；失败或状态不可读时保留草稿，不自动重发任务。

F-220：旧浏览器页面的 POST 若在 CLI 切换 Config 后到达，原服务端只比较本次请求读取期间的 Config，无法识别该页面仍持有旧会话。现在页面所有 POST 携带最后成功 status 的 X-Drill-Session；服务端在请求体读取完成后比较当前 getSessionId()，过期会话返回 409，无调度/配置写入。原有 Config 身份、就绪及提交锁仍生效；未提供该头的旧 API 客户端保持原行为，这不是新增认证凭据。页面需要重新加载以使用新逻辑。

F-221：缺少 r2/rabin2/Ghidra/Java 时原诊断只指向 PATH/环境变量。已补充实际支持的 /drill
tools <工具名> <absolute-path>
保存入口，不修改工具查找优先级、不安装工具、不写用户工具配置。

## 定向证据

Windows 本地运行下列命令，均退出 0：

```powershell
node node_modules/vitest/vitest.mjs run packages/cli/src/services/drillCockpitPageSubmission.test.ts packages/cli/src/services/drillCockpitSessionAdmission.test.ts packages/cli/src/services/drillCockpitSubmission.test.ts --reporter=dot --maxWorkers=1 --minWorkers=1
node --max-old-space-size=4096 node_modules/typescript/bin/tsc --build packages/cli/tsconfig.json
node --max-old-space-size=4096 node_modules/eslint/bin/eslint.js packages/cli/src/services/drillCockpit.ts packages/cli/src/services/drillCockpitPage.ts packages/cli/src/services/drillCockpitSessionAdmission.test.ts packages/cli/src/services/drillCockpitPageSubmission.test.ts --max-warnings 0
node node_modules/prettier/bin/prettier.cjs --check packages/cli/src/services/drillCockpit.ts packages/cli/src/services/drillCockpitPage.ts packages/cli/src/services/drillCockpitSessionAdmission.test.ts packages/cli/src/services/drillCockpitPageSubmission.test.ts
git diff --check
```

E-576：生成页面的完整 JavaScript 在 Node
VM 中运行（DOM 基元替身），3 项通过：提交期间状态刷新/重复事件、失败保留草稿和恢复、提交已接受后状态失败保持禁用且不重发；同时检查实际 fetch 携带会话 ID。这是页面处理器证据，不是浏览器视觉验收。

E-577：真实 Windows loopback HTTP 服务，SessionAdmission 7 项、Submission
4 项通过：旧视图到达新 Config、同 Config 在读取请求体期间轮换会话 ID 均 409/零提交，匹配 ID
202/提交一次，原回调刷新和锁释放保持。与页面测试合计 3 文件 / 14
passed，29.87 秒，0 外部模型请求。

E-578（承接 2026-11-15 未提交阶段）：二进制工具/访问与提交链 31 项通过；工具路径/Java/取消 14 项通过，五个 core
TS 的 lint/格式通过。首次并行 core tsc 因 Node Zone Allocation
OOM 退出 1，随后单独以 4
GiB 堆编译退出 0，失败记录不改写为通过。真实本机 preflight 显示不在 PATH 的工具不可用，临时进程环境指定索引中的 r2/rabin2/Ghidra 后可发现；原生 rabin2 静态读取 r2.exe 的 PE32+/AMD64 信息，未执行样本。个人 PATH、工具安装与持久配置未改；这些证据不代表任意其他电脑已验收。

## 交付与接续

本阶段没有全量、冒烟、付费模型或旧真实失败重跑；未升级 preview.83、未合 master、未 Release。未跟踪历史文件保留；旧失败及 passed=false 继续作为未验收依据。本报告同步源码 docs、工程目录、Obsidian，case 的 evidence/workitems/timeline/field-journal 追加记录。

后续按原目标持续推进：

1. 核对真正首屏认证/设置加载的重复等待，再在隔离 Windows 环境测量；仅已就绪 Config 的认证复用分支不证明新 Config 首屏提速。
2. 继续演练台任务状态和多 Agent 原生交付链，保留未通过的真实协作质量边界。
3. 继续可移植逆向格式和工具衔接；源码及 Windows 验证收敛后才安排最终三平台分发。
