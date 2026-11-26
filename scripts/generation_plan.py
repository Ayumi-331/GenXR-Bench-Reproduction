"""Prepare the recorded Harbor generation command. The preparer never contacts a model."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CONF = ROOT / "config"
PROTO = json.loads((CONF / "protocol.json").read_bytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", choices=PROTO["task_order"], required=True)
    parser.add_argument("--official", type=Path, required=True)
    parser.add_argument("--mini-env", type=Path, required=True, help="Pinned dedicated Linux mini environment")
    parser.add_argument("--output", type=Path, required=True, help="New private directory for one run")
    options = parser.parse_args()
    if os.name != "posix":
        parser.error("Prepare the Linux bind mounts in Ubuntu or WSL2.")
    task = options.task
    repo, mini, out = (p.resolve() for p in (options.official, options.mini_env, options.output))
    check = subprocess.check_output
    ref = PROTO["upstream_commit"]
    tip = check(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    tree_changes = check(["git", "-C", str(repo), "status", "--porcelain", "--", "tasks/" + task])
    if tip != ref or tree_changes:
        parser.error("Use a clean task from the registered commit.")
    instruction = repo / "tasks" / task / "instruction.md"
    if hashlib.sha256(instruction.read_bytes()).hexdigest() != PROTO["evidence"][task]["official_files"]["instruction.md"]:
        parser.error("Task instruction differs.")
    interpreter = mini / "bin/python"
    probe = "import json,sys;from importlib.metadata import version;print(json.dumps([sys.base_prefix,*[version(k) for k in ('mini-swe-agent','litellm','openai')]]))"
    base_path, *versions = json.loads(check([str(interpreter), "-IB", "-c", probe], text=True))
    if versions != ["2.4.6", "1.110.2", "3.57.0"]:
        parser.error("Dedicated mini environment has different package versions.")
    base = Path(base_path)
    if base in (Path("/"), Path("/usr"), Path("/usr/local")) or mini == base or not (mini / "bin/mini-swe-agent").is_file():
        parser.error("Use a dedicated mini environment and a dedicated CPython installation.")
    if any(c not in "/._-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" for c in str(mini)):
        parser.error("Use a mini environment path without whitespace or shell syntax.")
    cfg = "focus-mini.yaml" if task == "focus-mode" else "checked-mini.yaml"
    agent = "approved_agent:PinnedMini" if task == "focus-mode" else "orchard_private_agent:OrchardMini"
    guards = CONF / "guards"
    volumes = [{"type":"bind", "source":str(p), "target":str(p), "read_only":True} for p in (mini,base)]
    for name in ["strict_history.py","wire_history.py","model-prices.json"] + ([] if task == "focus-mode" else ["orchard_header_guard.py"]):
        volumes.append({"type":"bind","source":str(guards / name),"target":"/opt/genxr-direct/"+name,"read_only":True})
    settings = {"PYTHONPATH":"/opt/genxr-direct","MSWEA_MODEL_RETRY_STOP_AFTER_ATTEMPT":"1","LITELLM_LOCAL_MODEL_COST_MAP":"True","DO_NOT_TRACK":"1","HF_HUB_OFFLINE":"1"}
    service = {"labels":{"org.genxr.deepseek":"reproduction-"+task},"volumes":volumes,"environment":settings}
    out.mkdir(parents=True, exist_ok=False, mode=0o700)
    (out / "compose.json").write_text(json.dumps({"services":{"main":service}},indent=2),encoding="utf-8")
    cmd = ["harbor","run","--path",str(repo/"tasks"/task),"--model","deepseek/deepseek-flash","--agent",agent]
    for kw in ["version=2.4.6","reasoning_effort=xhigh","max_tokens=32768","cost_limit=1.14","config_file="+str(CONF/cfg)]:
        cmd.extend(["--agent-kwarg",kw])
    cmd.extend(["--extra-docker-compose",str(out/"compose.json"),"--n-concurrent","1","--n-attempts","1","--max-retries","0","--no-delete","--environment-kwarg","keep_containers=true","--disable-verification","--verifier-env","GEMINI_API_KEY=unused-disabled-verifier","--jobs-dir",str(out/"jobs"),"--job-name","reproduction-"+task])
    (out/"harbor-command.json").write_text(json.dumps(cmd,indent=2),encoding="utf-8")
    # This private script is generated for a reader who independently decides to run a paid task.
    # Only the key's variable name is stored. The policy uses historical estimated prices.
    shell = [
        "#!/usr/bin/env bash", "set -eu", "umask 077",
        "cd " + shlex.quote(str(repo)),
        "export GENXR_MINI_ENV=" + shlex.quote(str(mini)),
        "export PYTHONPATH=" + shlex.quote(str(guards)),
        "export DO_NOT_TRACK=1 LITELLM_LOCAL_MODEL_COST_MAP=True PYTHONDONTWRITEBYTECODE=1",
        "unset OPENAI_BASE_URL OPENAI_API_BASE OPENAI_API_KEY MSWEA_API_KEY GEMINI_API_KEY GOOGLE_API_KEY GOOGLE_GENERATIVE_AI_API_KEY",
        "test \"$(docker image inspect -f '{{.Id}}' genxr-runtime-app:local)\" = " + shlex.quote(PROTO["policy"]["generation_image_id"]),
        ": \"${DEEPSEEK_API_KEY:?Set the credential in your own terminal before live execution}\"",
        "(set -o noclobber; : > " + shlex.quote(str(out/"attempt.started")) + ")",
        "exec " + shlex.join(cmd)
    ]
    (out/"launch.sh").write_text("\n".join(shell)+"\n",encoding="utf-8")
    print("Prepared a private argument list, compose file and launch.sh. No model request made.")


if __name__ == "__main__":
    main()
