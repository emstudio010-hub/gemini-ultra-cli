# Gemini Ultra CLI 供应商会话与语言一致性交接

日期：2026-11-11。WI-080/E-179，候选 preview.48。上一阶段47已交付；不改个人供应商配置、数据库或逆向工具，不调用付费模型。

## 修复与证据

/provider
use 原来只写活跃供应商，未同步会话的限定模型ID。会话 first:shared-model 切到 Second 后仍可能走 First；现在保存成功后同步 Config 当前模型并刷新命令表，add 和配置窗口关闭共用该逻辑。保存失败不切换会话；未配置模型的供应商不能被宣称已激活。

add 手填模型不再等待 /models，更新同名供应商保留原模型清单并加入新默认模型。省略模型时获取列表，空目录或失败则保留原文件与选择并提示手填；原行为会保存空模型并报成功。未知子命令显示用法。命令与子命令描述、列表、反馈随 locale 获取；use 补全每供应商只列一个ID。

旧实现5项回归全部失败，修复后6项定向用例与严格相关lint/type通过，覆盖限定路由、手填零目录请求、失败目录原文件字节、保存失败、语言即时切换和已有目录保留。

源码原生Windows ConPTY同会话：最初显式first:shared-model，切换中英文及列表；use
second后一次请求实际命中/second/chat/completions、shared-model。手填Third不请求目录，下一次命中/third/chat/completions、custom-model。共2次loopback模型请求，自然quit/退出0，无超时；不是启动基准或真实付费供应商验收。后续只补自定义预设英文名，不为静态文案重复此会话。

新增原生供应商CLI链源码通过：本地添加/切换0模型，真实选中端点请求1次，目录401导致命令退出42、原配置字节不变，中英文列表和已有供应商保留。最终包额外核对自定义预设英文标签。源码报告version取仓库上游nightly元数据，分发包另核对。

工程证据目录C:\Users\Administrator\Documents\ChatGPT\gmncliu：provider-command-before.log/-junit.xml、provider-command-final-test.log/-junit.xml、provider-command-final-types.log、provider-command-release-lint.log、provider-route-source.json/-output.txt、provider-cli-source.json/-output.txt。全部自建临时profile/loopback假密钥，旧失败保留。

## 分发与剩余目标

CI增加显式verification_scope=provider：三平台新鲜打包、实际安装及相关供应商链。普通push与默认手动full继续全部原生检查。本轮产品提交skip
ci后显式派发provider范围，不重复未受影响的Swarm/Teamwork/Ghidra；完整基线沿用47/run43018021899，不能称48重新验证全部逆向/协作。

最终源、CI、包SHA、全局安装待追加。goal
active，只推送codex分支，不合并master/正式Release。真实Teamwork长任务、更多模型、长会话摘要准确性、复杂逆向及其他机器交互仍未全部验收。
