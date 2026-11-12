# Gemini Ultra CLI 内置逆向工作流指引交接

日期：2026-11-12。WI-117/E-288。goal
active，前置preview.81；本阶段更新随包local-reverse技能资产，不改工具执行逻辑，0付费模型，不改个人配置、数据库或逆向工具。

## 实际缺口与更新

旧技能没有介绍已实现的binary_decompile，binary_analyze只说numeric地址而没有说明高64位精确字符串，以及与反编译地址纯十六进制的区别。旧事实记录没有具体状态语义，协作只说spawn_subagents，未衔接已实现的Swarm成员身份与独立复核。

更新后按初筛→本机发现→rabin2元数据→r2函数/指令/引用→Ghidra单函数反编译→完整工件与事实→协作复核推进。明确高地址不得经Number/科学计数法，十进制转反编译地址需整数精确转换；不指定address不保证选中被问函数，须核对functionName/address/imageBase/selection及样本变化。截断时读取codeArtifact/reportArtifact/logArtifact，保留完整哈希与版本。vuln默认unverified，static-reviewed与verified必须区分证据；Swarm已有成员公开留言和交付，不可假定只读成员有shell或派生权限。

参数、时限、工件字段、Java优先级及事实状态已逐项对照binaryAnalyze.ts、binaryDecompile.ts、ghidraRuntime.ts、drillTools.ts/drillStore.ts、ultraSpecialists.ts。语言、授权与最小验证限制保持。只修改技能Markdown、安装说明和打包版本，不新增测试套件，不重跑未变更type/lint/反编译/付费协作；打包仍执行其既有构建。

候选preview.82待本地打包、实际SkillManager发现/ActivateSkillTool激活和本机安装核对。独立home/workspace核对随包技能与源码逐字相同、isBuiltin标识、内置确认路径及正文传递；0模型/网络，不证明模型遵循或新跨平台验收。preview.81/run43229958229三平台执行基线保持，不为Markdown资产变更重跑。R26本地源码接口对照沿用既有scope及lead/cae/doc。不合并master、不正式Release。
