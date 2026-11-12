# Gemini Ultra CLI 真实红队 Swarm 与事实验证状态交接

日期：2026-11-12。WI-107/E-260 真实任务；WI-108/E-261/F-073 默认验证状态修复。R26/code-audit，自有生成源码，沿用 work/gemini-ultra-agent-20261110/scope.md 的 granted 范围；lead/cae/doc。本机当前preview.73，持续goal
active。

## 真实任务交付

安装的preview.72使用现有已配置 deepseek/deepseek-v4.1-flash，通过真实 /redteam
on、/swarm prepare、/swarm budget 28 1 3、/swarm
resume 完成一次新任务。两名redteam-analyst（exports、records）并发检查两份生成的本地源码、记录各一条事实并公开交接；协调者写中文SECURITY_REVIEW.md，workflow-auditor独立读取报告、源码与实际SQLite事实后给出当前revision
verdict，Swarm完成。三成员各一轮，无替换/纠错重跑，自然退出0、未超时；120637ms，20次实际模型请求（main9、analyst8、auditor3），应用预算记录19/28、0失败/3唤醒，观察器总请求32硬上限未触发。两种计数来源分开保留，不把19当作实际HTTP总数。

仅处理生成的export-route.mjs、record-route.mjs及SPEC。没有执行源码、shell、测试、网络扫描或外部安全目标；记录事实与公开留言是允许的写入。分析成员实际模型工具表无write_file/shell/replace/manage_swarm/spawn_subagents。四份原文件SHA保持，仅新增报告，个人供应商文件SHA保持；临时凭据副本退出后移除，无备份残留。不是复跑E-163等旧付费任务。

宿主独立静态核对报告与源码：F-EXPORT由可控exportId经path.join进入readFile，报告正确保留.json后缀限制；F-OWNER在认证后按可控recordId取完整记录，缺少契约要求的ownerUserId归属校验。行号、前置条件、静态边界、修复建议均有源码依据；报告明确未执行样本/未进行网络扫描，无虚构CVE或成功利用。报告SHA256为7d44524b5350b751936a298b701939a55aaee7a89eb3332dbeb9d724c347b329。该结果证明此有界真实组合可用，不扩展为任意真实服务、复杂漏洞或长会话质量保证。

20条HTTP观察均200且有usage；合计供应商上报prompt313740/completion10407/total324147
token，不换算费用或断言计费缓存口径。20条克隆流观察均在收到DONE/finish
reason/usage后记录AbortError，原始incompleteRead字段保留；有DONE/finish
reason与usage的观测不等于完整传输正文无异常。CLI实际返回、工具结果、SQLite和最终独立verdict构成业务交付证据，不靠观察器无错断言。

## 实际发现的产品缺陷

宿主发现两条源码静态事实在库内均被自动标为verified。根因DrillStore.recordVuln用data.status
||
'verified'，即使调用者未提交状态或任何证据也自动提升；SQL定义自身默认unverified，但被INSERT覆盖。旧工具无status选择。原真实任务结果JSON保持passed=true（其任务与报告契约通过），独立宿主审查单独记录F-073，不能隐藏缺陷或回写历史事实使旧任务看似正确。

新写入默认unverified；工具增加可选status：unverified、static-reviewed、verified。静态源码审查用static-reviewed，进一步的明确佐证可声明verified；两种提升状态必须提供非空evidence。helper校验枚举/分类，底层Store也拒绝无证据的两种提升状态。工具返回实际记录状态；红队角色提示说明事实归档本身不验证漏洞。状态是调用者提交的证据阶段，不是独立认证或防幻觉保证。

演练台原“类型/状态”列现在同时显示漏洞验证状态，分别为待验证、已静态审查、已验证，中英文即时显示；未知历史状态保留原值，不自动改写历史数据库。本轮只增状态文字，无新布局或视觉验收。底层既有显式自定义历史状态的兼容路径保持，工具生产端限定三种标准状态。

Evidence → Finding → Path：E-260真实静态事实自动verified + 3旧源码回归失败 →
F-073不当自动提升 → 默认待验证/显式阶段/证据要求/面板与角色提示 →
3定向通过、strict core/CLI types、相关lint、core
build及实际工具/SQLite链通过。没有全量/冒烟，没有重跑付费任务。

verify-ultra-drill-verification.mjs使用实际工具类与Config，在独立profile中执行默认候选、显式静态/verified和普通note；拒绝5类不当写入，重开SQLite保留各状态，旧verified空证据行逐字段保持。0模型/网络。preview.73已通过三平台drill-verification范围分发并安装，72及以前未受影响证据保持，不合并master或正式Release。

## 工件

工程目录C:/Users/Administrator/Documents/ChatGPT/gmncliu：preview72-live-redteam-swarm-result.json、-independent-review.json、-usage-summary.json、-requests.jsonl、-wire.jsonl、-output.txt、-workspace/、-records/、-scratch.json和-run.log；run-live-redteam72.mjs与observe-live-redteam72.mjs。真实任务禁止自动重复。

修复证据：drill-verification-before-junit.xml/-before.log、drill-verification-junit.xml/-log、drill-verification-types.log、drill-verification-cli-types.log、drill-verification-lint.log、drill-verification-added-lint.log、drill-verification-build.log、drill-verification-source.json/-log。个人语言/供应商/数据库/逆向工具不改；生成任务的原库仍保留旧verified行以便追溯。

## 三平台交付结果

E-262：产品源0825de97cfb9acb15a49ff3c3ce5014c535d24f4/run43214426367三平台drill-verification范围completed/success；minimum-node、native-address-recheck及旧无关链skipped。独立核对三包版本73、源chunk、包/入口SHA、六rg身份权限及安装4基础工具。每平台实际包Config、DrillRecordFactTool及SQLite通过：候选默认unverified、显式static-reviewed/verified、无证据提升及非法状态/分类拒绝5次且不写入、普通note保持、重开库后4事实/3状态保持、历史verified空证据行保持原字段。0模型/网络，未重新运行真实付费任务或无关逆向协作链。

E-263：offline已有缓存安装6821ms/退出0，双命令preview.73，425文件匹配Windows
CI包。包SHA256
7354dd64103357b22707811e637f438eca354c9e6ef1786b7883f57f466a12d4，入口SHA256
281a300dd6a74cb28c25b01b70252ad60a2df687cb4f8fcc848d4068c28e65ef。旧包保留，个人locale/provider哈希保持72末值，ultra-tools.json仍未创建。WI-108/F-073默认候选状态修复分发交付；显式状态仍是调用者声明的证据阶段，不能证明证据语义真实，历史记录不自动重分类。E-260真实双红队Swarm有界交付保持，旧事实的verified缺陷原证据保持。无全量/冒烟/额外付费重跑，持续goal
active，不合并master或正式Release。

最终证据：github-preview73-run.json、github-preview73-artifacts-result.json、github-preview73-artifacts-verification.log、github-run-43214426367/、global-preview73-install-result.json、global-install-github-preview73-full-result.json、drill-verification-personal-config.json。源码、工程正式报告和Obsidian全文同步。

下一代码线索：queryFacts在可用FTS关键词路径直接返回索引行，而普通列表返回canonical事实；尚未为此路径增加新回归或修改，不能假称关键词返回的状态字段已核实。持续按实际使用缺口推进，不重跑旧付费任务。

脱敏核对：preview72-live-redteam-swarm-redaction-check.json对生成任务28份工件只读匹配当前凭据/自定义header值，命中0；不打印值，不声称穷尽所有秘密。UI只增加状态文字，类型/lint通过，未额外打开浏览器作视觉检查。
