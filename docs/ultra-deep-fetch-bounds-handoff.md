# Gemini Ultra CLI 深度抓取有界加载交接

日期：2026-11-13。WI-146 / E-345至346 / F-104。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装仍preview.83；本轮没有打包、重装、版本变化或跨平台CI。

## 修复

F-104：deep_web_fetch公开工具忽略ExecuteOptions.abortSignal；根页面虽有12秒controller，但子页面fetch未传signal，正文均先res.text完整读取再slice，子页失败直接吞掉。已有普通搜索/模型目录取消保护不覆盖此工具。

现在根/子页面共用一次总时限（默认12000ms）与调用方取消信号。正文采用流式读取，声明或实际解码正文超过2 MiB即拒绝并取消流；读取中取消保留调用方原reason，整次请求结束中止controller清理连接。深度只接受1/2，子页0至10（默认3），链接扫描最多返回50项；支持相对路径，爬取匹配完整origin（协议/主机/端口），不再仅比较hostname。子页面HTTP/读取失败明确记录；总超时发生在根页面读取后时，保留根正文/已完成子页并标partial。工具返回部分证据同时给execution_failed，不伪装完整抓取；/fetch也显示未完成子页或部分超时根内容。去掉原斜杠预览无依据的“已放入上下文”提示。

URL及数量有运行时验证，无效请求本地返回诊断；没有改模型、权限、个人配置或添加额外审批。公开模型工具支持调用方取消；/fetch沿用命令框架，仍受总超时，但本轮没有新增斜杠命令取消键。原生fetch的重定向行为保持，完整origin筛选针对提取的直接子链接，不扩张成重定向目标限制承诺。

## Evidence → Finding → Path

E-345：初始6项旧断言失败，其中预取消、子页无signal超时、声明/实际过大正文4项是实际缺陷复现；子页取消和origin/相对链接2项夹具漏text/html，落入既有纯文本路径，不能当这两项旧行为证据。修后首次4通过/这2夹具失败，补正确Content-Type后最终6通过。首lint发现原normalizeGitHubUrl空catch，补行为说明后相关3文件eslint退出0；曾有一次prettier从packages/core工作目录传入根相对路径失败，随后根目录格式命令退出0，日志保留。严格core与CLI源码编译均退出0，无全量/冒烟。

命令（packages/core）：`npx vitest run src/tools/deepWebTools.test.ts --coverage.enabled=false`。根目录依次`npx tsc -p packages/core/tsconfig.json`、`npx tsc -p packages/cli/tsconfig.json`；只lint deepWebTools.ts、其测试及fetchCommand.ts。6项覆盖公开工具预取消、子页总时限/根证据保留、两种2MiB超限、子页取消不再启动后续链接、相对链接/精确origin与失败可见。

E-346：确认编译退出0后，Windows Node v24.19.0加载实际编译DeepWebFetchTool和/fetch处理器，loopback真实HTTP响应头/停滞正文/声明与chunked超大正文/正常中文子页/503。预取消无请求；正文取消返回相同reason且服务端连接关闭；配置120ms总时限实际126ms触发并关闭停滞子连接，保留Root evidence，不访问后续/never；两种超限均关闭连接。公开工具包含成功子页与503失败，/fetch也显示失败与保留内容，其他协议/端口链接未请求，无效file URL本地诊断。9条件通过、4893ms/退出0，11次本地请求、0模型或外部HTTP。

初次HTTP核对已通过但观察器未隔离home变量；该脚本未创建Config/认证或使用持久化配置，个人哈希核对保持。为落实隔离约束，补mkdtemp profile后完成上述最终核对，首结果/日志保留，不用其替代最终证据。没有重跑旧付费任务。观察时限为120ms，不是12秒耐久基准；默认12秒由源码与schema核对。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。deep-fetch-before.log/-junit.xml、deep-fetch-test.log/-junit.xml、deep-fetch-final-test.log/-junit.xml、deep-fetch-core-source-compile.log、deep-fetch-cli-source-compile.log、deep-fetch-lint.log、deep-fetch-final-lint.log及format日志；verify-source-deep-fetch.mjs、source-deep-fetch-first-result.json/-first.log、source-deep-fetch-final.log、source-deep-fetch-result.json。验证器不随包分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，本会话承担lead/cae/doc。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在；不改个人数据库、工具安装或PATH。没有外部安全目标、原生逆向执行或真实模型任务。

本轮是Windows源码工具与slash处理器的实际HTTP链，不是完整终端/浏览器视觉、任意网站兼容、模型阅读质量或最终分发包验收。长会话语义、复杂逆向与最终Windows/macOS/Linux交付仍未完成。隔离codex分支同步带skip ci，不合并master或正式Release；继续源码收敛及必要Windows验证，goal保持active。
