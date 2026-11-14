# Gemini Ultra CLI 失败历史界面交接

日期2026-11-14，源码工作始于11月13日。WI-201 / E-455至456 / F-158。基线f4b57903222ff18b6aa7d576c1354b028908bb46，分支codex/ultra-agent-portable。上一轮失败全文归档已提交推送，属progress；本轮把已有能力接到用户可见界面。整体goal active，源码优先→Windows必要定向验证→功能收敛后统一打包；无打包、全局重装、升版本、多平台CI或旧付费任务重跑，preview.83保持。

## 源码

原Swarm失败全文已保存，但/swarm status、看板和演练台任务详情没有历史入口，恢复清除当前lastError后用户看不到过往失败和永久归档缺口。新增swarmFailureHistorySummary元数据投影：count/incomplete/omitted/archivesChecked=false和最近4次turn/outcome/全文路径。仅从已有记录生成，不读正文、不创建模型索引或修改任务；字段缺省按0次处理，不发明旧历史。

任务详情API与公开status snapshot使用同一投影；终端status双语列次数、最近4次路径和更早省略数，终端看板显示紧凑摘要。演练台使用原生details/summary展开最近4次，并给出reports命令；缺失状态在折叠标题就显示“历史不完整”，展开后解释完整导出不可用、原任务与可用数据保留。所有文字按现有textContent呈现，不使用innerHTML，不新增链接或读取任意路径。文案明确只显示保存引用、未校验内容、失败历史不是当前结果或审核通过。

沿用ui-skills-root路由及baseline-ui既有组件优先/错误靠近上下文/紧凑信息原则；无新动画、布局框架或依赖。技能目录读取、个人设置、Agent权限、预算、归档校验与完成审批未改变。页面改动为生成JS内的显示函数，未全文件重排。

## E-455 定向源码检查

agentTaskDetails8项通过：新增6次历史只返回最近turn3至6、2次省略、持久gap、archivesChecked=false；故意删除fixture archive后仍能显示元数据，不读取私有正文、不生成文件、不改状态。CLI swarmCommand16项通过，含中文/英文历史计数、缺失、最后4次路径及无副作用；SwarmBoard原有1个交互场景扩展中英历史/gap显示，仍验证刷新与Esc。共25不同相关检查通过，无新增skip。未对旧实现实跑新增测试，不补称旧失败复现。

core严格tsc、CLI严格tsc及折叠标题最后修改后的CLI tsc退出0。11个本轮源文件eslint --max-warnings 0退出0；标题最后调整后单page文件再次lint。10个完整TS/TSX文件prettier --check及git diff --check退出0；生成页原有格式保持，仅修改行。不跑全量/冒烟、不新增模型调用。

## E-456 Windows HTTP与实际浏览器

独立home/profile、真实本地Drill Cockpit HTTP API、两个保存成员：reader6次历史、storage-gap1次并标历史不完整；所有fixture归档已删除，仍仅读取元数据。API200、最后4次turn3/4/5/6、省略2次、gap、未声明正文已校验、私有正文未读/未显示、任务字节保持、生成JS可解析、无任务提交/外部调用，共10条件true。最终记录24905ms/退出0（含模块初始化，不是稳定性能基准）。

CUA实际页面检查：中文选择任务并展开gap，标题在折叠态直接显示“失败历史 · 1 次 · 历史不完整”，正文显示导出不可用及引用未校验；切英文后重新选择任务，展开reader显示Turn3至6和2 earlier attempts，再展开gap显示英文说明。原生summary可展开/折叠；截图工具输出观察到归档路径换行、正文与警告，无正文注入执行。截图仅在工具输出，未单独落盘；未做全分辨率或屏幕阅读器验收。

首次11月13日检查时发现gap隐藏在折叠内部，改为同时放标题后重新编译；临时服务重启后同URL仅hash变化不会重新执行旧页面token初始化，旧页显示凭证失效，此为验证会话旧页面，不据此放宽token校验。11月14日接续时原进程handle缺失，检查45678无监听且无对应node进程后才重启；新独立tab带当前临时凭证，完整中英文检查通过。凭证不写入正式报告或产品配置。

浏览器检查结束写fixture finish后服务正常退出0，retention passed=true：任务文件hash全保持、submissions=0/external=0，临时根按脚本finally校验前缀后清理成功。之前被拒清理的ultra-cockpit-review-scope-S0wWvh没有重试。切语言沿用既有页面重载并回默认配置面板行为，本轮没有修改该行为，不宣称选中任务/折叠状态跨重载保持。浏览器没有运行模型/Agent/巡检或设置凭据；语言仅写独立fixture locale。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- failure-history-ui-core-test.log/-core-junit.xml（8通过）、-cli-test.log/-cli-junit.xml（17通过）。
- failure-history-ui-core-compile.log/-cli-compile.log/-final-cli-compile.log、-lint.log/-final-page-lint.log、-format.log/-test-format.log/-format-check.log/-final-format-check.log。
- preview-source-failure-history-ui.mjs、source-failure-history-ui.log/-result.json；failure-history-ui-browser-retention.json；browser-live为临时fixture定位记录，不引用为永久URL。
- verify-failure-history-ui-preservation.mjs、source-failure-history-ui-preservation.json。

F-158 -> 失败历史已存但用户入口不可见。元数据投影与双语status/看板/详情修复；不把显示引用当归档存在或最新校验，不改变任务状态。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83保持；E-294/E-364旧复杂真实任务SHA和passed=false保持，无覆盖/付费重跑。未改个人数据库/凭据/工具安装/PATH。

沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部安全扫描。维护目标池、case四项和证据，三份交接全文SHA一致。Obsidian连接工具本轮已移除，使用本地文件独占创建并核对SHA写入Vault，不覆盖旧笔记。显式stage、skip ci推隔离分支，不合并master/Release。整体goal active；继续源码功能收敛，更多模型/长会话、复杂真实交付质量和最终Windows/macOS/Linux统一包未验收。
