# Gemini Ultra CLI 供应商响应头等待期限交接

2026-11-15；WI-243 / E-541至542 / F-201；基线c26dd065f7489c578f89ef373f1e3465d41a52f2，分支codex/ultra-agent-portable。上一goal turn为progress（data-only心跳空闲期限已推送）。goal active；源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包；preview.83保持，无打包/重装/升版/三平台CI/旧付费重跑。

## Evidence → Finding → Path

F-201：四外接stream入口直接await fetch，直到拿到HTTP响应头才进入readSse。服务器接收请求但不发头时，正文空闲期限完全没启动；原生fetch有其传输限制，但不是当前应用配置的等待边界。非合作fetch若忽略signal，调用方取消也仍在等，迟到响应正文无人主动清理。

新增共享fetchStreamHeaders，接入OpenAI Chat/Responses、Anthropic、Gemini流入口。以同一streamIdleMs解析现有GEMINI_ULTRA_STREAM_IDLE_MS（最小1000ms、默认120000ms）作为响应头等待期限，合并caller及自有controller，沿既有withAbortSignal停止公开等待。到期给出双语固定诊断；catch中止自有transport，finally清header timer。

成功返回头后timer即清，后续body使用原独立进展期限，不是总流时限。失败/取消保留原reason，不新增重试/供应商切换或修改已有调用方策略。若不合作fetch迟到返回Response，检查原signal后fire-and-forget取消body且不发布；取消本身不阻塞等待收尾。不能保证停止一个完全忽略signal且永不返回的第三方fetch内部操作，但调用方不再无界等待。

## E-541 必要源码检查

新增providerHeaderTimeout5项：四协议各模拟忽略signal的5秒迟到头/未关闭正文，要求1.1秒内已退出、准确header诊断、请求signal已中止、迟到body取消且未锁定、仅一次fetch；另一个等待响应头期间caller取消要求立即返回同一个AbortError并清迟到body。原源码5项真实行为失败，退出1。

修后新5+既有HTTP状态/重试分类6+四协议完成不等待cancel4+真实正文持续进展1共16不同相关通过，另21未选；退出0，非全量或冒烟。core tsc --build和双TS eslint --max-warnings=0首次退出0。后Prettier只整理新测试与四调用传参，双文件check及git diff --check退出0，纯格式不重复行为检查/编译。无CLI重编。

## E-542 Windows原生fetch与连接

verify-source-provider-header-timeout.mjs独立home/profile，实际编译四stream适配器、原生Node fetch/HTTP。服务端先读请求但不flushHeaders，5秒fallback保底；应用配置1000ms后Chat1021/Responses1007/Anthropic1010/Gemini1011ms准确header期限失败，socket主动close、未走fallback、零输出chunk。

单独Chat在等待头时200ms caller取消，返回原AbortError对象且socketclose。正常控制300ms发头、500/1100/1700ms正文、2300ms完成；超过最初1秒头期限仍成功，正文Headers body ready及totalTokenCount=5保持，证明头timer已清并交接body进展期限。仅改临时provider协议，执行后原配置字节保持。

13条件全true/13696ms总/首次脚本退出0。6个loopback请求，0外部fetch/实际模型/付费/自动重试/旧失败重跑。不是CLI启动基准或真实协作质量验收。finally恢复fetch、关闭自有server及计时器、reset临时ProviderManager，经realpath父目录与前缀核验仅清自建temp根。

## 证据、保全与接续

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：provider-header-timeout-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-core-compile.log、-lint.log、-format-write.log/-format.log；verify-source-provider-header-timeout.mjs与source-provider-header-timeout.log/-result.json；verify-provider-header-timeout-preservation.mjs与source-provider-header-timeout-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装或旧未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。三份同SHA交接、目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

边界：本次仅外接流协议等待响应头；收到非OK响应后的res.text以及Chat/Gemini非流JSON请求/正文尚未纳入此应用期限，下一步优先检查这两类实际等待，不声称所有网络卡住已消除。已成功长流、调用方原取消和HTTP状态语义保留；整体真实复杂协作、跨电脑逆向运行及最终多平台分发仍待，goal active。
