# Gemini Ultra CLI 退出摘要与恢复命令交接

日期：2026-11-13。WI-160 / E-373至374 / F-117。持续目标 active，源码基线 46ef502。源码优先、Windows 必要定向验证、功能收敛后才统一最终平台包。全局 preview.83 保持，无打包、重装、版本变化、多平台 CI 或外部/付费模型请求。

## 修复

SessionSummaryDisplay 原告别与恢复提示固定英文，且给出 gemini --resume。已核对 packages/cli/package.json、scripts/package-ultra.mjs 与当前独立安装元数据，产品实际分发 gemini-ultra / gemini-ultra-cli，旧指令可能找不到程序或启动另一份上游 CLI。现在统一提示 gemini-ultra --resume；新增 sessionResume.ts 纯格式化函数，沿用既有 escapeShellArg 与 Windows 会话 ID 引号规则，不执行任何命令。

原工作树提示在 Windows 使用 cd PATH && gemini ...：系统 Windows PowerShell 5.1 不支持 &&，且 cd 的 Path 参数可能把方括号当作通配符。现在生成 Set-Location -LiteralPath PATH; if ($?) { gemini-ultra --resume ID }，保留路径字面值，只在切换目录成功后恢复。非 Windows 使用 cd -- PATH && ...，手动移除提示增加 git worktree remove -- PATH，避免路径被当作选项。这仅是手动说明，不会自动删除工作树。

摘要接入既有 useLocale，告别、恢复普通会话、恢复工作树与手动移除说明按中英文即时切换。英文既有文案保持，只有恢复命令程序名改变；统计指标、会话 ID、路径和数据写入策略保持。没有增加依赖、动画或加载任务。

## Evidence → Finding → Path

E-373：SessionSummaryDisplay.test.tsx 补充普通/工作树两个中英文往返场景，并将四个既有 Bash/PowerShell 会话 ID 转义和一个工作树场景预期改为实际产品命令。旧源码七项失败、一项原摘要快照通过；修后八项全部通过。每项独立 locale 文件，不写个人偏好。唯一快照更新经人工 diff 复核，只把页脚 gemini 改成 gemini-ultra 并调整行尾留白，其余英文统计与布局保持。

命令在 packages/cli：npx vitest run src/ui/components/SessionSummaryDisplay.test.tsx --coverage.enabled=false --update。根目录 npx tsc -p packages/cli/tsconfig.json、仅 Summary 组件/测试与 sessionResume 辅助文件 eslint 均退出 0；相关格式与 git diff --check 通过。八项均与本改动相关，没有全量/冒烟。

E-374：verify-source-session-resume.mjs 使用真实 Windows Node v24.19.0 编译源码 CLI 和两个 ConPTY 进程、同一独立 profile/workspace（目录名含空格与方括号），无 preload。第一个普通会话唯一 loopback 响应写入真实聊天记录，/quit 输出英文摘要与正确程序名。验证器从实际页脚提取 UUID，使用 core 的 loadConversationRecord 公共读取函数核对该记录及正文；第二个源码进程仅用等价 --resume UUID 参数恢复，读到原 RESUME_LOCAL_ACK，不再生成模型请求，然后 /language 中文、/quit，中文摘要中的 UUID 保持相同。

Windows 14 条件通过、38163ms；两个终端进程均 2/2 步骤完成、退出 0，验证器退出 0，最终运行仅一条 loopback 请求、0 外部/付费调用。provider/settings 字节保持，语言只显式保存隔离 profile。会话恢复实际使用源码入口，未调用或替换旧全局 83；打印程序别名的可用性由当前安装及分发元数据交叉确认。

同时使用系统 C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe（已实读版本 5.1.26100.9711）运行源码格式化器的工作树命令。测试目录含中文、方括号、空格与单引号，会话参数含分号、引号与类似注入的无害标记写入表达式。gemini-ultra 仅在该测试进程内定义为记录 cwd/args 的无害函数，实际捕获目录与两个参数逐字相同、注入标记文件未创建；不存在的目录不调用恢复函数。PowerShell 脚本用 UTF-8 BOM，避免 5.1 把中文路径按旧编码解释。没有运行 git worktree remove、实际工作树删除或修改个人 PATH。

首 Windows 验证器误把记录只按 .json 搜索，而当前实际存储为 .jsonl，首次正常退出后停在证据读取断言。已改用现有 loadConversationRecord 读取 .json/.jsonl，保留首次日志/失败说明；这是观察器问题，不是产品会话缺失或恢复故障。最终验证包含真实恢复后才判通过，不拿“命令已打印”替代恢复证据。

F-117 → Path：SessionSummaryDisplay 的固定语言/上游程序名，以及 Windows 工作树命令组合；纯 sessionResumeCommands 统一构造、既有 shell 参数转义保持。恢复命令只切换到成功定位的目录，用户取消/历史保存/模型预算无改动。

## 保全与接续

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：session-summary-before.log / -before-junit.xml、session-summary-test.log / -junit.xml、session-summary-source-compile.log / -lint.log / -format.log；verify-source-session-resume.mjs、source-session-resume.log / -failure.txt（首次观察器问题）、source-session-resume-final.log / -result.json / -first-terminal.txt / -second-terminal.txt，以及 source-summary-stage-preservation.json。工程验证器不作为用户功能分发。

结束后核对个人 provider / locale / config/skill-tags.json 与旧 E-294/E-364 失败 SHA 保持、ultra-tools.json 仍不存在、全局仍 1.0.0-preview.83，保全 passed=true。个人 SHA 为 e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332 / 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / 33a88098707f0383b34286ad83d7bc979f48f80441f4569cb1641ccfef89ca10。未重跑任何付费任务，未改个人数据库、账户、工具安装或 PATH；只删除核实后的本验证 mkdtemp。

沿用 ui-skills-root / baseline-ui 的既有 Ink 原语，既有 granted case 与同会话 lead/cae/doc，workitems/timeline/field-journal 和目标池同步，无 Codex 子代理。只推隔离 codex 分支并 skip ci，不合并 master、不正式 Release。

边界：PowerShell 工作树验证证明格式与执行顺序，恢复函数是受控捕获；没有运行真实工作树删除，也不把 Bash 字符串检查当 macOS/Linux 原生验收。普通会话恢复已经实际源码往返，但不证明任意历史格式、模型状态或复杂协作质量。命令描述、热力图和更多交互语言仍待收敛。继续源码及 Windows 必要验证，全部功能收敛后再统一最终 Windows/macOS/Linux 包，goal active。
