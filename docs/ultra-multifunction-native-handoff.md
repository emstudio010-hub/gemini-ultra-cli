# Gemini Ultra CLI 多函数原生逆向交接

日期：2026-11-12。WI-118/E-291至293。goal
active，当前安装仍为preview.82。本阶段补多函数实际原生证据，没有产品缺陷证据，不修改稳定工具或发布新版本。

## 实际任务与结果

在独立home/workspace生成只供静态分析的无导入ELF64，三个手工汇编函数，样本SHA256
ba007f2c489e2b1ed18d25f15145ee8b4e3d611cfe79340e87eb38e4b2f75c88。它不是可直接运行的应用，未执行。使用已安装preview.82的真实工具入口，实际本机rabin2/r2/Ghidra12.1.4及JDK分析，0模型/网络。

| 函数                       | 地址     | 实际观察                              |
| -------------------------- | -------- | ------------------------------------- |
| normalize_input            | 0x401000 | 有符号分支把输入限制在[0,100]         |
| compute_score              | 0x401040 | 调用归一化，随后lea eax,[rax+rax*2+7] |
| sample_entry（r2称entry0） | 0x401080 | mov edi,0x36后调用计算函数            |

两个CALL及反向引用一致：0x401089→0x401040，0x401044→0x401000。三个Ghidra选中地址、样本SHA、源码未变标识、完整code/report/log工件及codeSha均核对；完整代码摘录见independent-static-review.json。静态可推导入口这一路径计算169，但这不是实际运行输出、程序退出码或动态验证。

## 保留的不确定性

Ghidra把compute_score显示为int
compute_score(void)，其中normalize_input()也省略参数；入口被标记为void
processEntry。不能把这些推断原型当作原始C接口或无参数证明。已读取入口/计算/归一化三个实际指令窗口交叉核对EDI数据流、CALL、signed分支及算术；没有修改伪代码伪装正确。r2元数据的提示也保留，不把静态分析当完整格式兼容或行为证明。

首检查器要求入口函数名等于sample_entry，因r2显示entry0而失败；地址0x401080正确，实际xref同时包含realname
sample_entry。原first-result.json及日志保留，按地址核对身份后从已有结果继续。三次Ghidra调用各只执行一次；追加指令和事实交接时复用已有工件，未重复前序原生分析。

## 交付与边界

E-291：新样本、实际初筛/元数据/三函数发现。E-292：两调用边、三函数Ghidra完整工件及指令交叉核对。E-293：通过实际drill_record_fact写入一条普通note，包含完整样本SHA、调用链、原型不确定性和工件路径；随后实际drill_query_facts查回相同记录，不标为vuln或verified。共13次唯一工具调用：1初筛、1元数据、1函数列表、3指令窗口、2引用、3反编译、1事实记录、1事实查询。各次续接只执行尚未保存的步骤；不是13次付费请求或测试套件。

个人locale/provider哈希保持82末值，ultra-tools.json仍不存在；不改个人数据库、工具安装或PATH。当前双入口82及425文件安装基线保持；81为最近三平台运行基线，本轮仅Windows本机实际原生任务。没有全量/冒烟、旧付费协作或其他未变更检查。

工程证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu/preview82-multifunction-native。保留generation-manifest.json、01至13原始工具响应、result.json、first-result.json、pre-instruction-review-result.json、pre-fact-handoff-result.json、independent-static-review.json、独立facts.sqlite及home下三份decompilations完整工件。生成/接续脚本run-multifunction82-native.mjs、静态复核脚本review-multifunction82-native.mjs及分阶段日志保存在工程目录。

本轮是脚本编排实际原生工具及宿主独立静态阅读，尚不是模型自主完成这条多函数任务或Swarm复核。下一步可把这些现有原生证据交给一次新的有界Agent协作任务，要求识别参数原型不确定性并生成可追溯报告，复用工件而不重复反编译；旧E-156/E-163/E-212/E-260任务不重跑。整体上线、复杂格式、动态逆向及长任务语义仍未验收。R22/R7本地自建样本沿用既有scope，lead/cae/doc在本会话承担。goal
active，不合并master或正式Release。
