# Gemini Ultra CLI 协作模型补全交接

日期：2026-11-13。WI-143 / E-340至341 / F-102。持续目标active。源码优先，Windows必要定向验证，功能收敛后最终统一打包。全局安装仍preview.83，本轮没有打包、重装、版本变化或跨平台CI。

## 改动

F-102：协作model命令只有手填入口，缺少角色/本地模型候选；通用补全器把第二参数之前的角色当成子命令，中文别名/多个空格也无法继续补全。@成员及model@version还被文件补全优先接管。实际ConPTY又暴露快速Tab可使用上一轮候选，拼出@reader inherit local:fi多余参数。

现在/teamwork model、/boost model、/swarm model接入本地补全：角色、当前Swarm具名成员、inherit、已配置供应商的限定模型；仅有原生认证且主模型为明确gemini ID时补充该native候选。网关会话不主动推荐原生模型，仍允许用户手填原有合法格式。补全不联网、不创建任务或写配置、不改全局模型。候选去重并按可接受的参数schema过滤；未就绪认证/损坏成员表仍可补全角色。

通用slash解析现在只消费真实命令路径，完整参数及原空白交给命令补全器；返回值替换整段参数，保留命令/别名的原始位置，不重复前置角色。新增completionHandlesAt显式标记，仅这些model命令接管@成员/模型版本，其余命令保留@文件行为。候选关联当前query，输入变化后旧候选不显示、不作为perfect match，也不能Tab或Enter替换；替换位置由当前解析直接返回。

## Evidence → Finding → Path

E-340：两个多参数旧复现均失败，completion零调用。修后本地模型选择3项通过，多参数/原单参数/子命令对照6项通过；命令拥有@参数与普通@文件3项通过。首新增fixture漏description引发类型错误，另立即完成的测试Promise触发act警告，已补description并按实际异步完成包装act，原日志保留，不改产品迎合测试。其后对快速候选绑定增加2项必要检查，最终受影响hook11项通过、68不相关跳过；本地选择3项未改逻辑复用前证据。最终CLI严格类型及源码编译和相关eslint退出0。

packages/cli定向命令：`npx vitest run src/ui/hooks/useSlashCompletion.test.ts src/ui/commands/agentModelCompletion.test.ts --coverage.enabled=false --testNamePattern='completes multi-argument values|offers local role and model completions|should call the command.completion function for argument suggestions|should call command.completion with an empty string|should autocomplete "/chat "|should suggest the command itself instead of subcommands'`；随后useCommandCompletion.test.tsx仅执行keeps declared command-owned与普通@文件对照。最终hook命令另选marks prior-query、refuses a stale slash及上述受影响对照。根目录`npx tsc -p packages/cli/tsconfig.json`，修改文件eslint。无全量/冒烟。

E-341：确认编译退出0后，实际Windows源码CLI ConPTY，无preload。/swarm prepare真实创建任务，给该隔离任务写入waiting成员夹具（不启动成员），Tab补全@reader及local:fixture@v1并Enter保存，coder角色含@版本模型补全保存；取消后/teamwork prepare，Tab补全coder和同模型并保存，再取消/quit。最终14条件通过、17790ms/退出0、0模型请求/无超时，任务请求数0、供应商字节保持；只有明确提交保存/取消改变任务状态。

首次快速Tab验证到member-save停住，60秒观察器终止（产品被终止时PTY返回0不算成功），原失败保留。延后500ms候选稳定后14条件通过18438ms，确认快速刷新缺口；补query绑定后恢复立即Tab，无这项延迟，最终17790ms通过。不是用延迟掩盖产品问题。模型调用质量、活跃成员切换限制及原生Google认证不是本次验收。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。agent-model-completion-before.log/-junit.xml、agent-model-completion-test.log/-junit.xml、agent-model-completion-final-test.log/-junit.xml、agent-model-completion-source-compile.log、agent-model-completion-final-source-compile.log、agent-model-completion-final-lint.log、agent-model-at-completion-test.log/-junit.xml、agent-model-at-completion-source-compile.log/-lint.log、agent-model-query-binding-test.log/-junit.xml、agent-model-query-binding-source-compile.log/-lint.log；相应format日志；verify-source-agent-model-completion.mjs、source-agent-model-completion-first-result.json/-first.log/-first-terminal-output.txt、source-agent-model-completion-settled-result.json/-settled-terminal-output.txt、source-agent-model-completion-final.log、source-agent-model-completion-query-bound.log、source-agent-model-completion-result.json/-terminal-output.txt。验证器不随产品分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md自有源码范围，本会话承担lead/cae/doc。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在；无付费请求、数据库/工具安装/PATH修改、外部安全目标。源码同步隔离codex分支带skip ci，不合并master或正式Release。

源码待办仍需围绕真实交付收敛：复用E-294保留证据定位多函数报告语义失真与证据引用缺口，不原样重复付费任务；核对其他核心入口的完整功能链与具体未解决问题；功能收敛后统一最终Windows/macOS/Linux包及平台相关验收。启动稳定速度收益、长会话语义和更多供应商质量仍未证明，不以局部绿色检查替代全面上线。goal保持active。
