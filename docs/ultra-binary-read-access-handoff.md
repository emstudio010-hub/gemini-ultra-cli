# Gemini Ultra CLI 二进制工具工作区读取交接

日期：2026-11-11。WI-098/E-235/F-064，候选preview.65。沿用R26/code-audit自有源码case、lead/cae/doc、scope授权granted；radare2按本地tool-index已核对的安装路径使用。本轮无模型、外部目标、个人配置/数据库/本机逆向工具改动。

## 问题与修复

binary_decompile已有Config.validatePathAccess(read)，但binary_inspect、binary_analyze和binary_triage未调用；工具调度器的调用允许并不替代工具内部的工作区文件读取规则。初筛还用进程cwd解析filePath，与Config.targetDir不同时相对样本找错。旧4项定向均失败：三个工具未对canonical路径执行指定拒绝检查，且相对初筛读取错误目录；原日志保留。

inspect/analyze的内部helper增加可选validateRead回调，在realpath得到真实样本路径后、stat/工具发现/原生进程创建之前检查；产品工具入口始终传Config.validatePathAccess(file,'read')，与已有decompile对齐。直接helper的现有调用签名保持兼容，调用者要使用自己的范围检查应传回调。triage工具入口先复核取消、按Config.targetDir解析相对路径并realpath，再执行现有读取校验和取消检查，允许后才读取/归档。没有新增授权/审批模式，也不改现有配置的允许范围。链接解析到工作区外时按真实目标拒绝；允许的项目/只读范围仍由Config决定。不声称消除任意外部并发文件替换的全部TOCTOU边界。

Evidence → Finding → Path：三入口缺现有路径检查及相对cwd错误 →
F-064模型工具绕过工作区读取约束/错误样本路径 →
canonical路径传现有read校验及项目相对解析 →
4项定向通过，再以真实Config和实际工具入口验证6拒绝+允许样本静态分析。

## 本地验证与限制

4项定向通过：三个工具经工作区内链接读取样本时，在工具发现/原生执行前按真实路径拒绝且不泄漏内容；相对初筛从配置项目读取并尊重已取消请求。测试数据库用独立文件且结束关闭。首夹具完整mock
child_process导致Config依赖的editor
promisify(exec)加载失败，改部分mock后才得到4项真实旧失败；保留两层记录，不将夹具加载失败算产品缺陷。

实际源工具入口使用真实Config及已初始化的独立Storage：三个工具分别拒绝外部文件和工作区内指向它的符号链接，共6次拒绝，消息Path
not in
workspace，不包含人工PRIVATE_BINARY_SCOPE_MARKER，拒绝阶段未创建事实DB。随后工作区内带空格/与号文件按相对路径初筛成功，samplePath与SHA对应，SQLite恰好归档1条允许样本；真实本机radare2/rabin2对允许PE读取imports和functions，实际ExitProcess导入及非空函数表通过，样本未执行、允许与拒绝文件SHA均保持。原样本来自项目自有minimalPeFixture，不能当任意格式或复杂逆向验收。

verify-ultra-binary-read-access.mjs可调用source或分发包导出的真实工具实现，常规CI不另安装r2，用真实Config检查拒绝和允许初筛归档；可选ULTRA_VERIFY_NATIVE_DIRECTORY用于本机已核对的工具正向验证。首source夹具未初始化Storage，Config正常拒绝使用，补独立Storage.initialize后实际链通过，没有改产品以绕过校验或初始化条件。相关strict
type/lint通过；reverseTools原有空catch补说明，保留可选事实存储不可用时direct
helper仍返回初筛的既有行为，未把它算新归档可靠性修复。

工程：binary-read-access-before*、binary-read-access-fixture-failure-junit.xml、binary-read-access-before-final*、binary-read-access-junit.xml/-log、binary-read-access-types/final-types/lint/final-lint/script-final-lint.log、binary-read-access-source.json/-log/-final.log及storage-fixture-failure.json。没有全量/冒烟或未变更协作/付费请求重跑。

候选65待binary-read-access范围三平台包与全局安装，64原生PTY及63最低Node等基线保留。goal
active；更多模型长任务、语义质量、完整终端UI及复杂跨机逆向继续。不合并master或创建正式Release。
