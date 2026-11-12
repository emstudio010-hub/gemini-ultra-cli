# Gemini Ultra CLI 可选模式按需加载交接

日期：2026-11-13。WI-141 / E-336至337 / F-100。持续目标active。源码优先，Windows必要定向验证，功能收敛后最终统一打包。全局安装仍preview.83，本轮没有打包、重装、版本变化或跨平台CI。

## 源码改动

F-100：gemini.tsx在普通CLI入口静态导入ACP传输及沙箱启动器，随即加载ACP会话/命令管理和沙箱IDE桥接，即使没有选择这些模式。现在仅在既有config.getAcpMode()分支内导入ACP传输；沙箱仍经过原有配置、认证与参数准备后，在实际启动分支导入启动器。没有改变模式选择、沙箱权限、重启参数或ACP协议。只改一个产品源码文件的两处导入。

## Evidence → Finding → Path

E-336：Windows Node v24.19.0通过实际编译gemini模块和Node load hooks观察。旧入口加载3823个模块、332个CLI模块，包含14个ACP专用模块及5个沙箱/IDE桥接模块；修后3797/312，目标两组均为0，HTTP请求0。模块导入观察不是UI启动基准；单次修前7614.29ms、修后8122.93ms，修后与另一验证并行，且存在加载探针/缓存噪声，不能据此宣称稳定提速或性能回退。

初始探针将Yoga的data: WASM fetch误计为网络，导致零请求断言失败；第二次只为定位取栈，确认不是HTTP；修正允许本地data:、只阻断HTTP后完成正式前后观察。原日志保留，不将探针错误当产品缺陷。源码CLI严格类型编译及gemini.tsx ESLint退出0。复用既有沙箱激活、ACP/普通模式清理3项定向检查全部通过，50项不相关跳过；单测中的basic terminal和未结束startup指标提示保留，没有据此修改产品或运行全量/冒烟。

命令：根目录`npx tsc -p packages/cli/tsconfig.json`及`npx eslint packages/cli/src/gemini.tsx`；packages/cli目录`npx vitest run src/gemini.test.tsx src/gemini_cleanup.test.tsx --coverage.enabled=false --testNamePattern='should handle sandbox activation|should not register ConsolePatcher cleanup in ACP mode|should register ConsolePatcher cleanup in non-ACP mode'`。

E-337：确认编译退出0后，以隔离home/settings/loopback和load-hook观察启动真实Windows源码CLI。ConPTY普通终端显示输入框，实际输入/effort low返回成功，再/quit自然退出0；普通路径不加载目标ACP或沙箱模块。随后独立管道进程以--acp启动，真实JSON-RPC initialize返回protocolVersion=1和authMethods，ACP传输/dispatcher按需加载，沙箱仍不加载；stdin EOF后自然退出0。10组条件通过、24169ms/验证器退出0、模型请求0。探针下输入框11207ms、本地命令11617ms仅为本次源码运行观察，不与已安装bundle的E-259约1.9秒作性能对照。

首轮两个产品进程均已退出0、10条件通过，但验证器宿主的node-pty句柄残留；只终止经完整命令身份核对的已完成观察器，外层退出-1，原结果另存observer-lingering文件。验证器沿用既有flush后退出的收尾方式，最终上述验证明确退出0。没有据此改产品退出逻辑。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。observe-source-optional-imports.mjs、source-optional-imports-before.log、source-optional-imports-before-inspected.log、source-optional-imports-before-final.log、source-optional-imports-before.json、source-optional-imports-after.log/.json、optional-mode-imports-source-compile.log、optional-mode-imports-lint.log、optional-mode-imports-test.log/-junit.xml、track-source-optional-modes.mjs、verify-source-optional-modes.mjs、source-optional-modes-final.log、source-optional-modes-result.json、source-optional-modes-terminal-output.txt、source-optional-modes-acp-output.txt/-stderr.txt、source-optional-modes-observer-lingering-result.json/.log。观察脚本不随产品分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md的自有源码范围，本会话承担lead/cae/doc。esbuild既有ESM splitting和package-ultra按graph.outputs复制机制支持动态chunk；这里只读核对构建定义，没有构建或核验最终分发chunk。没有实际启动Docker/Seatbelt沙箱、完整编辑器ACP会话或macOS/Linux新验收。真实长任务与复杂逆向语义目标仍未完成。

个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在；没有付费调用、数据库/工具安装/PATH修改或外部安全目标。隔离codex分支同步带skip ci，不合并master或正式Release。继续按源码完整性、必要Windows验证、交接维护、最终统一打包顺序推进，goal保持active。
