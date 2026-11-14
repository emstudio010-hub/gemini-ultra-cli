# Gemini Ultra CLI 供应商表单异步归属交接

日期2026-11-14。WI-204 / E-461至462 / F-161。基线4e290c5aea084c082d678341af91ffc6ff5e5dfc，分支codex/ultra-agent-portable。源码优先→Windows必要定向验证→功能收敛后统一打包；goal active，无打包、重装、升版本、多平台CI、旧付费任务重跑，全局preview.83保持。

## 源码

drillCockpitPage.ts原获取清单/保存回调不确认表单归属：切供应商或继续输入后，旧回调仍会覆盖模型文本、清空新key、切回旧供应商并显示旧反馈。现用providerRevision跟踪选择与form input/change；更改即使旧请求失效，清空旧反馈。模型清单使用独立AbortController，合并原12秒期限，输入/切换/保存会取消旧清单并恢复加载按钮；迟到成功或错误不能写新表单。仅有当前controller负责finally恢复按钮，防旧请求干扰新请求。

保存有在途防重入，不中止已经提交的写请求；只让当前revision在刷新后清key/选择已存id/写反馈，异常也按revision归属。编辑期间的保存仍作用于当时提交快照，后续草稿保留，未自动重试或提交草稿。获取清单写回模型也推进revision，避免覆盖期间的保存回调。

status刷新改用共享在途Promise，保存后refresh(true)等待原状态请求结束再获取保存后的新状态，避免原polling直接return导致新增id尚无option而选择丢失；普通刷新合并在途请求，不加轮询频率。保持原4秒轮询、错误处理与整体就绪显示。只修改生成页，无core/API/依赖变动。

## E-461 源码检查

CLI严格tsc初次/最终退出0；单文件eslint --max-warnings 0退出0；git diff --check退出0。生成页保留既有格式，仅修改行，真实HTTP返回全部内联script经vm.Script解析通过。无新镜像实现单元、全量或冒烟测试。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：cockpit-provider-races-cli-compile.log、-final-cli-compile.log、-lint.log。

## E-462 Windows真实界面与延迟HTTP

独立home/profile、假key、真实编译源码Drill服务和ProviderManager、本地模型目录端点；只在自有loopback代理延迟已有响应，不替换页面脚本、不通过UI注入运行代码、不修改个人配置。浏览器IAB隐藏运行，实际CUA手工操作与磁盘/代理门记录分列。

1. Alpha加载模型清单时hold响应，切Beta后选中Beta且beta-model未变、无旧反馈、按钮恢复；代理在release前已记录clientClosed，证明浏览器取消该请求。放行旧响应后界面保持Beta；再次获取返回CATALOG_RESULT，按钮可用。
2. Alpha保存响应hold（服务端写已经完成），切Beta再输入未存名称及新假key；release后选择仍Beta、名称草稿与非空key保持，旧成功反馈不写入，按钮恢复。key仅以DOM非空布尔核对，不输出原文。
3. 同Alpha保存响应hold后继续改名称/假key；release后同供应商的新名称与非空key保持。中间为后续场景准备的status-before-save hold也已释放，不作为独立完整用例。
4. status-new-provider延迟响应期间新增Race New fixture（空key、新模型），磁盘证明新provider已保存且旧status仍hold；释放旧状态后保存强制刷新取得新清单，最终选中Race New fixture/new-model，中文成功反馈与按钮恢复。该tag存在两个实际状态响应hold，均已release，记录完整保留。

总计2次本地catalog请求、3次明确保存、0任务提交、0外部请求；最终retention passed=true，Alpha/Beta原key保留。独立磁盘7项true，未保存名称/假key没有落入provider文件，新增provider保存。所有响应tag最后clientClosed也包括正常结束，不能把其余close字段冒称取消证明；只有首catalog在release前检查close为true。

最后截图工具内展示中文new-model及成功反馈，未单独落盘。无自动UI测试计数，无真实供应商/付费生成/屏幕阅读器/跨浏览器或极端网络压力验收。客户端取消只证明自有代理连接关闭，不声称服务端模型目录上游请求同时取消。服务端写请求不撤销；切换后原快照可能已保存，后续草稿不冒称已保存。

finish脚本退出0，retention passed=true、finally停止服务并清理自有临时根；个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83及旧E-294/E-364失败SHA和passed=false保全true。

证据：preview-cockpit-provider-races.mjs、source-cockpit-provider-races.log；finish-cockpit-provider-races.mjs、cockpit-provider-races-browser-observed.json、-browser-retention.json；verify-cockpit-provider-races-preservation.mjs、source-cockpit-provider-races-preservation.json。browser-live含临时定位，不作为公开链接。

F-161 -> 模型清单/保存迟到响应污染新表单，新增保存与旧status交错丢选中项。原始缺陷基于直接可达的无归属回调读取确认，本轮未单独运行旧版失败重现；修后用真实延迟HTTP/CUA上述场景验证，不把旧版失败虚构为实测。

## 接续

沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描；UI沿用ui-skills-root及baseline-ui。目标池、case四项和证据更新，三份交接同SHA。显式stage、skip ci推隔离分支，不合并master/Release。继续源码收敛与Windows定向验证，整体发布和复杂真实质量未完成，goal active。
