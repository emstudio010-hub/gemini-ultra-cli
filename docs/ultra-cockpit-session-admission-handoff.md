# Gemini Ultra CLI 演练台提交会话复核交接

2026-11-15；WI-236 / E-527至528 / F-194；基线f8e732744ce5870f8e223b3ae5e4fdc2971069af，分支codex/ultra-agent-portable。上一goal turn为progress（供应商版本冲突保护已推送）。goal active，源码优先→Windows必要验证→功能收敛后最后统一打包；preview.83保持，无打包/重装/升版/多平台CI/旧付费重跑。

## Evidence → Finding → Path

F-194：drillCockpit.handleRequest在await readJson(req)前保存current=session，正文等待期间AppContainer的effect可因streamingState/dialog/回调变化重新connect。正文结束后却仍使用旧current.isReady及current.submit，使新状态已忙、断开、甚至不同Config时仍接受旧请求；同Config仍ready也调用陈旧submit。

POST完整正文读完后读取latest=session，若为空或Config身份与请求开始不同则409双语关闭/切换诊断；busy/submitting门禁使用latest.isReady，任务交给latest.submit。所有POST设置亦通过该门禁，避免旧idle允许设置写入。没有更改已经接受的任务取消、模型/预算/自动重试、全局submitting语义或会话身份定义；这是请求接纳时复核，不代表完整任务执行链或所有异步生命周期已修。

## E-527 定向检查

新增drillCockpitSessionAdmission4原生HTTP延迟JSON场景：开始ready后同Config转busy拒绝；断开拒绝；切不同Config拒绝；同Config仍ready用最新submit并202。包装Server.emit只在原生request处理器进入后通知夹具，再发最后JSON字节，使状态变化确定发生于正文等待阶段。只对未被该API读取的Config使用最小对象，submit为记录spy。

首baseline夹具finish变量定义顺序错误产生ReferenceError/4错误，不能算产品复现，日志保留。只修夹具再跑baseline，4实际行为失败：前三原202、末项仍旧callback；退出1。生产修复后4全过，退出0，无夹具错误。

首CLI tsc检查发现测试包装原emit的overload spread类型不匹配，显式采用EventEmitter.emit签名保留原函数后最终CLI tsc --build退出0，纯类型无运行语义变化不重复行为测试。测试多const仅机械eslint --fix，双TS最终零warning lint、3文件Prettier与git diff --check退出0，无全量/冒烟。

## E-528 Windows编译服务

verify-source-cockpit-session-admission.mjs使用独立home/profile，两个实际Config.initialize对象、编译Cockpit和原生HTTP分段正文；Server.emit包装只记录handler进入，不替换dispatch。前三种状态变化均409且旧新submit从未调用；同Config更新callback只调用latest-submit；设置POST正文等待中变busy，effort=ultra修改被409拒绝、供应商文件原字节不变；不变的ready会话正常202，normal callback一次。10条件true，首次执行退出0，6517ms，总6loopback API，fetch守卫0次。

submit回调只记录收件，不启动LLM/真实任务，因此证明接纳与路由正确，不冒称复杂多Agent交付。没有模型/外部/付费/旧任务重跑。finally销毁自有request、断开会话、停控制台、dispose两Config、还原Server.emit/fetch及DrillStore，经realpath和前缀校验仅清自建temp根。无浏览器/终端/跨平台或最终包验收。

## 证据与保全

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：cockpit-session-admission-baseline.log/-baseline-junit.xml（夹具错误）；-baseline-corrected.log/-baseline-corrected-junit.xml（真实4失败）；-tests.log/-junit.xml；-cli-compile.log/-final-cli-compile.log；-lint-fix.log/-lint.log/-final-lint.log；-format-write.log/-format.log/-final-format.log；verify-source-cockpit-session-admission.mjs、source-cockpit-session-admission.log/-result.json；verify-cockpit-session-admission-preservation.mjs、source-cockpit-session-admission-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false及ULQ临时凭据已删均保全true；个人数据库/PATH/工具安装/旧未跟踪文件/旧被拒清理目录不动。granted R26 code-audit case、lead/cae/doc同会话，无Codex子代理。Obsidian/源码/工程三份同SHA，目标池/case同步，显式stage/skip ci推隔离分支，不合并master/Release。

接续：继续接纳后任务占用状态的归属和释放，核对同步提交异常、旧任务晚收尾对新会话是否有影响；真实复杂协作质量/最终分发仍待，goal保持active。
