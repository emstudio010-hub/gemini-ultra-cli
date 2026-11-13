# Gemini Ultra CLI 演练台复核范围交接

日期：2026-11-13。WI-185 / E-423至424 / F-142。源码基线 de785a59609b9aa714fbf943370d06d4ce4172e6，分支 codex/ultra-agent-portable。上一 goal turn有源码和验证进展；整体 goal active。按用户要求继续源码完善、Windows必要定向验证、最终再统一打包；没有打包、重装、升版本、跨平台CI或付费任务重跑，全局 preview.83 保持。

## 源码与显示

终端已有复核范围和历史快照说明，演练台保存任务详情缺少相同信息，难以判断旧通过覆盖哪些文件。本轮只补齐只读显示，不增加文件扫描或审批入口：

- agentTaskDetails.ts 从保存的 reviewFiles / reviewedFiles 提取范围类型、前8路径、总数和省略数、是否保存历史快照；明确 currentFilesChecked=false，不暴露快照目录或SHA。
- Boost / Teamwork显示未声明、显式空清单仅成员报告、N文件；Swarm仅workflow-auditor显示，普通成员和Grill me需求访谈不显示文件复核。
- drillCockpitPage.ts新增原生DOM文本渲染与中英文提示，超8项指向现有status命令。说明“已保存仅为历史记录，面板未重新核对当前文件”或“尚未保存，面板不会检查/批准任务”。
- 沿用现有按需任务目录、4秒可见页选中详情刷新及JSON签名不变不重绘。没有扩大轮询、读取交付物、完整长报告或调用模型。没有新增依赖、权限、图标或动画。

## E-423 源码定向

agentTaskDetails.test.ts共7项通过：既有四任务类型/有界预览/损坏board/模式与路径检查，新增files/member-reports/undeclared及普通成员/复核员/访谈区别。files用10个不存在路径，返回前8和剩余2；保存范围查询前后任务字节相同。

core严格tsc退出0；CLI严格tsc首次及转义修正后退出0；三个修改文件eslint --max-warnings 0退出0；最终prettier --check及git diff --check退出0。首次新增前端helper在TS模板内少一层换行转义，实际生成浏览器脚本vm.Script检查SyntaxError，已修为双层转义；不是只用TS编译证明浏览器代码。换行风格检查一次不通过，最终格式化通过。未跑全量/冒烟；无旧源码失败复现，本轮为界面能力补齐，不伪造缺陷复现。

## E-424 Windows实际服务与页面

Node v24.19.0、编译源码真实 connectDrillSession/startDrillCockpit 服务，独立mkdtemp profile、任务根、locale、runtime、prompts及Drill SQLite，不接真实provider。四workflow及一Swarm保存夹具，复核工作区不存在，workflow长归档故意损坏、Swarm归档不存在。实际目录API及5次详情共6请求，15条件通过，6234ms；生成页面内两个script块均通过语法解析。

CUA实际内置浏览器打开服务，中文选择5个任务、英文选择3个workflow，12条件通过：前8路径/剩余2，历史说明，中英文未声明/仅报告，普通成员与复核员分开，Grill me不显示文件复核；文件名 <img src=x>.md 是文字、无img DOM，控制台无error。中文截图在工具记录中已目视检查，本轮未保存截图文件，不声称独立视觉产物。页面未点击提交、执行、巡检或审批。

查看前后task目录全文件SHA相同，submissions=0、externalRequests=0；不重建缺失预算。实际API/浏览器检查均通过，但验证器最后清理独立SQLite目录遇到Windows EPERM，因此进程整体退出1，不能记作完整退出0。已给验证脚本finally补DrillStore.resetInstance释放数据库，未重跑本轮UI来覆盖原记录；修后的清理行为未重新验收。

进程退出后已核对专用临时目录为普通目录、绝对路径位于系统Temp。两次PowerShell递归删除（计算目标及显式LiteralPath）均被自动审批拒绝，只提供“blocked by policy”，没有进一步具体原因。未换方式绕过；暂留 C:/Users/Administrator/AppData/Local/Temp/ultra-cockpit-review-scope-S0wWvh，不影响源码/个人配置。本轮后续可沿用释放SQLite的夹具生命周期；旧临时目录清理未完成。

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- cockpit-review-scope-test.log / -junit.xml（7通过），-core-compile.log / -cli-compile.log / -lint.log / -final-format-check.log。
- verify-source-cockpit-review-scope.mjs、source-cockpit-review-scope.log / -result.json（15条件；日志最后保留EPERM）；初次脚本误断言script块数量为1的夹具失败另存 source-cockpit-review-scope-fixture-script-count-failure.log，改为解析全部块，无产品放宽。
- cockpit-review-scope-browser-result.json（CUA观察结果转录，12条件）、-browser-retention.json（任务SHA保持）。live.json含仅本地服务临时token，不提交到Git。
- verify-cockpit-review-scope-preservation.mjs / source-cockpit-review-scope-preservation.json。

F-142 -> agentTaskDetails / drillCockpitPage：历史任务在面板缺复核范围及新旧界限。保存元数据与明确只读提示补齐；不是当前交付文件的重新检查、重新批准或事实正确性验收。

## 保全与接续

preservation passed=true：个人provider、locale、skill-tags精确SHA保持，ultra-tools.json不存在，全局preview.83。E-294/E-364旧真实复杂任务 passed=false 及精确SHA保持，无付费重跑；复杂模型交付质量仍待。不改个人数据库、凭据、工具安装或PATH。

沿用granted case / PRIMARY R26 code-audit，同会话lead/cae/doc，无Codex子代理、外部扫描。更新目标池与case记录，三份全文SHA一致；显式stage本轮文件，提交skip ci并推codex隔离分支，不合并master/Release。

后续继续Agent实际交付及Windows源码收敛。保留复杂真实任务质量、更多模型、最终Windows及macOS/Linux包验收边界；整体goal active。
