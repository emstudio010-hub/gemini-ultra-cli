# Gemini Ultra CLI 认证关闭生命周期交接

2026-11-15；WI-245 / E-545至546 / F-203；基线fc59912c6a400d5bb5e4152fad4db5e98dc94687，分支codex/ultra-agent-portable。上一goal turn为progress（错误body/非流JSON等待修复已推送）。goal active；源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包；preview.83保持，无打包/重装/升版/三平台CI/旧付费重跑。

## Evidence → Finding → Path

F-203：Config.initialize等已接lifecycleController，但refreshAuth仅绑定可选caller及本次authRefreshController。dispose不终止正在进行的认证，迟到factory/元数据仍可发布且authReady重新true；已成功认证的Config关闭后authReady原来也仍true，startup metadata可继续被其他Config复用。不是本轮实际模型生成请求的问题，主动缩小结论到认证生命周期。

refreshAuth入口先合并Config生命周期和caller信号，在任何auth mutation/factory前检查；沿既有onAbort中止本次controller，复用withAbortSignal、assertCurrent/isCurrent、owned quota/admin请求取消，阻断迟到状态。dispose置authReady=false并清此Config的startup metadata/handoff。reuseStartupAuthMetadataFrom拒绝给已关闭target挂交接；已关闭source因not ready及metadata删除不再可复用。未清已有generator/config或历史以冒称回滚；旧generator对象仍可读取但不代表authReady。

不新增取消共享实验cache的全局行为，不安装/注销凭据，不修改个人选择或自动重试。底层不合作factory可能仍内部完成，但结果不发布；本地wrapper停止等待，不承诺撤销SDK内部副作用。

## E-545 必要源码检查

config.test新增4项：Config/gen两个factory在认证期间hold，dispose后200ms观察窗先收到Configuration disposed AbortError，释放迟到结果也不替换原generator/config或恢复ready；已关闭Config新auth在factory前拒绝；已关闭startup source不被新target复用元数据。原源码4项实际行为失败，退出1。

修后新4+已有supersession2/pre-cancel1/caller取消factory1/有效startup交接1=9不同相关通过/286未选，退出0。factory单测用mock，Config关闭/认证归属是真实逻辑；不当成物理网络证明。core tsc --build、双TS eslint --max-warnings=0首次退出0。后Prettier仅格式新测试，双文件check及git diff --check退出0，纯格式不重跑行为检查。无CLI重编、全量/冒烟。

## E-546 Windows原生元数据链

verify-source-auth-shutdown.mjs独立home/profile，实际Config.initialize/refreshAuth/dispose/gateway factory，CodeAssistServer/requestPost及真实Node HTTP。仅getContentGenerator的metadata backend lookup与AuthClient传输adapter指向loopback，不替换Config内部generator生产/归属。

quota场景hold配额与共享实验请求，admin场景hold管理设置。在释放held结果之前关闭Config，认证调用收到原Configuration disposed AbortError（1500ms观察上限内），owned quota/admin请求带同reason中止且socketclose/非正常完成，authReady=false。共享实验请求仍可完成cache，但迟到结果不入已关闭Config；admin迟到send因socket关闭不再输出。再次对旧Config refreshAuth立即拒绝、无新dispatch或generator变化。

独立ready Config正常认证后关闭，ready变false。再建同sessionId/同workspace且同backend的新target，尝试从已关闭source交接；target正常认证且重新请求quota（共享experiment仍可缓存），证明没有复用已关闭source startup快照。个人provider临时副本字节保持。

16条件全true/12599ms总/首次脚本退出0。8次本地元数据请求：quota2/admin3/ready源2/新target配额1；0模型生成/Google真实OAuth/外部/付费/重试/旧失败重跑。finally释放自有send、stop共享测试轮询、dispose四自有Config、恢复fetch/DrillStore并关闭自有server，经realpath父目录/前缀核验仅清自建temp根。

## 证据、保全与接续

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：auth-shutdown-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-core-compile.log、-lint.log、-format-write.log/-format.log；verify-source-auth-shutdown.mjs与source-auth-shutdown.log/-result.json；verify-auth-shutdown-preservation.mjs与source-auth-shutdown-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装或旧未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。三份交接同SHA、目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

边界：本阶段只覆盖Config认证与startup metadata生命周期，不证明活动GeminiClient.sendMessageStream/LocalAgentExecutor正在生成时也自动取消；这些入口当前仅部分初始化接生命周期，下一轮按实际活动请求继续检查。共享admin长期轮询的完整归属以及SDK内部副作用未纳入本次保证，不能据此宣称整体退出彻底完成。真实复杂协作质量、跨电脑逆向运行及最终多平台分发仍待，goal active。
