# Gemini Ultra CLI 演练台原位语言切换交接

日期2026-11-14。WI-202 / E-457至458 / F-159。基线550470003d120576649b5d3e14c8095a131d4706，分支codex/ultra-agent-portable。上一轮失败历史界面已提交，属progress。整体goal active；源码优先→Windows必要定向验证→功能收敛后统一打包，无打包/全局重装/升版本/多平台CI/旧付费任务重跑，preview.83保持。

## 源码

此前浏览器实见语言切换后location.reload，当前面板、选中任务和所有未提交输入被清空。本轮只改drillCockpitPage.ts：语言保存成功后复用status/applyLocale原位翻译，不整页重载，不新增草稿/密钥到sessionStorage、localStorage或磁盘的保存逻辑。

动态规则标签用登记的中文/英文文本节点更新，名称/正文/勾选值保持；被移除节点在翻译时清理登记，避免累计断开节点。提示词保存路径、模型默认选项/供应商选项随locale更新；当前provider选择和表单值保持。已加载工具/技能表可用内存渲染回调切换列名/状态，不重新执行巡检；新加载或失败先失效旧回调，保存工具配置后只重绘“请重新检查”提示。工具路径输入草稿不会被语言重绘读取值覆盖。模型signature含locale，使原默认英文/中文项不残留。

已加载任务目录在当前nativePage做只读刷新，保留当前选中任务；详情仍绑定revision，翻译后重绘保留同任务/同member已展开的失败历史。dataset.taskId限定归属，不把上一任务的展开状态套到下一任务。不把旧归档引用当新审核或权限，不触发任务、模型请求或reports导出。

语言控件保存中禁用，提示就在控件旁的aria-live status，aria-describedby关联。失败还原选择框到原locale，不刷新/清草稿；恢复文件写入后可显式重试。初版复用了旧setting反馈，实见配置页可能看不到任务面板里的错误，随后改专用控件旁反馈并再次实际验证。原位翻译不承诺浏览器刷新、关页或新会话后恢复草稿；未新增导航状态持久化或固定像素滚动位置。

## E-457 源码检查

单文件CLI严格tsc首次/最终退出0，eslint --max-warnings 0首次/最终退出0，git diff --check退出0；保留既有生成页格式、仅修改行。实际HTTP获取最终生成页，把全部内联script交给vm.Script解析通过。没有新增镜像实现的单元测试，没有跑全量/冒烟。core未改，不重复编译未受影响模块。

证据：cockpit-live-language-cli-compile.log/-final-cli-compile.log、-lint.log/-final-lint.log；源码改动只在packages/cli/src/services/drillCockpitPage.ts。

## E-458 Windows实际浏览器

独立home/profile与真实Drill HTTP服务，沿用两成员/六次失败及缺口fixture；缺少正文archive时API仍只显示元数据。实际HTTP10条件回归全true，生成script可解析，未改任务文件、未读私有归档正文、未提交任务或外网请求。最终初始化/API记录9565ms/退出0，非启动速度基准。

CUA首轮实际观察：
- 在配置页填未保存提示词、供应商名称、假本地key，并新增规则名称/正文。切英文后配置页仍在，提示词/供应商名称/规则原输入保持，规则标签/删除按钮已英文；key仍显示有值但被工具脱敏，本轮未读取或断言其具体字符串。
- 打开演练台、输入未提交任务、选择原生Swarm并展开reader失败历史，再切中文。面板仍是演练台、选中同一task、任务输入完整、同reader历史仍展开，目录/详情/六档强度标签都为中文。
- 在fixture把locale.json临时换为同名空目录制造真实rename失败，原语言/任务/草稿/展开状态保持；恢复fixture文件后重试英文成功。没有改变个人locale。
- 首轮错误在任务feedback区域可见，但配置页可能隐藏它，因此源码加入控件旁独立status，编译后重新启动最终fixture再查。

最终版本CUA：配置页未保存FINAL_UNSAVED_DRAFT，中文→英文成功，草稿/当前面板保持且语言控件旁显示Settings updated；真实fixture目录阻挡导致Language not saved明确显示在同一配置页，控件还原English且启用；移除阻挡、恢复fixture原locale，显式重试中文成功，草稿保持、旁边显示“设置已更新”。最后截图内联工具输出，未单独落盘。原型key是假值，仅用来观察输入不因reload清空；没有保存供应商或发送任何key到模型服务。

不执行工具巡检验证缓存重绘，未把代码读取替代为巡检运行证明；未做多页任务目录/多分辨率/屏幕阅读器/外部CLI同时改locale压力验收。保留现有4秒status轮询与目录/详情归属逻辑，不宣称所有迟到网络结果或草稿初载竞态已解决。

最后扫描自有fixture常规文件，无任何输入草稿marker落盘；此检查只证明fixture磁盘，不检查浏览器自身持久化。browser-observed文件把手工CUA观察与磁盘检查分列，不把它冒称自动测试。finish后retention passed=true：任务hash保持、submissions0/external0，服务退出0/临时根finally清理成功。旧ultra-cockpit-review-scope-S0wWvh拒绝清理不重试。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- preview-source-cockpit-live-language.mjs、source-cockpit-live-language.log/-result.json；
- source-cockpit-live-language-before-feedback-result.json、cockpit-live-language-before-feedback-retention.json（控件旁反馈前的HTTP/保全）；
- cockpit-live-language-browser-observed.json（11项手工观察、2项磁盘/locale核对）、-browser-retention.json；
- finish-cockpit-live-language.mjs、verify-cockpit-live-language-preservation.mjs、source-cockpit-live-language-preservation.json。
临时browser-live记录含临时定位数据，不作为永久访问URL或正式报告附件发布。

F-159 -> 语言保存后重载页面丢失工作上下文。原位翻译、动态标签更新、任务展开归属保持和就近保存反馈修复；不持久化秘密/草稿、不改变任务授权或状态。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局preview.83保持；E-294/E-364旧复杂真实任务SHA和passed=false保持，无覆盖/付费重跑。未改个人数据库/凭据/工具安装/PATH。

沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。UI沿用已读取ui-skills-root与baseline-ui上下文，无新增技能或依赖。维护目标池、case四项与证据，三份交接全文SHA相同；Obsidian连接工具恢复可用，原子创建新笔记后从Vault复制。显式stage、skip ci推隔离分支，不合并master/Release。更多模型/长会话、复杂真实交付质量与最终Windows/macOS/Linux统一包仍未验收，goal active。
