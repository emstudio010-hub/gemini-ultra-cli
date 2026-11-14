# Gemini Ultra CLI 供应商正文等待与状态保全交接

2026-11-15；WI-244 / E-543至544 / F-202；基线996fc35fdf001ec13148bae89f603a25d84c3f42，分支codex/ultra-agent-portable。上一goal turn为progress（四流协议响应头期限已推送）。goal active；源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包；preview.83保持，无打包/重装/升版/三平台CI/旧付费重跑。

## Evidence → Finding → Path

F-202：六个外接生成入口收到非OK头后直接res.text，错误body一直传零星字节也可无限等；Chat/Gemini非流入口直接fetch/res.json，未接入新header等待层或应用body空闲期限。普通Response.text/json本身不识别调用方取消一个不合作的body wrapper。

新增readProviderBody，用原合并signal、withAbortSignal及ReadableStream reader等待，解码器跨分段保持UTF8/BOM行为。错误body使用完整读取期限，不被零星字节续期；成功JSON使用每次reader.read的空闲期限，有进展的长响应可继续。沿现有GEMINI_ULTRA_STREAM_IDLE_MS最小1000/默认120000ms，不新增个人配置。finally中止自有transport、异步cancel reader并release锁，不返回不完整正文。

新增providerHttpError，完整错误body仍保持原消息；body失败/超时时用固定双语说明省略未完成正文，但保留原HTTP status及既有重试分类。若实际caller signal已取消，先抛其原reason，不变成可重试HTTP错误。六入口共用该错误读取。Chat/Gemini非流也复用现有header helper及body reader，然后通过既有parseProviderJson验证，坏JSON诊断不带原文。正常SSE正文仍用原readSse，不改其进展逻辑，不新增重试/切模型或预算重置。

## E-543 必要源码检查

新增providerBodyTimeout14项：六入口轮换429/503/400错误body持续传字节仍须1秒结束/原分类/零调用/无私有前缀；Chat/Gemini成功JSON停顿各一项、非流header等待各一项；HTTP200/503正文caller取消各一项；两非流协议1.9秒正常分块JSON（跨emoji字节与UTF8 BOM）各一项。原源码12行为失败/2正常控制通过，退出1。

修后新14+既有六入口HTTP状态/重试分类6共20不同相关通过/26未选，退出0。eslint --fix仅机械整理声明，最终双TS零warning lint退出0。稍后将已有signal检查纳入已取得reader的finally清理范围；最终core tsc --build、双文件格式check/diff退出0，最终只补受影响caller取消2项通过/12未选，不累加成22；其余由最终Windows编译链覆盖，未重复未受影响检查。无CLI重编、全量/冒烟。编译确认原session结束后才运行Windows，不重复构建。

## E-544 Windows原生HTTP正文

verify-source-provider-body-timeout.mjs独立home/profile，真实编译六入口/Node fetch与HTTP。六错误响应80ms空格续传，配置1000ms完整期限后仍在1009至1092ms结束，原429/503/400及重试分类保持、socket主动close、未走5秒fallback、无不完整私有marker或可执行调用。

Chat/Gemini非流分别验证：200正文停顿触发idle且socketclose；收件不发header触发原头期限；持续分段1.8秒的BOM/拆分UTF8 JSON准确返回Valid票据与emoji。200及503读取期间200ms caller取消均返回同一个AbortError并断开，未变成HTTP重试错误。

27条件全true/27718ms总/首次脚本退出0，14个loopback HTTP请求，0外部fetch/实际模型/付费/自动重试/旧失败重跑。各协议切换仅在临时provider文件，个人文件保全另外核查；不是CLI启动基准或真实协作质量验收。finally恢复fetch、关闭自有server/计时器、reset临时ProviderManager，经realpath父目录/前缀核验仅清自建temp根。

## 证据、保全与接续

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：provider-body-timeout-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-final-cancel-tests.log/-final-cancel-junit.xml、-core-compile.log、-lint-fix.log/-lint.log、-format-write.log/-format.log；verify-source-provider-body-timeout.mjs与source-provider-body-timeout.log/-result.json；verify-provider-body-timeout-preservation.mjs与source-provider-body-timeout-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装或旧未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。三份交接同SHA、目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

边界：成功JSON有持续byte进展时不受总时限限制，也不新增最大body字节数；JSON同步解析不能被异步signal抢占；现有最小/默认设置是分阶段期限而非总请求SLA。原生Google SDK、图像/搜索等其他网络客户端不自动包含在本次保证。接续回到实际CLI错误显示/任务恢复与退出取消，结合目标池检查真正剩余缺陷；真实复杂协作质量、跨电脑逆向运行及最终多平台分发仍未全面完成，goal active。
