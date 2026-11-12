# Gemini Ultra CLI 协作状态语言交接

日期：2026-11-13。WI-142 / E-338至339 / F-101。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装仍preview.83，本轮没有打包、重装、版本变化或跨平台CI。

## 修复

F-101：已有/language偏好会更新界面，但Swarm状态与看板仍直接显示active/waiting/paused/inherit，工作流状态直接显示cancelled等内部阶段；任务列表另有独立中文映射，几处展示不一致。

新增CLI展示层agentTaskLabels，统一工作流/Swarm阶段、成员状态、继承主模型及角色模型标签。中文模式使用与演练台一致的进行中/等待/已暂停等词；英文保留既有状态词。工作流的标准investigate/implement/review序号及final audit转换为中文阶段，未知或自定义stage保持原文。任务列表、工作流status、Swarm status及SwarmBoard共用标签，看板通过既有useLocale即时响应。模型ID、成员名、命令参数、原始报告/错误正文及持久化字段保持；预算JSON仍为诊断原值，本轮不冒称整个CLI任意消息已全部翻译。

界面工作按ui-skills-root路由，采用baseline-ui最小整理规则，沿用Ink组件、原键盘交互及主题，无新增依赖、动画或布局重做。没有更改运行状态机、模型选择或预算规则。

## Evidence → Finding → Path

E-338：人工核对上述旧源码直接插值，确认中文状态混用；没有为低影响标签改动新增广泛测试。扩展已有4项相关检查：Swarm status两种语言仍分开展示原错误并保持文件；历史工作流在中/英文均选择原ID、正确显示阶段/角色及精确模型路由，不因查看补建缺失账本；实际Ink看板英文→中文→英文即时刷新、状态字节保持，刷新留言/清洗ANSI/Esc关闭仍通过。4通过、38项不相关跳过。严格CLI类型及源码编译、8个修改文件eslint、格式检查均退出0。

命令（packages/cli）：`npx vitest run src/ui/components/SwarmBoard.test.tsx src/ui/commands/swarmCommand.test.ts src/ui/commands/agentWorkflowCommands.test.ts --coverage.enabled=false --testNamePattern='renders the saved roster|shows the latest member error separately|inspects the requested historical workflow'`。根目录`npx tsc -p packages/cli/tsconfig.json`。没有全量或冒烟。

E-339：确认编译退出0后，Windows Node v24.19.0、隔离profile、实际源码CLI ConPTY，无preload或预置运行器。真实输入/swarm prepare、status、model researcher local:fixture、/language 中文、status、board、Esc、cancel，再/teamwork prepare、status、/language 英文、status、cancel、quit。13个匹配步骤全部到达，14条件通过，19843ms/退出0，0模型请求/无超时。中文状态、角色标签和看板标题正确，英文状态与继承提示正确；local:fixture模型路由逐字保持，查看/切换语言前后任务字节保持，只有显式cancel改变终态。个人供应商配置未改，隔离语言最终en；两任务请求数均0，工作流账本closed。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。agent-status-locale-format.log、agent-status-locale-test.log/-junit.xml、agent-status-locale-source-compile.log、agent-status-locale-lint.log、verify-source-agent-status-locale.mjs、source-agent-status-locale.log、source-agent-status-locale-result.json、source-agent-status-locale-terminal-output.txt。验证器不随产品分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md自有源码范围，本会话承担lead/cae/doc。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。没有付费任务重跑、数据库/工具安装/PATH修改或外部安全目标。

这证明CLI协作状态展示与真实本地命令语言往返，不证明所有底层错误/原始预算JSON已本地化、真实Agent任务质量、长会话稳定性或最终跨平台分发。复杂逆向语义和最终Windows/macOS/Linux交付仍待收敛。隔离codex分支同步带skip ci，不合并master或正式Release。继续源码完整性、必要Windows验证、维护目标池/交接，最后统一打包，goal保持active。
