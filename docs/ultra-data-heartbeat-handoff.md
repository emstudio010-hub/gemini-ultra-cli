# Gemini Ultra CLI 数据心跳空闲期限交接

2026-11-15；WI-242 / E-539至540 / F-200；基线8cd902f298295030090f5ca5691a20533764d1a6，分支codex/ultra-agent-portable。上一goal turn为progress（Anthropic工具块完整性已推送）。goal active；源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包；preview.83保持，无打包/重装/升版/三平台CI/旧付费重跑。

## Evidence → Finding → Path

先核对现有readSse：协议完成后已有固定尾部等待，不能重复当成缺失。F-200是另一条可达路径：仅按event:名字过滤ping/heartbeat/keepalive，data-only JSON心跳如data: {"timestamp":1,"type":"ping"}被yield并刷新progressDeadline；即使没有模型内容，持续心跳也可让等待无限延后。四流协议共用该reader。

新增isSseHeartbeat识别既有具名事件或完整JSON顶层type三种心跳名（忽略大小写），仅心跳不yield也不刷新进展期限。普通事件保持原顺序/进展更新；无效JSON分类返回false，让原协议解析器继续明确报错，不静默吞错或回显正文。文本内容内部含type:ping不会误判顶层事件。保持现有GEMINI_ULTRA_STREAM_IDLE_MS最小1000ms/默认120000ms和完成尾部期限，不改变总生成时限，不新增自动重试或切模型。

## E-539 必要源码检查

在providerStream新增ping/heartbeat/keepalive三个data-only回归，100ms心跳、5秒夹具上限，断言1秒无实际进展即失败并cancel。原源码三项真实行为失败（1.1秒仍等待），退出1。修后新3+现有实际进展长流1+尾部keepalive/用量1共5通过/27未选；额外仅补具名/comment心跳原2控制通过/30未选，合计7不同相关检查，不累加重复。

core首次及最终tsc --build退出0。首eslint禁止typeof直接检查对象属性，改成局部type再做相同检查；最终双TS lint零warning退出0。首次5项在这次语义等价局部变量整理前，最终具名2与Windows编译证据在整理后；没有重复未影响的5项。后Prettier只格式，双文件check及git diff --check退出0。无CLI重编、全量/冒烟。

## E-540 Windows真实HTTP计时与清理

verify-source-data-heartbeat.mjs独立home/profile、编译UniversalContentGenerator四协议与真实Node HTTP/SSE。每个端点80ms循环三类data-only心跳，5秒服务端fallback保底；客户端真实1秒空闲后抛既有idle诊断并主动关闭socket，服务端未走fallback、零工具调用。Chat1085ms、Responses1022ms、Anthropic1008ms、Gemini1006ms；在预设900至3000ms观察窗口内。

独立Chat控制每600ms发送真实正文，合计1.8秒超过单次idle窗口仍成功；正文含字面量{"type":"ping"}保持，尾部totalTokenCount=7。再用语法损坏的类似ping JSON控制，仍立即由协议解析器报invalid JSON response，私有marker未回显。

13条件全true/首次脚本退出0/总30510ms（含模块加载与并行静态检查，非CLI启动性能值）。6个loopback HTTP请求，0外部请求/实际模型/付费/重试/旧失败重跑，provider配置字节保持。是协议body等待与socket清理证据，不是实际供应商或复杂协作质量验收。finally恢复fetch、关闭自有server/计时器、reset临时ProviderManager，经realpath父目录及前缀核验仅清自建temp根。

## 证据、保全与接续

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：data-heartbeat-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-named-tests.log/-named-junit.xml、-core-compile.log/-core-final-compile.log、-lint.log/-final-lint.log、-format-write.log/-format.log；verify-source-data-heartbeat.mjs与source-data-heartbeat.log/-result.json；verify-data-heartbeat-preservation.mjs与source-data-heartbeat-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装或旧未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。三份同SHA交接、目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

边界：仅完整SSE帧的已知传输心跳不算进展；不判定任意非心跳空数据或语义无效事件是否算模型进展，也不抢占同步JSON解析。请求还未获得HTTP响应头时fetch尚未进入readSse，未被此空闲期限覆盖；这属于下一优先检查点，不声称所有卡住路径已修完。整体真实复杂协作质量、跨电脑逆向运行及最终多平台包仍待，goal active。
