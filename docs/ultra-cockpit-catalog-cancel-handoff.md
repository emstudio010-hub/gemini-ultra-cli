# Gemini Ultra CLI 演练台模型目录取消交接

日期2026-11-15，WI-232 / E-519至520 / F-190。基线ab1f915c7dd8251a603c45fe30f8358760cdaff7，分支codex/ultra-agent-portable。上一goal turn为progress（错误元数据安全交接已推送核远端）。goal active；源码优先→Windows必要定向验证→功能收敛后最后打包，无打包/重装/升版本/多平台CI/旧付费重跑，全局preview.83保持。

## Evidence → Finding → Path

F-190：模型配置复查发现终端及演练台页面已有取消/迟到响应门禁，但drillCockpit.ts的/api/provider-models后端调用fetchModelsFromEndpoint没有传signal。浏览器取消、表单切换使浏览器请求断开或stopDrillCockpit关闭HTTP连接后，上游/models仍继续到自身7秒上限。ProviderManager本身已支持取消，缺的是API连接到上游的接线。

仅在模型目录API分支创建每请求AbortController，绑定req.aborted和res.close；若进入分支时req已中止或res已destroyed，先置取消态，避免调度目录请求。signal传给既有ProviderManager；取消后不再写回复。finally移除两个监听并abort释放请求。正常响应沿原路径reply，原7秒超时/目录解析/供应商保存语义保持，不新增重试。stop关闭连接自然传播到此signal，无新增全局控制器或后台轮询。没有改前端动画/控件，不触碰个人配置。

## E-519 必要源码验证

新增drillCockpitProviderCancellation4场景，均使用真实HTTP服务/ProviderManager/native fetch，只有DrillSession中未在该API访问的Config为最小fixture：浏览器断开时上游等headers、等body，控制台停止，正常目录不保存配置。初baseline2个明确行为失败（headers与server-stop在断开后连接仍开）、normal通过；body场景等待超时60秒，没有把它称为第三个已复现产品缺陷。原日志退出1保留。

生产修复后headers/stop/normal通过，body在上游调度前观察到测试客户端fetch ECONNRESET；给夹具加有限请求观察后不再拖到60秒。将夹具API客户端改成http.request agent:false独立连接，消除固定端口停启期间客户端连接复用的干扰；仅补body和正常控制2场景通过，不重跑已通过headers/stop。最终4不同场景均有通过证据；normal重复不重复计数。该夹具调整未改生产fetch，相关首轮失败结果均保留，不用运行器退出或未触发条件代替成功。

CLI初/最终tsc --build退出0；双TS首/最终eslint --max-warnings0退出0，3文件格式与git diff --check退出0，无全量/冒烟。测试开始等待的时间不是CLI启动性能基准。

## E-520 Windows实际编译服务

verify-source-cockpit-catalog-cancel.mjs独立home/profile、假key、网络限制自有loopback，实际编译Config.initialize/DrillCockpit/API/ProviderManager/native fetch。API客户端使用独立原生HTTP连接，模拟真实连接断开，不替换后端业务实现。上游headers/body保持未结束，不主动释放响应，再触发客户端断开或停止控制台。

三个取消场景均在夹具1.5秒观察内看到上游socket关闭，配置原字节保持。停止后重新start控制台，正常/models返回retained-model/new-model，仍不保存配置。13条件全true，首次编译脚本执行退出0，10563ms；总4次loopback目录读取，无模型推理/外部付费/旧任务重跑/自动重试。观察窗口不是产品全局时限保证；该阶段没有实际浏览器/原生终端或最终包验收。

finally断开自有session、停止自有控制台、Config.dispose、还原fetch、关闭上游及DrillStore，经realpath和前缀验证只清真实temp下自有ultra-cockpit-catalog-cancel根。单元夹具清理亦核父temp与前缀。没有触碰旧被拒清理目录。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：cockpit-catalog-cancel-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml（修后3通过/body客户端ECONNRESET）；-focused-tests.log/-focused-junit.xml（body/normal2通过）；-cli-compile.log/-final-cli-compile.log；-lint.log/-final-lint.log；-format-write.log/-final-format-write.log/-format.log；verify-source-cockpit-catalog-cancel.mjs、source-cockpit-catalog-cancel.log/-result.json；verify-cockpit-catalog-cancel-preservation.mjs、source-cockpit-catalog-cancel-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false及ULQ临时凭据已删均保全true。个人数据库/PATH/工具安装/旧未跟踪文件保持。PRIMARY R26 code-audit、granted scope、lead/cae/doc同会话，无Codex子代理/外部安全目标。目标池/case追加、Obsidian/源码/工程三份同SHA，显式stage/skip ci推隔离分支，不合并master/Release。

该修复接通目录取消，不证明所有加载步骤、E-503真实失败根因或F-164协作质量已过；goal active。

## 接续顺序（已授权继续）

1. 深入演练台start/stop的异步生命周期，核对服务启动未完成就停止时是否存在迟到监听或旧地址发布。
2. 继续目标池模型配置/启动等待的源码收敛，保留真实失败并导出阶段交接，不自动重跑付费任务。
3. 源码功能收敛后统一Windows最终验收，最后macOS/Linux打包。
