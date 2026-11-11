# Gemini Ultra CLI 供应商配置命令记录交接

日期：2026-11-11。WI-101/E-244/F-068，候选preview.68。继续R26/code-audit自有源码case、lead/cae/doc、scope
granted；仅假凭据/隔离profile，不读取或改变真实供应商密钥。goal active。

## 缺陷与修复

原/provider
add将名称、端点、密钥和模型全文写入提交后的USER界面记录、上箭头重放历史和UserPrompt开发追踪；未知配置命令（例如大小写不匹配）还可能走普通提示词回落。7项记录回归与2项交互/非交互回落回归在旧代码均真实失败。

新增独立命令识别，仅识别provider/供应商/接口/p的add/添加，兼容命令解析器的斜杠后空白及大小写保护，严格检查命令边界。提交记录和追踪只保存命令前缀+\*\*\*，不改实际执行参数。输入历史不加入这类命令，从旧logger加载也过滤；不是以隐藏占位符替换密钥后重放。配置命令无法匹配时，交互本地报错并handled、非交互FatalInputError，普通绝对路径与其他命令仍按原规则处理。已有provider配置成功/失败文案不显示密钥。

输入中的编辑框、原始PTY录制、系统进程命令行和外部终端历史不属于提交记录隐藏范围；推荐/provider配置窗口交互录入。旧日志文件不自动改写或删除，仅加载到输入历史时过滤。普通用户正文不做通用凭据扫描。

Evidence → Finding → Path：9项旧回归失败及源码数据流 →
F-068配置密钥进入记录/未知命令可能发往模型 → 执行与记录分开、输入历史过滤及本地拒绝回落 →
10项定向通过（9回归+普通追踪保护），再补1项解析空白/边界检查。

## 必要检查

四文件10项通过，其余154项未运行；前缀边界另1项。严格cli类型检查通过；首lint仅新增测试one-var声明错误，拆分后仅复核该文件；其他受影响文件lint已通过。11不同项，没有全量/冒烟。实际native验证脚本只使用假凭据和本地HTTP接收器，检查提交后的屏幕与上箭头重放、配置实际保存，以及无效大小写命令非交互退出42且零网络请求；编辑过程原始PTY含假密钥如实留档，不当作隐藏失败或真实密钥泄漏。

同时修正文档中仍为preview.49的校验示例。package-ultra将README和随包安装文档的版本示例从实际version生成，避免覆盖版本变量后安装指令与产物不一致；构建时核对包内说明即可，不新增镜像实现测试。

工程：provider-credential-history-before-junit.xml/-log（7失败）、provider-credential-fallback-before-junit.xml/-log（2失败）、provider-credential-history-junit.xml/-log（10通过）、provider-credential-prefix-junit.xml/-log、provider-credential-history-types.log、provider-credential-history-lint.log/final-lint.log、provider-credential-prefix-lint.log、provider-credential-native-script-lint.log、provider-credential-package-script-lint.log。

## 分发状态

67/run43094935659已再次按同一session73541及GitHub job/check-run
API核实：GitHub仍in_progress，三平台产品/安装成功、上传失败，未取得终态日志，不重启或取消该活运行。本轮先构建并核对本地68包，再做实际安装交互检查；不为已知上传异常重复远端构建/功能链。67与更早三平台证据保留，不冒称68三平台重新验收。

候选68本地包与实际CLI交互结果待追加。个人配置/DB/本机工具未改，0付费模型；不合并master或创建正式Release。原始目标中的启动/语言/模型配置/演练台/协作/跨机逆向保持，未把本轮记录修复当完整上线证明。
