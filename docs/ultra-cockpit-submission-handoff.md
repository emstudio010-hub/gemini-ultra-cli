# Gemini Ultra CLI 演练台任务占用归属交接

2026-11-15；WI-237 / E-529至530 / F-195；基线5eba5a50418ac2d02961833d6eaaf540a26b0e1b，分支codex/ultra-agent-portable。上一goal turn为progress（请求正文后会话复核已推送）。goal active，源码优先→Windows必要验证→功能收敛后最后统一打包；preview.83保持，不打包/重装/升版/多平台CI/旧付费重跑。

## Evidence → Finding → Path

F-195：Cockpit的submitting是全局boolean，旧Config未完成提交阻塞新Config，状态API也错误显示新会话busy；直接调用latest.submit若同步throw，尚未接上finally便逃出处理器，返回500并永久保留submitting=true。仅异步失败原来可释放。

用WeakMap<Config,object>记录各会话提交占用，状态API与POST门禁只检查自己的config。接纳时写入本次submission身份，Promise.resolve().then调用submit统一捕获同步/异步失败，沿既有终端反馈报告；finally仅删除仍为本次身份的条目。不同Config互不阻塞/互不解锁；同Config重新connect或控制台stop/start不会擅自取消任务或清占用。未新加超时、模型重试、任务取消；HTTP202为接纳确认，不冒称执行成功，提交报错通过终端反馈而非同步HTTP500。

## E-529 必要源码检查

新增drillCockpitSubmission4场景：旧Config任务不阻塞新Config且旧晚完成不解新任务；同Config重连保留锁直到结束；异步失败释放；同步失败同样报告并释放。baseline2实际失败（新Config原409、同步异常原500）/2正常控制通过，退出1；修后4通过，加上一轮SessionAdmission4相关回归，共8不同通过，退出0，无全量冒烟。

CLI tsc --build及双TS eslint --max-warnings0退出0。新测试多const按eslint --fix机械拆分，首格式检查测试余留缩进换行，最终Prettier及3文件check/git diff --check退出0，无行为变化不重复测试。收集/静态检查本轮较慢，原句柄确认结束后继续，不把这些耗时当CLI启动基准。

## E-530 Windows编译服务

verify-source-cockpit-submission.mjs独立home/profile、两个真实Config.initialize、编译Cockpit/原生HTTP API。提交回调使用可控Promise记录收件与收尾，无业务LLM替换/调用，证明的是UI提交占用状态。

实际流程：A接受pending任务；切B时status ready且可接受B任务；A结束不改变B busy且B重复提交409；B完成恢复ready。同B pending任务重新connect后仍busy；控制台stop/start后仍busy且重复409，原任务结束才ready。同步throw与异步reject均HTTP202接纳后各产生一次终端error反馈并ready；正常控制最后仍202并ready。仅6个被接纳的回调执行，所有重复拒绝均未调回调，供应商文件原字节保持。

20条件全部true，首次脚本执行退出0，32759ms，19次本地API（含状态轮询与拒绝控制），0fetch/模型/外部/付费/旧任务重跑。不是模型推理或复杂多Agent交付证据，也不是原生终端/浏览器/跨平台最终验收。

finally resolve自有deferred等待微任务收尾，解除自有反馈监听、断开会话/stop服务/dispose两Config，恢复fetch和DrillStore，经realpath与前缀核验仅清自建temp根。旧被拒清理目录不动。

## 证据与保全

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：cockpit-submission-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-cli-compile.log；-lint-fix.log/-lint.log；-format-write.log/-format.log/-final-format-write.log/-final-format.log；verify-source-cockpit-submission.mjs、source-cockpit-submission.log/-result.json；verify-cockpit-submission-preservation.mjs、source-cockpit-submission-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false和ULQ临时凭据已删均保全true。个人数据库/PATH/工具安装/旧未跟踪文件保持。复用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。Obsidian/源码/工程三份同SHA、目标池/case同步，显式stage/skip ci推隔离分支，不合并master/Release。

接续：回到Agent真实协作的失败恢复与模型路由边界，持续对照目标池，不把局部通过当上线完成。全局反馈本身的跨会话展示与任意订阅器错误不属于本次验证保证；复杂协作质量和最后分发仍待，goal active。
