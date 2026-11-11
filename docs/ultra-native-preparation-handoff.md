# Gemini Ultra CLI 分析准备期取消与字面路径回滚交接

日期：2026-11-11。WI-100/E-241/F-066/F-067，候选preview.67。R26/code-audit自有源码case、lead/cae/doc、scope
granted继续。人工文本/安装目录与独立profile/数据库，0模型，不改个人配置/数据库或本机逆向工具。

## 已确认缺陷与修复

F-066：binary_decompile在入口检查signal后，异步准备安装配置、样本副本和项目，准备结束没有再次检查取消。新增回归在最后project目录mkdir完成后取消，旧代码实际仍调用一次execFile，尽管最终因signal拒绝返回。新增样本读取后、开始工件准备前及Java启动前的signal复核；已创建的scratch仍由原finally删除，日志按原设计保留。没有改Java参数、超时、输出或原生进程树终止逻辑。公共core出口补齐BinaryDecompileTool/decompileBinary，与已有inspect/analyze一致；产品入口继续传Config.read校验，direct
helper调用者按原签名自带范围规则。

F-067：回滚脚本用new
URL('./'+basename,import.meta.url)拼接文件名，合法#被当fragment、%20被解码成空格，原Node回滚实际ENOENT。改为fileURLToPath(import.meta.url)得到脚本实际路径，再dirname/path.join拼接JSON编码的字面basename。仍以脚本所在目录为基准，可一起迁移备份、脚本和目标后回滚；不依赖原电脑绝对目录，不使用shell转义。既有脚本文件不被自动改写，老工件仍保留原行为，新生成脚本使用修复。

Evidence → Finding →
Path：3旧回归实际失败（1取消仍启动接口+2实际Node回滚ENOENT）→
F-066准备窗口缺signal复核/F-067文件路径被URL解释 → 3处signal检查及字面路径拼接 →
4项不同定向通过，再用实际分发入口核对准备取消和真实Node回滚。

## 定向验证与边界

4项：新增最终准备取消、两个特殊文件名真实Node回滚、已有正常JVM参数/不可变样本/全文产物链。旧日志native-preparation-before-junit.xml/-log（3失败/5跳过），最终native-preparation-junit.xml/-log（4通过/4跳过）。只运行受影响用例，没有重跑剩余旧测试。相关strict
type/lint与core构建通过；公共出口补齐后另一次构建用于source真实导出，不重复业务用例。

verify-ultra-native-preparation.mjs调用source或分发包导出的实际BinaryDecompileTool/VerifiedPatchTransactionTool，真实Config和独立Storage。用人工Ghidra目录及现有Node可执行文件满足安装路径发现，Node不作为Java执行；观察真实fs.promises.mkdir完成并在最终project目录准备点取消，通过syncBuiltinESMExports观察execFile调用，finally恢复原函数。实际工具返回取消，启动计数0，scratch移除、仅analysis.log，无完整反编译报告；原人工样本SHA保持，取消阶段无事实DB。此处只注入取消时序和观测调用，不替代产品返回值或伪造反编译结果。

随后两个#/%20人工文本目标由产品事务工具应用，执行真实生成的Node回滚脚本，原文恢复且备份保持；再将%20目标的脚本/备份复制到含#/%20/中文的新目录，人工迁移目标同样恢复，原目录仍正确，事实DB恰2条事务。0模型、0真实Java/Ghidra执行；真实原生反编译证据沿用51等旧基线，不把本轮人工安装目录算真实逆向验收。没有增加运行中树清理/任意并发替换路径证明，66工作区write基线保留。

工程：native-preparation-types.log、native-preparation-lint.log、native-preparation-build.log、native-preparation-export-build.log、native-preparation-source.json/-log、native-preparation-script-lint.log及上述JUnit。没有全量/冒烟、付费请求、外部目标或本机逆向工具改动。

候选67待native-preparation范围三平台包及全局安装。66补丁路径/65工作区read/64原生PTY/63最低Node等未受影响基线保留。goal
active；更多模型长任务、语义质量、完整终端UI和复杂跨机逆向继续，不合并master或创建正式Release。
