# Gemini Ultra CLI 原生64位地址精度交接

日期：2026-11-11。WI-103/E-250/F-070，preview.70已安装。R26/code-audit继续，实际r2按radare2技能与tool-index已核对路径调用；自有源码与生成ELF，lead/cae/doc、scope
granted。0模型，不执行样本，不改个人配置/数据库/逆向工具。

## 缺陷与修复

工具参数已允许64位十进制/十六进制字符串，但原native
JSON用JSON.parse把数字转Number，超出2^53-1发生舍入。inspect输出baddr/vaddr及嵌套整数悄悄变值；analyze主addr/offset/from使用safe数字校验拒绝高地址，附加jump/refs等字段仍可能变值。人工ELF基址0xffff800000000000，真实rabin2/r2输出两函数地址18446603336221196416、18446603336221196432和指令/引用；普通Number无法保留这些相邻地址。原日志和JSON保存，样本没有执行。

新增parseNativeBinaryJson，用Node标准JSON.parse
reviver的context.source取原始整数token，不安全整数（含解析溢出非有限值）保留为字符串；安全整数、浮点与原始字符串保持，递归涵盖未知附加字段。没有手写JSON词法器或新增依赖。最低Node22.19.0实际支持此标准接口；缺上下文时拒绝不安全整数，不把舍入值当成功。三视图主地址复用已有0..uint64
schema，接受安全数字或合法十进制/十六进制字符串，超范围及表达式仍拒绝。安全地址保持数字以兼容已有调用；高地址字符串可以原样作为后续address参数，执行时仍由既有BigInt正规化成固定十六进制模板。inspect结构检查/输出数量、超时/体积及工作区读取规则保持。

工具描述与安装文档说明大整数返回字符串；这不是把所有数字改成字符串，也不声称浮点数任意十进制精度。原生工具自身已舍入/格式不合法的数据无法还原；主地址仍限64位无符号。改变JSON中的字段类型是有意的兼容修复：此前无法成功处理这些高地址或返回不准确数据，调用者应保留字符串避免再次Number转换。

Evidence → Finding → Path：真实r2高地址原JSON及5旧回归失败 →
F-070舍入/拒绝高地址 → 原始数值token保留与uint64主字段校验 →
7定向、最低Node下真实工具与受控输出链。

## 本地证据

5旧回归实际失败：函数/指令/xref高主地址三项，安全主地址但高jump/嵌套引用一项，inspect高metadata及原字符串一项。最终7项通过，另2项已有普通参数/数字/截断保护；其余旧测试不运行。strict
core type/lint通过，core构建完成。没有全量/冒烟或旧未变更协作链重跑。

verify-ultra-native-address-precision.mjs调用实际产品BinaryInspectTool/BinaryAnalyzeTool、Config与独立Storage；先受控4份原生JSON，观察execFile参数并返回native格式的原始文本（不替代产品解析/返回结果），核对高基址、两不同函数、call的jump和xref.from，以及十进制输出再用作工具参数后的精确十六进制命令。随后可选ULTRA_VERIFY_NATIVE_DIRECTORY使用真实rabin2/r2解析同一人工ELF的4视图。source在本地Node22.19.0两链均通过，返回高地址字符串/普通bits-size数字、样本SHA保持，0模型/不执行样本。

工程：native-address-precision-before-junit.xml/-log（5失败）、native-address-precision-junit.xml/-log（7通过）、native-address-precision-types.log、native-address-precision-lint.log、native-address-precision-build.log、native-address-precision-script-lint.log、native-address-precision-source.json/-log。原生先例high-address-native/\*.json与high-address-native-discovery.log；固定工具来自tool-index，不下载或修改本机工具。

候选70分发范围native-address-precision：三平台正常构建/安装基础链后，使用22.19.0执行新增实际包工具受控JSON精度链，不另装r2，不能称三平台新原生r2实测。本机真实native结果独立保留。69并发配置及更早基线保持；goal
active，复杂逆向/语义质量/完整UI与原始目标继续，不合并master或正式Release。

## 首轮CI路径别名观察器修正

原run43102874981为completed/failure：Linux精度链通过，Windows/macOS实际工具包装了观察器ERR_ASSERTION，非解析失败。原脚本用字面sample路径比较工具已realpath路径；本机将TEMP改小写可实际复现，诊断显示fsp.realpath返回C盘实际大小写，fs.realpathSync的JS路径仍小写，改用fs.realpathSync.native得到同一真实路径后该夹具通过。macOS的/var与/private/var同类别名由两平台补验确认。路径断言仍精确，不改变产品路径规则或精度代码。原失败run/log保留。

新增native-address-recheck验证范围只下载原run的Windows/macOS两包，校验源0b60654/版本70/原基础安装及上传成功/唯一失败步骤与包SHA；不重建产品、不跑已通过Linux。安装同一归档后仅用修正观察器在Node22.19.0补验，另存报告。产品源仍0b60654，当前全局仍69。

## 三平台分发与安装

E-251：产品源0b6065432fb6f585ac2233fa6f4a677a061cc947/run43102874981原始三包版本70、源chunk、包/入口SHA、六rg身份权限及安装4基础工具独立核对。原run保持completed/failure，Linux精度通过，Windows/macOS仅观察器路径别名失败；补验源4a45eb6/run43114818265
completed/success，整个package/minimum-node job
skipped，只下载原Windows/macOS包并校验源及SHA，不重建、不重跑Linux。三平台合并证据均Node22.19.0，实际包工具类/Config解析4份受控原生JSON，高基址/两个函数/调用jump/引用from精确字符串，普通bits-size数量仍数字；地址再作参数精确规范为十六进制命令，样本SHA保持，0模型/不执行样本。CI未装r2，真实本机r2/rabin2的4视图另由source最低Node证据证明。首轮失败及路径诊断保留，不将补验说成原run成功；69及更早未受影响基线保留。

E-252：offline已有缓存安装6763ms/退出0，双命令preview.70，425文件匹配Windows
CI包，旧包保留。包SHA256
435ce940248c84552977528e00d842c49280930789518b410d38ae525bfa7f7e，入口SHA256
676b7b759210e8869a2c4dd9f9724010dbc7f2a6846b339cd3b441a50a85e9d1。个人locale/provider
SHA保持69末值，ultra-tools.json仍未创建，无额外本机业务/启动基准/全量/冒烟/付费请求重跑。WI-103/F-070原生64位整数精度修复分发交付；只保证保留原生JSON提供的整数token，工具自身不准确输出或浮点任意精度不在此承诺。goal
active，原始启动/语言/配置/演练台/协作/跨机逆向目标继续，不合并master或创建正式Release。

最终证据：github-preview70-run.json、github-preview70-first-run.json、github-preview70-first-failed.log、github-preview70-recheck-run.json、github-preview70-artifacts-result.json、github-preview70-artifacts-verification.log、github-run-43102874981/、github-run-43114818265/、global-preview70-install-result.json、global-install-github-preview70-full-result.json、native-address-precision-personal-config.json。个人locale
SHA 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8；providers
SHA
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332。源码、工程报告和Obsidian全文同步。

独立归档核对首轮误要求变量名context.source，实际esbuild合法重命名为context2.source。读出真实包内parseNativeBinaryJson完整函数后，改为同时检查函数、Number.isSafeInteger及context数字后缀.source返回；原github-preview70-artifacts-verification-first.log保留，同一批归档重新核对通过，没有重跑CI或修改产品代码。最终补验摘要与原归档SHA逐项匹配，原始run结论failure仍保留。
