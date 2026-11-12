# Gemini Ultra CLI 内置逆向工作流指引交接

日期：2026-11-12。WI-117/E-288。goal
active，preview.82已安装；本阶段更新随包local-reverse技能资产，不改工具执行逻辑，0付费模型，不改个人配置、数据库或逆向工具。

## 实际缺口与更新

旧技能没有介绍已实现的binary_decompile，binary_analyze只说numeric地址而没有说明高64位精确字符串，以及与反编译地址纯十六进制的区别。旧事实记录没有具体状态语义，协作只说spawn_subagents，未衔接已实现的Swarm成员身份与独立复核。

更新后按初筛→本机发现→rabin2元数据→r2函数/指令/引用→Ghidra单函数反编译→完整工件与事实→协作复核推进。明确高地址不得经Number/科学计数法，十进制转反编译地址需整数精确转换；不指定address不保证选中被问函数，须核对functionName/address/imageBase/selection及样本变化。截断时读取codeArtifact/reportArtifact/logArtifact，保留完整哈希与版本。vuln默认unverified，static-reviewed与verified必须区分证据；Swarm已有成员公开留言和交付，不可假定只读成员有shell或派生权限。

参数、时限、工件字段、Java优先级及事实状态已逐项对照binaryAnalyze.ts、binaryDecompile.ts、ghidraRuntime.ts、drillTools.ts/drillStore.ts、ultraSpecialists.ts。语言、授权与最小验证限制保持。只修改技能Markdown、安装说明和打包版本，不新增测试套件，不重跑未变更type/lint/反编译/付费协作；打包仍执行其既有构建。

preview.82已完成本地打包、实际SkillManager发现/ActivateSkillTool激活和本机安装核对。独立home/workspace核对随包技能与源码逐字相同、isBuiltin标识、内置确认路径及正文传递；0模型/网络，不证明模型遵循或新跨平台验收。preview.81/run43229958229三平台执行基线保持，不为Markdown资产变更重跑。R26本地源码接口对照沿用既有scope及lead/cae/doc。不合并master、不正式Release。

## 本机交付结果

E-289：preview.82实际随包SkillManager在独立home/workspace发现local-reverse，isBuiltin=true且路径为bundle/builtin/local-reverse/SKILL.md，整份资产与源码逐字相同。实际ActivateSkillTool在ask_user确认路径下因内置技能返回false，执行后激活标识成立且完整skill.body进入llmContent；反编译/精确整数转换/样本变化/事实状态/Swarm复核指引均实际送达。技能SHA256
52423e82976ffd2cfc7abb4b22fbfe601b054bb261907016ffa8a990c47a8efb。0模型/网络，无新测试套件或原生逆向软件调用。此为真实资产加载/激活核对，不等于模型遵循或完整逆向任务验收。

E-290：产品源7285732b19f394c32f51a880c356d65fe8ac1a5b本地package:ultra构建preview.82，包/入口SHA、源码身份、六rg身份权限和随包文档版本核对通过；所测stage的425文件匹配归档。offline已有缓存安装7287ms/退出0，双命令82、425已安装文件匹配同一归档。包SHA256
97bbab0f2cdc323ce0155543e8307ab26bf27f7e226305f237e2a78286da6b54，入口SHA256
a994b83d7bffc408f4e902607a980407aed9b8676630bb398554d914256d71a3。个人locale/provider哈希保持81末值，ultra-tools.json仍未创建，旧包保留。WI-117工作流技能指引交付，只有Markdown资产及打包版本改动；未重复全量/冒烟/type/lint/付费或未变更协作逆向链，既有package构建照常执行。81三平台执行基线保持，不称82新三平台验收。goal
active，不合并master或正式Release。

最终证据：local-reverse82-activation-result.json/-log、local-preview82-package-verification.json/-log、global-local-preview82-install-result.json、global-install-local-preview82-full-result.json、local-reverse82-personal-config.json。源码报告/工程正式报告/Obsidian全文同步。

后续以完整任务推进：在既有工具允许的环境中围绕自建多函数样本串联函数定位、调用关系与反编译交接，先复用现有证据，不重跑旧付费任务；仍需区分实际原生输出与模型语义验收。复杂格式、动态分析与更多真实长协作仍未完成。
