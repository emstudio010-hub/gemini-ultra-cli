# Gemini Ultra CLI 演练台资源按需加载交接

日期：2026-11-13。WI-194 / E-441至442 / F-151。源码基线162f891b544dfd8307c7df82f8c84fec88dff296，分支codex/ultra-agent-portable。上一阶段为源码/Windows验证/提交进展，整体goal active。继续源码→Windows必要定向验证→最终统一打包；无打包、重装、升版本、多平台CI或旧付费重跑，全局preview.83保持。

## 源码启动路径

AppContainer会话连接及BuiltinCommandLoader的drill命令静态依赖drillCockpit服务；服务原静态导入drillCockpitPage/cockpitLocale/morphiconsBundle，因此即使不用演练台，普通命令表加载也提前加载三模块。三个源码文件共82,063字节（42,040/5,238/34,785），并不是CLI所有启动依赖体积。

仅改drillCockpit.ts两处导入位置：页面GET /首次请求才import drillCockpitPage（继而locale），GET /assets/morphicons.js才import图标bundle；均在writeHead之前await，导入异常仍走既有请求错误处理。Node模块缓存处理并发首次请求，不新增自定义缓存/状态，不改连接、端口、URL、随机nonce、令牌、来源校验、CSP、页面UI或Morphicons资源。不把整个控制台服务或core依赖称为懒加载。

首次打开页面/图标会承担原本提前加载的模块工作，这是必要的按需时机变化。未打包/检查esbuild产物，不声称最终单文件分发包仍保持同样模块解析边界；等最后统一包阶段再检验。未声称秒级启动/全局速度百分比、全部卡顿已修复。

## E-441至442 Windows原生模块与真实HTTP对照

验证器在新Windows进程通过Node原生registerHooks.load观察三个实际编译模块，只记录模块名，不改源码/模块输出。实际BuiltinCommandLoader(null).loadCommands加载56条，普通language/effort/drill/swarm存在，再connect/start真实控制台、并发两次页面GET/两次图标GET。

修改前：普通命令表加载已加载page/locale/icons三模块，随后start/GET不再重复。结果源文件与响应作为before基线保存，退出0。
修改后：普通命令表后beforeOpening=[]，start后afterStart=[]；首次并发页面GET仅page+locale；图标GET后才出现bundle，各模块各加载一次，56命令保持。

13最终条件true，7419ms/退出0：并发响应200/MIME正确/内容相同，页面内两script块与图标JS均vm.Script可解析，页面nonce规范化后SHA和图标原字节SHA精确等于before。页面46,778字节，icons34,217字节，两次相同；随机nonce规范化仅为比较内容，不改实际HTTP响应。原Cache-Control/no-store、Referrer-Policy、nosniff、CSP frame-ancestors保持；错误令牌API与错误Origin页面均403。0任务提交/模型/外部网络/付费，无浏览器访问，专用fixture finally清理成功。

before整个验证9215ms/after7419ms都包含模块、命令、server和HTTP阶段，仅一次且非启动计时，**不用于宣称稳定加速差值**。证据只证明源码模块加载时机、字节一致及访问控制。没有新增视觉改动，未重做之前浏览器动效验收，不将JS语法解析冒称浏览器效果验收。

CLI严格tsc、唯一修改文件eslint --max-warnings 0、prettier --check、git diff --check均退出0；无产品/夹具失败重跑。这个两行导入移动直接用实际模块与HTTP对照验证，未新建镜像单元测试、未跑全量/冒烟，core未改不重编译。

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- verify-source-cockpit-lazy-loading.mjs；source-cockpit-lazy-before.log/-before-result.json、source-cockpit-lazy-after.log/-after-result.json。
- cockpit-lazy-cli-compile.log / -lint.log / -format-check.log。
- verify-cockpit-lazy-preservation.mjs / source-cockpit-lazy-preservation.json。

F-151 -> drillCockpit静态资源导入使普通CLI加载可选WebUI资源。按实际HTTP入口动态导入修复源码加载路径；页面/图标内容与既有接口未删减。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持、ultra-tools.json不存在、全局preview.83；E-294/E-364旧真实复杂任务精确SHA及passed=false保持，无覆盖/付费重跑。不改个人数据库、凭据、工具安装或PATH，旧被拒清理ultra-cockpit-review-scope-S0wWvh不重试删除。

沿用granted case / PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理或外部扫描。目标池/case四项更新，三份全文SHA一致，显式stage本轮文件/报告、skip ci提交推codex隔离分支，不合并master/Release。继续启动加载与Agent源码收敛，复杂真实任务质量/更多模型和最后Windows/macOS/Linux统一包仍待；整体goal active。
