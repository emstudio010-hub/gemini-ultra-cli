# Gemini Ultra CLI 真实协作与反编译签名分歧交接

日期2026-11-14。WI-206 / E-465至468 / F-163至164。基线12eeb72ad9150d31d1784ef45d74d21c0b898938，分支codex/ultra-agent-portable。上一goal turn为progress（长工作流源码修复及Windows证据）。本轮新增一次真实质量验证，失败后只改源码和做必要离线验证，没有付费重跑。整体goal active；源码优先→Windows必要定向验证→功能收敛后统一打包，无打包/重装/升版本/多平台CI，全局preview.83保持。

## E-465 新样本与原生工具

沿用granted case，扩充WI-206受限scope；PRIMARY沿用R26源码审查，新增静态样本按R7/radare2与R22/Ghidra路由，读取对应SKILL和tool-index/先例，无Codex子代理。新建无导入、不可执行用途的手工ELF64 signed-clamp.elf，三个函数位于0x100006000/0x100006060/0x1000060a0（超过32位但低于2^53）。样本SHA256：2cfc7955dedb67d98ef96cfb830cacc6337492c609b9f6c8d599e636d049b808。

实际编译源码Config/工具注册表执行11次工具：triage、rabin2 info、r2函数/三个指令窗口/两处xref、三次Ghidra函数反编译；77141ms/退出0、0模型网络，样本和个人配置保持。原生工具输出与完整C工件SHA一致。首次脚本生成器替换断言失败发生在任何原生/模型调用之前，修重复替换后才生成并执行脚本，无旧任务覆盖。

宿主独立对照实际机器指令和xref：CALL 0x1000060a9→0x100006060、0x100006064→0x100006000；edi=0xfffffe00，di符号扩展为-512，减288后-800，取负800，再夹到最多1024，entry加3得803。normalize全域[0,33056]，bounded_score[0,1024]。这些是静态推演，样本从未执行，不是exit code或运行结果。Ghidra数据库signature与C恢复声明确有差异，不能互换来源。

## E-466 一次真实Swarm未通过

当前配置路由deepseek/deepseek-v4.1-flash，复制到独立临时profile，low/输出上限16384/容量64000只用于该profile；个人provider不改。新任务仅复制本轮native证据，不提供生成器或宿主答案。协调者仅两份声明输出，flow/widths两个只读researcher和verifier独立workflow-auditor各一轮，无重试/替换/修正回合。budget24应用调度、1失败、3成员轮次；observer28 HTTP/420秒硬上限。

结果passed=false，247895ms、退出1、未超时；23实际请求（main9/researcher9/auditor5），预算requests23/failedTurns1/turns3，均在上限内。两研究成员完整交接，没有输出截断，本轮不是此前E-364的重跑。协调者实际写SIGNED_CLAMP_REVIEW.md和analysis.json，独立审核员实际读两文件与底层证据后返回passed=false，系统按失败预算正确blocked，未finish，也未假报交付完成。

真实审查发现：
- 报告把score-report.json的数据库signature写成undefined8 bounded_score(void)，实际字段是undefined bounded_score(void)，undefined8出自score.c。研究交接也有该混用，独立审核员据此拒绝，这是有效拒绝。
- 正文正确算出最终返回803，但JSON entryInferredUint32填了入口输入常量4294966784。宿主预期此字段表示最终返回，自动staticValue检查为false；审核员却把该输入解释判为正确，漏掉了结构化字段与最终返回语义的核对。本轮SPEC中entryInferredUint32/“fixed entry-path uint32 inference”命名说明也存在歧义，因此不能把它单纯归为算术能力错误：未来合同需分开entryInputUint32与entryReturnUint32并明确单位/位宽，本轮不改合同或失败工件来翻成通过。
- 两CALL边、7条精确单行引用、SHA、bounded_score范围、静态边界、只读工具集和原输入保持等自动项为true。整体交付仍失败，不能用这些局部项抵消。

原失败结果SHA：2728adb1c7b4fbb25de12bcd76eb618726fcc67550d7cdd46a8c506d2a5226bd。原报告、JSON、成员状态、请求/finish元数据保留；没有手工修正模型输出、追加预算或重跑。临时provider文件已删除，scratch live=false/credentialsRemoved=true。observer只记录工具名/角色/计数/usage等元数据，未完整审计每个读路径；不是OS沙箱证明。

## F-163 / E-467 源码改进

binary_decompile此前只有程序数据库signature和恢复C，缺少两种原型的明确分列。ghidraDecompileScript.ts现通过已安装Ghidra DecompiledFunction.getSignature()输出decompiledSignature（javap确认此API存在）；binaryDecompile.ts保留原signature兼容，新增可选decompiledSignature和signatureProvenance，标记ghidra-program-database / ghidra-decompiler-inference，缺失时not-provided，不伪造新推断值。note与工具描述明确两者可能不同，分别引用精确字段、对照反汇编，均不证明原始源码或ABI。原始字段不改名/替换。

ultraSpecialists.ts只读成员/独立审核提示补两类签名来源、输入/中间/最终返回区别及结构化/正文语义核对；随包local-reverse/SKILL.md同步说明，语义歧义必须显露。这些是指导改善，不能由提示送达证明真实推理质量已修好。F-164：结构化字段量义核对与真实完整交付仍开放，需后续新的明确合同验收，本轮禁止付费重跑。

一个相关测试文件7项通过：新增一条验证不同database/decompiler签名在返回与落盘报告中均保持；既有报告未给新字段时保持undefined/not-provided。core严格tsc、四TS文件eslint --max-warnings0、最终Prettier及git diff --check均退出0。无新提示字符串镜像测试，无全量/冒烟、CLI重编或多平台CI。格式化输出均unchanged。

## E-468 Windows实际Ghidra导出

只对改过的导出链做一次必要函数验证：从E-465样本复制新工作目录，经真实编译源码工具注册表binary_decompile选0x100006060，实际Java/Ghidra运行，30474ms/退出0/10条件true、0网络、未执行样本。数据库signature仍为undefined bounded_score(void)，新decompiledSignature为undefined8 bounded_score(void);，与完整C对应；两个来源和解释进入LLM结果及report.json，code SHA保持e9454cdbbf037337eac955d42084aa9bcbd55f3aeba009fd23382fbbe490387d。只读researcher/redteam-analyst/auditor生成的真实systemPrompt包含新指导，builtin技能被发现、开发dist单个MD与source SHA一致；不声称真实模型已重新使用或遵从新指导。

只同步变化的开发运行MD，未打包/安装。临时根finally清理；raw报告保留原已清理临时路径，decompile-signature-native/retained-artifacts.json明确映射到保留的decompiled.c/report.json/analysis.log及SHA，不改raw报告。

## 证据与保全

工程证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- prepare-signed-clamp-native.mjs、run-source-signed-clamp-native.mjs、source-signed-clamp-native.log及同名目录/result.json/11工具JSON/原始样本/manifest；review-signed-clamp-native.mjs、signed-clamp-host-native-review.json。
- prepare-signed-clamp-live.mjs、run-source-signed-clamp-live.mjs、observe-source-signed-clamp.mjs；source-signed-clamp-live.log；source-signed-clamp-live-swarm-result.json/-requests.jsonl/-wire.jsonl/-scratch.json。scratch含本地证据位置，不含可用凭据；原成员状态和两输出保留在其workspace。
- decompile-signatures-core-compile.log、-format.log/-format-check.log、-lint.log、-tests.log/-junit.xml（7项）。
- verify-source-decompile-signatures.mjs、source-decompile-signatures.log/-result.json、decompile-signature-native保留工件。
- verify-signed-clamp-preservation.mjs、source-signed-clamp-preservation.json。

保全全部true：个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83、旧E-294/E-364失败SHA及passed=false、本次E-466失败SHA及passed=false，临时凭据已移除。历史未跟踪文件与此前被拒清理目录不动。目标池/case四项及证据更新，三份交接全文同SHA；显式stage、skip ci推隔离分支，不合并master/Release。整体goal active，真实复杂协作质量及最终Windows/macOS/Linux统一分发仍未验收。
