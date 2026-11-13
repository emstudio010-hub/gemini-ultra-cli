# Gemini Ultra CLI 技能读取取消交接

日期2026-11-13。WI-197 / E-447至448 / F-154。基线2e0f7075866cde07b36901fb94f2b3a072249918，分支codex/ultra-agent-portable。整体goal active。遵循源码优先→Windows必要定向验证→功能收敛后统一打包；本轮无打包/全局重装/升版本/多平台CI或旧付费任务重跑，安装preview.83保持。

## 源码

原discoverAllMultiSourceSkills已有外层取消race，但loadSkillsFromDir没有signal，关闭技能窗口后底层仍扫描、排队读取和解析。现把原signal传到目录stat/glob/readdir等待、8并发worker及单文件读取，取消立即按原reason拒绝；worker不再领取排队文件，迟到正文不解析，取消不伪装成损坏技能警告。glob接收signal；不可取消的stat/readdir用race结束等待，已有OS操作不强行中止。

readFileWithEncoding/readSecureFileBuffer新增可选signal，向原生FileHandle.readFile或回退readFile传递，在stat/open/fstat/read/post-stat阶段检查。open若迟到，返回后会检查取消并走finally关闭句柄；保持既有dev/ino一致性检查和BOM解码。无signal调用仍使用原无参数readFile方式。SkillManager对loadSkillsFromDir的并发回调改为闭包，避免并发索引被误传成新增signal参数。

本轮只贯通已经可取消的多源技能发现入口。SkillManager普通启动/刷新当前没有外部signal，不宣称其后台读取全部可取消或有统一超时；上一阶段revision仍保护发布归属。

## E-447 源码定向

新增4项：预取消不扫描、悬置stat可取消、8活跃读取取消后不读排队/迟到不反馈、单文件取消后观察迟到reject。四文件技能检查43实际通过/1原skipped（含原loader23、manager9、刷新7、新4）；相关fileUtils的BOM/安全读20通过，116项按testNamePattern未选择，未新增skip。合计63不同实际检查通过。

首回归命令误将testNamePattern用于所有选中文件，导致新4项全被过滤，保留filtered日志/JUnit且不把它作为新验证；随后取消过滤重跑技能四文件通过。首格式命令工作目录不符未匹配，修正根目录后通过。独立fileUtils首次18通过/2失败：原测试用realStats.ino+1制造差异，Windows大inode超出安全整数时加1可能仍相等；仅把两处夹具差异改为必定不同的0/1，20项再通过，保留unsafe-ino日志/JUnit，不为测试放松产品身份校验。首manager格式提示后已修正。

core/CLI严格tsc退出0；六个本轮文件eslint --max-warnings 0最终退出0；五个完整文件prettier --check及git diff --check退出0。skillOrchestrator只整理修改表达式，不全文件重排原既有格式。未跑全量/冒烟，没有旧实现新4项实跑失败记录，不补称已有。

## E-448 Windows实际原生读取

Node v24.19.0，独立home/profile，真实多源两个根共25个SKILL.md（含UTF-16LE BOM中文）。编译后的discoverAllMultiSourceSkills→真实glob→安全文件句柄，8个FileHandle.readFile在实际原生调用前设置门闩；取消必须在释放前返回原reason，释放后真实Node readFile(signal)产生8个ABORT_ERR，8句柄close。独立计数所有第一目录open，取消阶段恰为8，不读取其余16文件或后续目录；无解析错误/发现警告或迟到未处理reject。

新signal发现能完整返回25个去重技能，完整中文正文和BOM正确，无signal单文件兼容；使用明显不同ino确认新signalled安全读仍拒绝身份不一致。14条件true，672ms/退出0/8原生中止/8关闭/8信号/取消阶段8次open，夹具字节保持、临时根finally清理成功。早期验证器只计门闩read次数，最终增加独立open计数后重验，以上为最终结果。

零模型/外部网络/工具执行/付费，不是ConPTY、启动速度基准、全部系统I/O强停或最终包验收。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- skill-read-cancellation-test.log/-junit.xml（43通过/1原skip）、-filtered-test.log/-filtered-junit.xml（早期过滤不算新检查）。
- skill-read-cancellation-fileutils-test.log/-fileutils-junit.xml（20通过/116未选择）、-fileutils-unsafe-ino-test.log/-fileutils-unsafe-ino-junit.xml（旧夹具2失败）。
- skill-read-cancellation-core-compile.log/-cli-compile.log、-lint.log/-final-lint.log、-format.log（首路径错）、-final-format.log/-manager-format.log/-fixture-format.log、-format-check.log（首manager提示）/-final-format-check.log。
- verify-source-skill-read-cancellation.mjs、source-skill-read-cancellation.log/-result.json；verify-skill-read-cancellation-preservation.mjs、source-skill-read-cancellation-preservation.json。

F-154 -> 外层取消只结束等待，未贯通技能队列与安全读取。传递signal和检查阶段，阻止取消后额外扫描/排队/解析，保留安全校验和无signal兼容。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持、ultra-tools不存在、preview.83保持；E-294/E-364旧复杂真实任务SHA和passed=false保持，无覆盖/付费重跑。不改个人数据库/凭据/工具安装/PATH。旧ultra-cockpit-review-scope-S0wWvh拒绝清理不重试。

沿用granted case / PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。维护目标池、case四项和证据，三份交接全文SHA一致；仅显式stage本轮文件，skip ci推隔离分支，不合并master或Release。继续源码功能收敛；复杂真实任务质量/更多模型/长会话及最终Windows/macOS/Linux统一包仍未验收，goal active。
