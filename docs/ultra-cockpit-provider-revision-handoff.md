# Gemini Ultra CLI 演练台供应商编辑版本交接

2026-11-15；WI-235 / E-525至526 / F-193；源码基线c4a700d66bb198a4b0119a301d0e50ec099deeb8，分支codex/ultra-agent-portable。上一goal turn为progress（语言通知隔离已推送）。goal active，原目标不变：源码优先、Windows必要定向验证、功能收敛后最后统一打包。全局preview.83保持，无打包/重装/升版/多平台CI/旧付费重跑。

## Evidence → Finding → Path

F-193：终端ProviderConfigDialog已有requireCurrentProvider比较编辑快照，但演练台/api/providers只按id取最新对象，再应用旧表单，其他标签页或终端更新同供应商后仍被覆盖。另状态刷新重建select时，已删除供应商会让DOM选择值变空，若提交直接读该值会误走新增。

服务器对完整provider用当前控制台token作HMAC-SHA256生成不透明revision，/api/status逐供应商返回，密钥/私有header不出状态API；/api/providers修改已有id必须携带相同revision，否则409双语提示输入保留、重新选择后编辑。未提供版本也拒绝覆盖，新增不要求版本，目录读取仍是只读不要求版本。revision不是updatedAt单值，密钥等私有字段变化也失效；按provider独立，其他供应商修改不阻断无关编辑。返回保存后的新revision。ProviderManager原有跨进程文件冲突保护仍保留。

页面选择供应商时保存providerEditId/providerEditRevision；后台状态轮询不升级草稿版本，提交使用草稿身份而不临时读取可能变空的select。冲突仅显示错误、不清输入、不自动重试；成功反馈仅沿原revision归属门禁更新草稿身份/版本。用户明确选新增才清空编辑身份。未改变布局/模型激活语义/密钥留空保留规则；旧页面编辑缺少revision会409，需要重新加载新版页面。

## E-525 定向源码检查

新增drillCockpitProviderRevision3真实HTTP场景：同manager另一界面更改后旧表单409且文件保持、缺版本409且文件保持、状态版本不暴露key且当前编辑正常保存/版本旋转/原活跃模型及key保持。基线3全部失败：前2原200，第三版本缺失；修后3全部通过，退出0，无夹具收集错误。

CLI tsc --build与3TS eslint --max-warnings0退出0，最终4文件格式与git diff --check退出0。首最终格式仅文档换行，纯格式修后通过，无重复行为测试。无全量/冒烟。

交互规范按ui-skills-root路由，npx --no-install ui-skills categories/list interaction/get kemiljk/dxe-interaction-contracts；读取最小交互契约规范，落实“明确草稿权属、冲突保留输入、成功才采纳版本”，未因技能要求增加审批或暂停。仅沿已有编辑架构修改。

## E-526 Windows编译服务与发出的页面处理器

verify-source-cockpit-provider-revision.mjs使用独立home/profile、假key、实际Config.initialize/DrillCockpit原生HTTP API/ProviderManager。10本地API请求：状态revision有界不透明/no key；陈旧与缺版本409不写；当前版本成功并返回新版本且原默认/活跃模型和key保留；其他provider更新不影响当前版本；仅改key亦使旧表单409且文件不写；删除后旧id404不重建；新增无需revision成功。

同脚本从实际编译cockpitHtml输出中取完整provider编辑处理段，原样在VM+最小DOM适配器执行：后台providers新版本不替换打开草稿revision；409保留手填名称和旧revision/提示；DOM选择变空但草稿id不变，不误走新增；成功采纳返回的新revision；显式新增清空id/revision。该验证是实际发出的JS状态行为，未声称完整DOM/渲染浏览器或视效验收。

17条件全部true，首次执行退出0，6463ms，10loopback API，0供应商/推理/付费/旧任务重跑。fetch守卫不允许外部网络；脚本没有provider请求。finally断开自有会话/停止控制台/Config.dispose/还原fetch/DrillStore，经realpath与前缀校验仅清自建temp根。

## 证据与保全

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：cockpit-provider-revision-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-cli-compile.log；-lint.log；-format-write.log/-format.log/-final-format.log/-doc-format-write.log/-final2-format.log；verify-source-cockpit-provider-revision.mjs、source-cockpit-provider-revision.log/-result.json；verify-cockpit-provider-revision-preservation.mjs、source-cockpit-provider-revision-preservation.json；provider-revision-interaction-skill.log。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false及ULQ临时凭据已删均保全true；个人数据库/PATH/工具安装/旧未跟踪文件/旧被拒清理目录不动。复用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。Obsidian/源码/工程三份交接同SHA，目标池/case同步，显式stage/skip ci推隔离分支，不合并master/Release。

接续：模型配置刷新与任务运行时的路由一致性、真实复杂协作仍待收敛；本次只证明配置草稿冲突保护，非完整Agent上线或真实模型质量验收。保持goal active。
