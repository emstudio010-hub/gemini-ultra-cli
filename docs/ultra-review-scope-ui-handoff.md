# Gemini Ultra CLI 复核范围双语状态交接

日期：2026-11-13。WI-178 / E-409至410 / F-135。源码基线ab5f8928d896141fced9daaa31fdd564ff4fdb12，分支codex/ultra-agent-portable；上一goal turn有真实源码/验证/同步进展，整体goal active。保持源码→Windows必要定向验证→最后统一打包顺序，本阶段无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 可见性问题与修复

前两阶段已给Swarm/Teamwork/Boost增加明确文件复核范围与历史快照，但CLI status和SwarmBoard没有展示清单/快照含义，用户看不出旧任务未声明、纯成员报告和真实文件审核的区别。Workflow文件变化若同时耗尽失败预算，status只显示通用budget exhausted，具体本地原因只藏在报告里。新固定错误仍为英文，中文模式会混杂英文说明。

agentTaskLabels新增共享agentReviewScopeText，只读传入的已保存元数据，区分未声明、显式[]纯成员报告、N文件清单，以及尚无快照/历史快照。历史快照明确“不重新核对当前文件”；不在render/status中重新hash、重新批准或修复状态。路径JSON.stringify转义，保持路径原文且转义控制字符。常规status展示完整声明清单；SwarmBoard压缩显示前2个路径及剩余数、最多最近2名非killed复核员，更多提示/swarm status，避免看板被长列表淹没。

Workflow status（Boost/Teamwork，Grill-me访谈不加文件范围）显示清单/快照；最新报告为失败native-file-check且与stage不同时，额外显示保存的文件核对原因，即使stage只是预算耗尽。Swarm status按auditor显示范围并本地化其lastError；SwarmBoard在复核员范围旁显示已保存错误，并明确快照仅历史记录。未新增按钮/动效/键盘行为或轮询频率。

agentTaskStageLabel增加final audit file check中文名，并将已知四条固定复核诊断在显示层转中文；未知/模型自写诊断保持原文，英文原文保持，不翻译/覆盖保存的报告、路径、模型ID或verdict。不存在“已保存快照=当前文件检查通过”的新声明。原始scope和正文均仍可导出。

本轮先读Obsidian接续，使用ui-skills-root按craft路由读取baseline-ui最小上下文，沿用Ink/theme/已有键盘组件，不加入Web依赖；用户已有整体推进授权，不增加审批流程。安全工作沿用granted case/PRIMARY R26，本阶段为本地状态UI维护，无外部扫描或子代理。

## Windows证据

E-409：3个不同相关检查通过。扩展既有SwarmBoard渲染场景：真实临时task/文件快照，先删除被审REPORT，再渲染英文→新增留言/安全过滤→中文→英文→Esc，确认两语言范围/历史说明、原成员状态字节不变及已有键盘/刷新正常。另两个历史Swarm和Workflow status对照保持，不读取损坏latest或创建缺失账本；首筛选未命中workflow（显示27 skipped），之后以准确名称单独运行通过，未冒称首轮就覆盖它。

CLI严格源码tsc、五文件eslint --max-warnings 0、prettier --check、git diff --check退出0。core无修改，不重复core编译/模型/文件审核流程测试；没有全量/冒烟或为简单文本函数另建镜像单测。

E-410：Windows Node v24.19.0编译源码status handler，最小CommandContext fixture配真实产品保存状态。受控低层runner建立：失败预算1的Workflow最终文件变化、本轮合法Swarm文件snapshot、未声明旧任务、已完成[]成员报告、Grill-me访谈。显示前删除两个实际交付文件；hook fs.readFileSync/openSync监测这些精确路径，若读取即失败。11次真实status handler调用（5类型×中英+控制字符路径1次），逐次核对任务记录字节不变。

验证18条件通过：中文/英文文件范围及快照说明、预算耗尽下仍显示保存原因、原英文诊断保持、未声明与[]可区分、Grill-me不冒称文件审核、含ESC的声明路径被转义、0交付物read/open、0HTTP/模型请求、Swarm request计数0。耗时5779ms，验证器退出0；保留展示frames JSON。该场景没有Config bootstrap、终端ConPTY或浏览器；看板实际Ink渲染由E-409覆盖，不把handler输出称作真实终端视觉验收。

首验证器把所有fetch都禁止，导入Ink/Yoga时拦截嵌入式WASM data: URL而退出1，未到状态检查；first.log保留。仅允许data:通过原fetch，HTTP仍禁止并计数，最终1次嵌入式WASM/0网络成功。此为验证器边界修正，没有更改产品绕过网络或修饰首失败。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu
- review-scope-ui-test.log/-junit.xml、-workflow-test.log/-workflow-junit.xml。
- review-scope-ui-cli-compile.log、-lint.log、-format.log、-final-format.log、-format-check.log。
- verify-source-review-scope-status.mjs、source-review-scope-status-first.log、source-review-scope-status.log/-result.json/-frames.json。
- check-review-scope-ui-evidence.mjs、review-scope-ui-evidence-summary.json。
- verify-review-scope-ui-preservation.mjs、source-review-scope-ui-preservation.json。

F-135 -> CLI agentWorkflowCommands.ts / swarmCommand.ts / SwarmBoard.tsx：文件复核范围/历史性质不可见、预算耗尽时本地文件诊断被通用stage遮蔽。共享显示函数及本地化诊断修复可见性，不声称新增文件门禁或真实任务质量。查看状态不重新检查当前文件；历史completed仍是当时状态而非持续文件完整性保证。尚未翻译所有模型自写原因，也未做演练台Web看板范围展示或所有窄终端视觉验收。

## 保全与接续

preservation passed=true：个人provider/locale/config/skill-tags.json精确SHA保持，ultra-tools.json不存在，全局preview.83；没有改个人数据库、真实凭据、工具安装或PATH。E-294/E-364旧真实失败SHA与passed=false保持，不覆盖/重跑，受控显示验证不等于复杂真实模型准确性已过。

独立profile和专用mkdtemp，恢复fetch/fs hooks、停止fixture成员后核对父目录/前缀再清理。更新目标池及workitems/timeline/field-journal/evidence；源码/工程/Obsidian三份报告全文SHA一致，显式stage本轮文件、skip ci提交推隔离codex分支，不合并master/Release。

继续收敛真实Agent交付与用户可见状态，复杂真实任务质量及最后平台包仍待验收；整体goal active。
