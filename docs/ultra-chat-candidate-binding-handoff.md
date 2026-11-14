# Gemini Ultra CLI Chat候选归属交接

日期2026-11-15，WI-227 / E-509至510 / F-185。源码基线52dc9027decd9c9032578de76465e1134fb7255f，分支codex/ultra-agent-portable。goal active；源码优先→Windows必要定向验证→功能收敛后最后打包，不打包/重装/升版本/多平台CI/付费失败重跑，全局preview.83保持。PRIMARY R26 code-audit，lead/cae/doc同会话，复用granted case，无Codex子代理/外部安全目标。

## Evidence → Finding → Path

F-185：providerProtocol.ts的Chat候选schema没有保留index，Zod剥离编号；普通响应及流每帧均取choices[0]。反序候选会使用备用工具参数，独立备用帧会混入正文/思考/工具片段，备用length能终止主候选；只有index1也会当成功。基线9场景实际8失败/1兼容正常通过，退出1，无夹具异常。

schema增加可选非负整数index，selectChatChoice统一普通/流按index0取主候选，空候选返回空供usage尾帧使用，单候选省略index视为主候选兼容。多个候选缺任何index或重复index报固定无正文的歧义错误。显式非主单帧不参与正文/思考/工具/stop；流记录是否见过主候选，无主候选即使[DONE]也拒绝。主候选仍沿原有完成/异常收尾，usage先收集。工具批量最终发布，歧义出错0调用；不猜JSON、不新增自动重试，不改其他协议。troubleshooting说明选择与兼容规则。

## E-509 源码与必要检查

providerChatChoice新增9用例全部通过：普通/流反序主候选、主片段被备用length/私有正文思考穿插后继续正确拼接及usage8、普通/流只有备用拒绝、多候选无编号/重复0/混合编号拒绝、单无编号兼容。既有ResponsesIdentity10、ToolIdentity7、ArgumentDiagnostic7通过，合计33不同相关用例；测试两次定向调用各退出0（19与14），非全量/冒烟。

首次测试命令误含不存在providerToolArguments.test.ts路径，Vitest仅实际收集新9和Responses10；未把未收集者算通过，后续以实际文件providerToolIdentity和providerArgumentDiagnostic单独补14。core tsc --build退出0，三TS eslint --max-warnings0退出0；首format发现测试及文档需规范，纯格式write后4文件check及git diff --check退出0，无行为变更不重跑。CLI生产未改不重编。测试收集耗时不是CLI启动速度基准。

## E-510 Windows真实协议与原生成员

verify-source-chat-candidate-binding.mjs使用独立home/profile、假key、fetch仅自有loopback，实际编译Universal Chat和原生HTTP/SSE。直接6请求：普通/流反序候选选主、交错备用length/正文/思考/参数不干扰主调用并保留usage8、普通/流only-alt拒绝0调用、缺编号多候选拒绝且无私有正文泄露。

实际Config/gateway/ManageSwarmTool/coder/AgentTool/LocalAgentExecutor/GeminiChat/Swarm两任务：歧义响应首候选含合法write_file，仍1请求1轮1失败blocked/paused、文件未创建、成员保留安全歧义诊断；显式cancel后独立正常控制，备用index1含write_file及length，主index0含complete_task，实际成员waiting/无失败/CHAT_CANDIDATE_CONTROL保留，备用文件未创建、备用正文未进入报告。控制只证明成员完成，不等同整任务交付或推理质量。

20条件全true，首次执行退出0，7232ms，总8本地请求，0外部/付费/旧任务重跑；隔离provider字节不变。finally等待自有成员/配置dispose/还原fetch/关loopback/DrillStore，realpath验证后只删除真实temp下自建ultra-chat-candidate-binding前缀根。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：chat-candidate-binding-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-related-tests.log/-related-junit.xml；-core-compile.log；-lint.log；-format.log/-format-write.log/-final-format.log；verify-source-chat-candidate-binding.mjs、source-chat-candidate-binding.log/-result.json；verify-chat-candidate-binding-preservation.mjs、source-chat-candidate-binding-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false及ULQ临时凭据已删均保全true。旧未跟踪文件/个人数据库/PATH/工具安装/旧被拒清理目录不动。目标池/case追加，Obsidian/源码/工程交接三份同SHA，显式stage/skip ci推隔离分支，不合并master/Release。

E-503没有存原始工具参数和候选编号，不能把本轮修复称为它已证明的根因，也不能宣称ULQ或复杂协作质量验收通过。未验证实际供应商多候选、原生终端和最终分发包，goal active。

## 接续顺序（按已授权范围继续）

1. 深入核对普通执行器与会话执行器的失败诊断交接，保持安全结构与结果状态。
2. 维护目标池和证据，导出下一阶段报告，不重跑四份旧付费失败。
3. 源码功能收敛后再做最终Windows与macOS/Linux分发验收。
