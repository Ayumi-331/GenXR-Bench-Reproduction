# Historical cases and one controlled failure analysis

These cases predate the three-task cohort. They illustrate distinct engineering or interaction problems. Their jobs, repeated tests and human changes have separate denominators. [Seven historical jobs](historical-jobs.csv)

| Application | Original history | Functional evidence |
|---|---|---|
| Bubble Pop | Initial job stopped during infrastructure failure. An independent later job produced a submitted runnable app | valid, 0/2, reward 0; both hands encountered invalid scene-object references |
| Astraphobia Oasis | Two installation failures occurred before the third independent job submitted an app | invalid; the adaptive actor needed a Gemini credential |
| Product Visualizer | The first trial stopped after 30 responses and 44 Bash executions because the local continuity guard rejected an empty reasoning field. A fresh trial reached 98 requests and 109 Bash executions without an agent submission | The frozen snapshot ran; its original official result was valid, 0/2, reward 0 |

## Product Visualizer

The task requires the box to rest on the provided surface. The generated app used a table height of **0.75 m**, while the official scene's table was **0.79 m**. The initial check required the gap to be strictly less than 0.04 m. The numeric table height was available in the scene data but was not stated in the natural-language task. In a separate human diagnostic copy, a one-byte height change let both hands pass the initial spatial check. The left hand finished the interaction. The right hand stopped on the drag displacement assertion. [Height comparison](height-control.json) · [Official task](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/tasks/product-visualizer/instruction.md)

| Fixed diagnostic copy | Left | Right |
|---|---|---|
| Five repeats per hand, right hand first | Drag 5/5; full interaction 4/5 | Drag 0/5; full interaction 0/5 |
| Ten balanced pairs, five in each order | Drag and full interaction 10/10 | Drag and full interaction 0/10 |

The initial left-hand exception occurred at the final color-feedback check. In the balanced series, all twenty hand sessions passed the fifteen pre-drag assertions. Right-hand drag failures recurred in both order positions. This reduces concern about that specific order confound for this fixed app. [Five-pair records](initial-repeats.csv) · [Balanced-order records](balanced-order.csv)

Under five matched pitch settings, all **30/30** sessions targeted the box and **24/30** established a grab. The grab decisions matched in **15/15** left/right pairs. Six upward-pointing trials at +1° did not establish a grab. At near-horizontal angles, ray–plane intersections could become very large. Of **14** sessions that passed all original assertions and had a measured endpoint, **13** ended with the target outside the box footprint. The official task did not specify a center-error threshold. One instrumentation interruption was retained separately. The supplementary observations examine spatial goal attainment for one app; they have no effect on its original score, the three primary tasks, or the official design ratings. [Pitch groups](pitch-groups.csv)

中文要点：原始结果始终是 0/2。把桌面提高 4 厘米后才开展了左右手和角度诊断。程序能测量箱子是否移动，设计师还可能关心它最终是否覆盖想放置的位置。两者各自回答一个具体问题；人工改过的应用没有进入模型成绩。
