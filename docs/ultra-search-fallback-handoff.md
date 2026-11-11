# Gemini Ultra CLI 搜索兜底取消与失败处理交接

日期：2026-11-11。WI-095/E-227/F-062，候选preview.63。沿用R26/code-audit自有源码case、lead/cae/doc、scope授权granted。没有真实搜索、付费模型、外部安全目标或个人配置/数据库/逆向工具改动。

## 发现与实现

本轮检查跨机运行要求和红队入口后，发现更直接影响任务卡住/结论可信度的搜索缺陷：原外部模型失败或DSML垃圾触发直连DuckDuckGo时，没有总超时或响应体大小限制；helper把HTTP失败/异常转换为普通文本，随后显示成功Live
search
results。上游已因用户取消而失败也会继续发起直连。旧两项定向均实际失败，503没有ToolError、取消后仍返回成功搜索结果，原JUnit及输出保留。

直连增加10秒总期限，覆盖请求头和完整响应体；最多2MiB，检查声明大小并对流累计计数。超时、取消、HTTP错误、超限都停止读取/取消reader，移除监听器并清定时器。失败抛回工具层，由WEB_SEARCH_FAILED返回结构化错误，不伪装来源为零的成功结果；HTTP失败正文不读取或注入。只有明确的无结果标志页可以返回无结果；空白、挑战或无法识别的页面报告无法读取，不能被当作查询证明不存在。

调用前、上游失败时和上游结束后复核取消；已取消不发起新兜底，读取体中取消即时释放并显示cancelled。正常直接结果仍保留标题、摘要、来源与untrusted包装；原生grounding引用/UTF8字节插入路径保持。上游主模型请求本身沿用已有调用期限，本轮10秒只限定直连搜索，不声称所有模型调用总时长均10秒。请求计数仍在原调用边界，不隐藏新增搜索。

Evidence → Finding → Path：旧503无工具错误、取消后仍直连 →
F-062伪成功/额外调用和无界读取 → 明确失败传播、取消早退及全程期限/字节限额 → 定向失败/取消/超时/超限/解析检查，以及实际CLI收到error字段HTTP503并正常结束主会话。

## 本地证据与限制

9项不同定向检查通过：新7项覆盖503/取消主调用/正常直连来源/响应体10秒期限/超限/读取中自定义原因取消/明确空结果与挑战页区分；原有正常主结果和多字节引用2项通过。首响应体取消fixture用默认stream高水位导致构造时pull提前触发，实际尚未进入读取；改高水位0后只复核该项通过，不改产品来满足夹具。初类型的通用spy签名改为GeminiClient方法类型，旧arrow-body
lint规范修正，相关最终strict type/lint通过。

实际源CLI两独立进程均自然退出0，6次本地模型协议请求、2次真实loopback搜索HTTP，无超时/断言失败。主模型要求google_web_search，工具的utility请求返回DSML后触发直连；failure端点503最终经原生scheduler转为tool
response的error字段，主模型收到HTTP503后返回SEARCH_FAILURE_OBSERVED；success完整标题/摘要/URL回传后返回SEARCH_SUCCESS_OBSERVED。通过子进程专用preload只把固定DuckDuckGo请求映射到本地服务器，保留查询、signal与headers，其他外部fetch拒绝，本地data
URI
WASM资源允许。不是公网DuckDuckGo可达性或真实供应商验收。超时/大小/取消另由定向检查证明，本原生链不人为等待10秒。

初源夹具先遇package.json BOM、随后把Yoga的本地data
URI误当外网拒绝、使用了交接中的web_search简称而不是实际声明google_web_search、最后错误要求模型工具响应含Error冒号而不是结构化error。均修正夹具后通过，保留旧输出；没有因这些夹具问题改产品或调用真实模型重试。最终源码版本来自上游nightly
package.json，不是候选包版本。

工程证据：web-search-fallback-before*、web-search-fallback-junit.xml/-log、web-search-fallback-boundaries*、web-search-fallback-cancel-final*、web-search-fallback-types/lint及final-*、web-search-fallback-source.json/-output.txt及BOM/transport/tool-name/assertion失败原件、web-search-fallback-source-final-chain.log。无全量、冒烟、未变更协作链或付费检查。

候选63待search-fallback范围三平台包和全局安装。goal
active；原红队与逆向/协作基线保持，最低Node22.19运行、更多模型长任务/语义质量与复杂跨机逆向仍需相应证据。不合并master或创建正式Release。
