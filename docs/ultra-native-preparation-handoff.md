# Gemini Ultra CLI 分析准备期取消与字面路径回滚交接

日期：2026-11-11。WI-100/E-241/F-066/F-067，preview.67本地包已安装。R26/code-audit自有源码case、lead/cae/doc、scope
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

67本地包与全局安装已完成，远端上传失败，三平台工件尚未独立核对。66补丁路径/65工作区read/64原生PTY/63最低Node等未受影响基线保留。goal
active；更多模型长任务、语义质量、完整终端UI和复杂跨机逆向继续，不合并master或创建正式Release。

## 本地分发与远端上传状态

E-242：产品源27cf894fc69bcf218480d61b76c3da4c7783fb04/run43094935659三平台隔离安装与native-preparation功能检查均success，minimum-node/旧无关链skipped；三平台upload-artifact步骤均failure。最终快照run状态in_progress/尚无终态结论，不标整体CI成功。未取得三平台归档和JSON报告，未独立核对其包SHA/完整结果；旧47至66已下载工件基线保留。上传原因待终态日志确认，没有因上传等待而重启功能检查或取消仍被GitHub报告为运行中的作业。

E-243：为完成可用安装，按同一已推送源本地package:ultra构建preview.67，包源chunk/版本/SHA与六rg身份/权限独立核对；这是本地包，不冒充Windows
CI归档。offline已有缓存安装7337ms/退出0，双命令preview.67，425文件匹配本地包。安装后实际导出工具/Config再验证最终准备点取消0启动、scratch清理、仅日志、样本SHA保持；#/%20两目标及迁移工件真实Node回滚均成功，2事实/0模型。包SHA256
da3dc603258c786a2ba31ca6c536f8ffbefad6e1cc2de4bbc5cfedd28db4f17d，入口SHA256
603df279acc3164118de6fb189bae643141c34abe111e5a598670c8f7bab42c2；包在artifacts/ultra-release/gemini-ultra-cli-1.0.0-preview.67.tgz。个人locale/provider
SHA保持66末值，工具配置仍未创建，无全量/冒烟/真实模型或旧无关业务重跑。WI-100/F-066/F-067本地修复与安装交付，旧回滚脚本不自动改写；远端工件交付尚未完成，goal
active，不合并master/正式Release。

证据：github-preview67-run.json、github-preview67-run-pending-upload.json、github-preview67-upload-failure-snapshot.json、github-preview67-watch.log、local-preview67-package.log、local-preview67-package-verification.json/-log、global-install-local-preview67-full-result.json、global-local-preview67-install-result.json、native-preparation-installed-local67.json/-log、native-preparation-personal-config.json。失败日志尝试github-preview67-ubuntu-job.log在当时明确job仍运行，不能将该提示当上传根因。个人locale
SHA 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8；providers
SHA
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332。源码、工程正式报告及Obsidian全文同步。

接续：run43094935659仍需跟进终态和上传日志；CLI watch执行session
73541在收尾时仍实际存活，输出github-preview67-watch.log。先轮询同一session/run，不因观察超时重启CI。三平台upload步骤已失败，Complete
job步骤已完成，但GitHub
overall/job仍in_progress，不能据此标成终态。独立CI工件核对脚本仍要求实际归档与成功run，未为本地fallback放宽。
