# Reproducing and auditing the three-task cohort

## Offline evidence check

From the release root run `python scripts/verify.py` using Python 3.9 or later. It needs neither Docker nor a credential. It checks the published files against SHA-256, pairs the per-turn receipt information with the action records, and reconstructs the counts, costs and raw web means. The original private request bodies and raw model reasoning are retained outside this repository. Their published fingerprints allow a holder of those originals to identify the frozen versions. [Evidence hashes and protocol](../config/protocol.json) · [Snapshot hashes](../apps/snapshot-hashes.json)

## Fixed environment

| Component | Recorded setting |
|---|---|
| Host | Windows, WSL2 Ubuntu, Docker Desktop 4.99.0 / Engine 29.9.3 |
| Benchmark and scene | Official commit `ea31e2c2b23884f7ab810de31a755b273e996770`; XR Blocks 0.21.0; Living Room |
| Agent and harness | Harbor 0.18.0, mini-swe-agent 2.4.6, Python 3.12.16, LiteLLM 1.110.2, OpenAI Python client 3.57.0 |
| Generation provider | DeepSeek official API, requested and returned alias `deepseek-flash`, Thinking enabled, requested `xhigh`, documented mapping to `high` |
| Budget | One concurrent trial; 128 requests; 7,200 s generation; 240 s per request; 32,768 maximum output tokens per request; no automatic retries. At cumulative peak-price estimate $1.14 the next request is blocked. A maximum in-flight allowance of $0.3538944 keeps the registered envelope below $1.50 |
| Evaluation | Frozen submitted files, original tests, GenXR-Test, no network in the first functional evaluations. A later independent capture provided the four image-judge inputs |
| Docker identity | Image **ID**, not a registry pull address: `sha256:12ceb4f1b856a6710f9564a6239bd01e0c8119b555f75547f6c15f8eb191b972`. The local label was `genxr-runtime-app:local` |

The [fixed upstream Docker guide](https://github.com/whuang37/genxr-bench/blob/ea31e2c2b23884f7ab810de31a755b273e996770/docker/README.md) covers tool and image setup. From the release root, on Linux or WSL2:

```sh
git clone https://github.com/whuang37/genxr-bench.git vendor/genxr-bench
git -C vendor/genxr-bench checkout --detach ea31e2c2b23884f7ab810de31a755b273e996770
(cd vendor/genxr-bench && ./scripts/build-local-images.sh "$PWD/xrblocks")
```

A new build downloads upstream dependencies. Its image ID can differ from the machine that ran these experiments. The release does not distribute the original container or its layers.

## Replay a frozen application with the official verifier

The following prepares the **Focus Mode** replay. It checks the app files and exports four unchanged test files directly from the registered Git objects. The default stops after writing the inputs and argument list. Use a new output directory for each command.

```sh
python scripts/replay.py --task focus-mode --official vendor/genxr-bench --output replays/focus-prepared
```

For an actual new offline replay on your own machine with a locally built image:

```sh
python scripts/replay.py --task focus-mode --official vendor/genxr-bench --image genxr-runtime-app:local --output replays/focus-run --run
```

The other supported task names are `orchard-reach` and `digital-beerpong`. The launcher binds the app and tests read-only, clears model key variables inside the container, disables the network, and persists the verifier log, videos, exact image identity and exit code. Inspect `logs/verifier/xrblocks-test/f2p/result.json` for validity and `logs/verifier/reward.json` for the wrapper value. A process exit of zero alone cannot establish a valid judgment. The historical archival wrapper additionally retained handles to pre-retiming files. The published movies are the ones the first official verifier placed in its artifact directory. Two Orchard clips have 150 encoded frames each at 30 fps due to verifier retiming; that does not yield 150 distinct simulated actions.

**Validation at release:** the three portable replay preparations were executed against the fixed WSL checkout. The Docker commands were prepared, not rerun as new experiments. The first official runs are the source of the shipped results. A different simulator build or fresh replay can produce different output bytes. [Original per-hand outcomes](../evaluation/first-cases.csv) · [Media inventory](../media/manifest.csv)

## Generation recipe for independent researchers

The original generation used the upstream Harbor mini adapter and its standard run method. The local subclasses pin the installation and audit request accounting. Orchard job 2 and Beerpong also validated ASCII headers before transport. The same official system instructions, tool definition, model and budgets were used. The first Orchard job stopped locally before transport. Template and tool fingerprints appear in [the configuration](../config/protocol.json).

A Linux installation needs Harbor 0.18.0 and a **dedicated** CPython and mini environment usable inside the Debian-based Docker runtime. Upstream installation examples use `uv tool install --python 3.12 harbor==0.18.0`. For a dedicated mini environment, install `mini-swe-agent==2.4.6`, `litellm==1.110.2` and `openai==3.57.0` against CPython 3.12.16. Reader-created environments and clean builds have not been tested end-to-end here. Set `MINI_ENV` to the root of that environment. Preparation reads fixed source and version metadata only.

```sh
python scripts/generation_plan.py --task focus-mode --official vendor/genxr-bench --mini-env "$MINI_ENV" --output jobs/focus-plan
```

The resulting private `harbor-command.json`, `compose.json` and `launch.sh` contain local paths. The helper keeps them outside the versioned results. The compose file mounts only the pinned environment and model guards, and Harbor gets the official task checkout. Keep the review repository, answer files and other tasks out of the agent's workspace.

For an independently authorized **paid** run, the historical image ID, current account permissions and rates must match the researcher's intended protocol. The launch script checks the historical image label against its digest. The guard uses the registered historical rates and estimates; it is not a provider billing cap. The following commands are provided for use by the credential owner in Bash. They were **not executed** when preparing this release.

```bash
read -rsp 'DeepSeek API key: ' DEEPSEEK_API_KEY
echo
export DEEPSEEK_API_KEY
bash jobs/focus-plan/launch.sh
unset DEEPSEEK_API_KEY
```

The launcher records one attempt per private directory, asks Harbor to keep the application and trajectory on exit, and disables verification during generation. Protect the resulting private job directory. An installation-path constant in the host mini plug-in was replaced with an environment setting to make the recipe portable. The wire guard and the two mini configurations used across the three tasks are traceable through the [guard sources](../config/guards/) and [Focus](../config/focus-mini.yaml) and [header-checked](../config/checked-mini.yaml) configurations. The three preparation commands ran locally against the original mini environment, without a credential or model call. A live generation from the public launcher has not been validated.

## Metrics

- **Turns** count model replies with matching HTTP attempts. **Bash results** count executed tool calls. Distinct commands within a single Bash call are not counted as additional tool calls.
- **Tokens** add prompt and completion tokens. Cached prompt tokens and reasoning output are already included in those two totals. **Agent time** measures generation, excluding installation and verifier time.
- **Cost** uses the recorded peak-price estimate per call. The historical input prices per million tokens were $0.006 for cached input and $0.30 for uncached input, and $1.20 for output. The observed Focus time window applied a factor of 0.5. Orchard and Beerpong used 1.0. The sum of peak-price estimates is $0.481330356; the time-window estimate is $0.455349060. An account invoice was unavailable. These historical rates are not a quotation for a new run.
- **Approximate T/E** counts a turn with authored or executed self-tests in the numerator and a turn containing an edit in the denominator. A turn can enter both. Source reading alone does not count as testing. Every Bash action has a category, return code and fingerprints; the author classifier is unavailable. The [public trajectory](../trajectories/) omits private messages, reasoning, command bodies and console output.
- **Functional reward** requires a valid run of the complete official evaluator. Its outer wrapper can emit 0 on an invalid trial. **Pass@1** concerns the task's first generation and all required functionality. Missing judge evidence and stopped assertions are retained with separate status fields.
- **Visual judgments** include a Boolean and reason for a named image request, or ten 1–5 design ratings for a set of recordings. The archived web raw mean always uses all ten ratings. A reason was compared with footage, timestamps and program observations and classified as supported, partially supported, conflicting or insufficient. An evidence-accepted mean requires support across all ten. No subset of the ratings was re-averaged. [Rubric observations](../results/web-design.json)

## 中文读法

先运行 `python scripts/verify.py` 核对结果。想了解交互过程，先从[源码索引](source-guide.md)打开原任务、程序断言与录像。上面的 replay 默认只准备命令，显式加 `--run` 才会在断网容器执行本地功能测试。生成命令单独列出，只在研究者自己明确授权并输入密钥后才涉及费用。新运行应使用新目录，并保留其自身的成功、失败或无效记录。
