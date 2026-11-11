# Gemini Ultra CLI 供应商配置命令记录交接

日期：2026-11-11。WI-101/E-244/F-068，preview.68本地包已安装。继续R26/code-audit自有源码case、lead/cae/doc、scope
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

68本地包与实际CLI交互已通过。个人配置/DB/本机工具未改，0付费模型；不合并master或创建正式Release。原始目标中的启动/语言/模型配置/演练台/协作/跨机逆向保持，未把本轮记录修复当完整上线证明。

## 本地实际交付

E-245：preview.68本地stage实际Windows ConPTY交互通过，原/provider list→provider
add使用假凭据，提交后viewport只有/provider add
\*\*\*且不含假密钥；配置正确保存原假密钥，上箭头恢复前一普通/provider
list并跳过配置命令，自然/quit退出0。随后大小写不匹配的/Provider
add非交互退出42、本地提示，整链0网络/模型请求、timedOut=false。开发trace的隐藏由独立hook定向证明，不冒充本次原生DevTools验收。首观察器在上箭头后光标位于开头时Ctrl+U不能清除全文，拼出/quit/provider
list，导致1次被loopback主动拒绝HTTP400及退出等待超时；未调用付费服务。改先Ctrl+E再Ctrl+U，等待取消退出/清理重试后同一产品包通过。失败JSON/log/原始PTY保留，原始PTY含输入中的假密钥如实披露。

E-246：产品源7e54cf787e3ab6ee7e334f46d2bddfa84f6a0f03，本地package:ultra构建1.0.0-preview.68，源chunk/版本/包SHA/入口SHA与六rg身份权限核对通过；README与随包安装文档一致且所有版本示例68。首次核对器错误假定交互实现与公共helper都在chunk-_，改实际检查interactiveCli-_.js与公共chunk分别存在后通过，未放宽或改产品。offline已有缓存安装7515ms/退出0，双命令68，425文件匹配本地归档；另425
stage文件逐一匹配安装，原生交互所测内容与全局包相同，不重复交互。包SHA256
b48672828a5afbe7d7bd8100ea8dbf9a30dd66c3448f8e61a89fe983e328c85d，入口SHA256
feaf631b4a1a4759b85d7cadec1b9f0e84e15b2cf8e650e5fc66f9d4340ee20e。个人locale/provider
SHA保持67末值，ultra-tools.json仍未创建，无全量/冒烟/付费/未受影响逆向协作重跑。67/run43094935659仍in_progress/无终态结论，watch
session73541实际存活；本轮未再派CI，不宣称68三平台验收。WI-101/F-068本地修复及安装交付，goal
active，不合并master/正式Release。

最终证据：local-preview68-package.log、local-preview68-package-verification.json/-log及-first.log、global-local-preview68-install-result.json、global-install-local-preview68-full-result.json、provider-credential-native-local68.json/-final.log/-raw-pty.txt、provider-credential-native-local68-fixture-failure.json/-log、provider-credential-tested-installed-match.json、provider-credential-personal-config.json、github-preview67-after68-run.json。个人locale
SHA 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8；providers
SHA
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332。源码、工程报告和Obsidian全文同步。

工件核对补充：stage包含430文件，npm按既有选择规则排除5个示例目录.gitignore，实际归档425；首收尾核对器错误要求stage总数425而拒绝，改以真实tar成员逐一对比stage/安装文件，另核对5个排除项均为.gitignore后通过。不是删除断言或忽略业务文件差异。接续仍轮询run43094935659/session73541，未发布Release；安装包身份源7e54cf7，后续文档和观察器清空/清理修正另行提交，不重复产品打包。
