# Gemini Ultra CLI 计划模式蜂群留言门禁交接

2026-11-15；WI-239 / E-533至534 / F-197；基线c3d3c04836a0fa439d509d33ab3b63e9a0add860，分支codex/ultra-agent-portable。上一goal turn为progress（成员路由失效诊断修复与源码同步），当前goal active。源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包；preview.83保持，无打包/重装/升版/三平台CI/旧付费重跑。

## Evidence → Finding → Path

F-197：/swarm prepare、新任务与resume已有ApprovalMode.PLAN检查，ManageSwarmTool执行也有检查，但CLI /swarm message直接调用postSwarmMessage→engine.post→wake。已有本会话engine及空闲成员时，在计划模式输入@成员或@all留言会直接再启动成员，包括写入成员。没有新Coordinator模型请求也能触发，工具自身的Plan检查无法保护此slash入口。

在swarmCommand.ts的message分支、任何留言写盘/唤醒前检查当前Config审批模式。PLAN时通过现有catch输出双语error并本地返回；整条message操作拒绝，包含未提及成员的留言，不尝试解析提及后放行，不更改模式。用户显式离开计划模式后正常留言、公开板追加与唤醒语义保持。status仍可读取，cancel和本地配置逻辑未修改。

## E-533 必要源码检查

新增zh/en两个真实引擎回归：建立researcher并等待首轮结束，在Plan上下文通过实际slash message发@reader，要求无第二轮/所有保存文件字节保持/模式不改/准确双语error；再换正常上下文明确留言，仅增加一轮并保留正常waiting结果和累计turn=2。finally取消自有engine后既有fixture清理自建临时目录。

原源码两项实际行为失败，runner原多执行一轮，退出1。修后swarmCommand相关完整文件18项通过（新2+旧16），退出0；非全量/冒烟。CLI tsc --build与双TS eslint --max-warnings=0首次均退出0。之后只Prettier调整测试格式，两文件check与git diff --check退出0，纯格式不重复行为测试/编译。

## E-534 Windows编译入口

verify-source-swarm-plan-message.mjs使用独立home/profile与真实Config.initialize、setApprovalMode、编译swarmCommand message/status入口和实际SwarmEngine。coder runner可控，只在隔离workspace写turn-marker.txt；不调用LocalAgentExecutor或LLM，不冒称执行器/真实模型质量验收。

先正常完成首轮marker=1；切PLAN后分别中文@author和英文@all留言均本地拒绝，不运行writer、不改变marker或保存状态/留言板、保持PLAN，提示各语言准确。Plan中status仍可看且不写盘。显式切DEFAULT后留言仅触发第二轮marker=2，成员waiting/result新报告、任务仍active，turns=2/failedTurns=0/requests=0，模式保留DEFAULT。

17条件全部true、11530ms、首次Windows脚本退出0。0模型/外部fetch/HTTP/付费/旧任务重跑；1次fetch是CLI Ink/Yoga的内嵌data WASM装载，守卫仅允许data内容，不是网络访问。没有把fetch原始次数写成0。finally cancel自有engine、dispose自有Config、恢复fetch/DrillStore，经realpath及父目录/前缀核验只清自建temp根。

## 证据、保全与边界

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：swarm-plan-message-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-cli-compile.log、-lint.log、-format-write.log/-format.log；verify-source-swarm-plan-message.mjs、source-swarm-plan-message.log/-result.json；verify-swarm-plan-message-preservation.mjs、source-swarm-plan-message-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份真实旧失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装或旧未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。三份同SHA交接，目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

本阶段仅关闭CLI留言新唤醒入口，不保证进入Plan会取消或暂停此前已活动的任务，也不声称解决成员内部通信或所有执行入口的动态审批模式切换。实际原生终端输入/视觉、真实复杂协作质量、跨电脑逆向运行及最终分发仍待。接续优先检查计划模式切换后的排队成员/实际Agent入口是否重新读取模式，按真实可达缺陷修复，避免扩大成无证据的整体重构；goal active。
