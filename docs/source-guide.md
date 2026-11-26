# 从设计要求读到验收证据

建议先从 Focus Mode 的三块屏幕读起，接着查看 Orchard 的失败断言，最后用 Digital 理解为何图片裁判和录像裁判会回答不同的问题。可顺着每行的代码入口查看作者真正执行的逻辑。

| 概念 | 源码入口 | 用一个已经发生的实验来理解 |
|---|---|---|
| Agent Loop · 生成循环 | [mini 的 DefaultAgent](https://github.com/SWE-agent/mini-swe-agent/blob/v2.4.6/src/minisweagent/agents/default.py) · [模型及 Bash 工具定义](https://github.com/SWE-agent/mini-swe-agent/blob/v2.4.6/src/minisweagent/models/litellm_model.py) | 模型提出操作，Bash 执行，结果回到下一轮。Focus 的 30 次模型回复触发 49 次 Bash。阅读[逐轮记录](../trajectories/focus-mode.jsonl)时，一行对应一个模型回合，calls 数组对应实际工具动作。 |
| Agent Harness · 运行框架 | [Harbor 的 mini 适配器](https://github.com/harbor-framework/harbor/blob/v0.18.0/src/harbor/agents/installed/mini_swe_agent.py) · [官方任务配置](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/tasks/focus-mode/task.toml) | Harbor 把同一份设计要求和启动模板放进隔离工作区，负责生命周期、时限与产物。类似给参赛者相同的 Figma 初始文件，验收清单在交卷后由评审打开。 |
| XR Blocks · 三维对象与场景 | [场景清单](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/xrblocks/src/simulator/DefaultManifests.ts) · [Focus 原始代码](../apps/focus-mode/main.js) | 虚拟办公屏同时具有材质、大小、朝向和三维位置。平面稿中看似相同的屏幕，抬手时可能固定在房间，也可能跟随手。 |
| GenXR-Test · 可回放动作 | [会话实现](https://github.com/xrblocks/xrblocks-devtools/blob/38221f1b077dcb4ba0c24259e3a7aadf26580ccd/src/session/session.ts) · [测试展开与录像](https://github.com/xrblocks/xrblocks-devtools/blob/38221f1b077dcb4ba0c24259e3a7aadf26580ccd/src/test/authoring.ts) | 模拟器可以换主手、看向目标、捏合、移动和松开。Focus 的左右手各做一遍；这种受控回放可以重查功能，真实佩戴者的舒适度仍需另行研究。 |
| 程序断言 | [Focus 用例](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/tasks/focus-mode/tests/f2p.test.ts) · [Orchard 用例](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/tasks/orchard-reach/tests/f2p.test.ts) | 读取同一个物体操作前后的世界坐标。康复场景里看见手指接近苹果，只证明瞄准；测试要求被抓住的苹果移动超过 10 厘米，实际为 0。 |
| 图片视觉断言 | [DevTools 图片裁判](https://github.com/xrblocks/xrblocks-devtools/blob/38221f1b077dcb4ba0c24259e3a7aadf26580ccd/src/test/judge.ts) · [Beerpong 用例](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/tasks/digital-beerpong/tests/f2p.test.ts) | 体感游戏的「投中」需要玩家看得出来。对照[投前](../media/digital-beerpong/right-score-image-01.png)与[投后](../media/digital-beerpong/right-score-image-02.png)，杯子变绿、数字加一。两张图可以说明计分反馈，无法还原中间每一步运动。 |
| 有效性、reward 与 Pass@1 | [DevTools 结果聚合](https://github.com/xrblocks/xrblocks-devtools/blob/38221f1b077dcb4ba0c24259e3a7aadf26580ccd/src/test/run-tests.ts) · [官方包装脚本](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/tasks/focus-mode/tests/test.sh) · [论文表 3](https://arxiv.org/html/2610.29014v2#S4.T3) | 先看评分器能否完成，再看全部必测项是否通过。首机会的单位是一个任务。左右手和多次截图都属于这个任务，不能额外算成独立样本。 |
| Design Score · 录像量表 | [录像裁判代码](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/tasks/digital-beerpong/tests/llm_judge.py) · [本机逐维度验收](../results/web-design.json) | 功能测试问屏幕是否移动；录像设计评审还问选中状态、反馈和空间摆放是否清楚。像 Figma 中拖动组件与选中描边的两份验收标准。十个网页原分可以求算术平均；证据存在冲突时，我们单列原始均分与验收状态。 |

## 三份任务原文

| 任务 | 官方任务 | 交付物 |
|---|---|---|
| Focus Mode | [空间屏幕任务原文](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/tasks/focus-mode/instruction.md) | [生成代码](../apps/focus-mode/) · [完整左手录像](../media/focus-mode/focus-mode-left.mp4) |
| Orchard Reach | [康复训练任务原文](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/tasks/orchard-reach/instruction.md) | [生成代码](../apps/orchard-reach/) · [左手入篮录像](../media/orchard-reach/orchard-reach-basket-left.mp4) |
| Digital Beerpong | [投掷游戏任务原文](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/tasks/digital-beerpong/instruction.md) | [生成代码](../apps/digital-beerpong/) · [右手快慢投录像](../media/digital-beerpong/digital-beerpong-velocity-right.mp4) |
