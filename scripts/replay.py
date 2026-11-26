"""Prepare or explicitly execute the upstream offline verifier on a frozen app."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = json.loads((ROOT / "config/protocol.json").read_bytes())


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", choices=PROTOCOL["task_order"], required=True)
    parser.add_argument("--official", type=Path, required=True, help="Official Git checkout containing the fixed commit")
    parser.add_argument("--output", type=Path, required=True, help="A new private run directory")
    parser.add_argument("--image", default=PROTOCOL["policy"]["generation_image_id"], help="A locally available image ID or tag")
    parser.add_argument("--run", action="store_true", help="Execute the original local verifier with network disabled")
    args = parser.parse_args()
    task, ref = args.task, PROTOCOL["upstream_commit"]
    repo, output = args.official.resolve(), args.output.resolve()
    app = ROOT / "apps" / task
    hashes = json.loads((ROOT / "apps/snapshot-hashes.json").read_bytes())[task]
    for name, meta in hashes.items():
        if hashlib.sha256((app / name).read_bytes()).hexdigest() != meta["sha256"]:
            parser.error("Frozen app differs: " + name)
    task_dir = "tasks/" + task
    if git(repo, "rev-parse", ref + ":" + task_dir).decode().strip() != PROTOCOL["evidence"][task]["official_task_tree_git"]:
        parser.error("Official task tree differs")
    # The historical wrapper mounted these four files from the pinned Git objects.
    payload = {}
    for name in ("test.sh", "f2p.test.ts", "instruction.md", "llm_judge.py"):
        data = git(repo, "show", ref + ":" + task_dir + "/tests/" + name)
        upstream_key = "instruction.md" if name == "instruction.md" else "tests/" + name
        if hashlib.sha256(data).hexdigest() != PROTOCOL["evidence"][task]["official_files"][upstream_key]:
            parser.error("Official verifier file differs: " + name)
        payload[name] = data
    output.mkdir(parents=True, exist_ok=False)
    tests, logs = output / "official-tests", output / "logs"
    tests.mkdir()
    logs.mkdir()
    for name, data in payload.items():
        (tests / name).write_bytes(data)
    argv = ["docker", "run", "--rm", "--pull=never", "--network", "none", "--shm-size", "1g"]
    for local, target, readonly in ((app, "/workspace/app", True), (tests, "/tests", True), (logs, "/logs", False)):
        mount = f"type=bind,src={local},dst={target}" + (",readonly" if readonly else "")
        argv.extend(["--mount", mount])
    for key in ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY", "DEEPSEEK_API_KEY"]:
        argv.extend(["-e", key + "="])
    argv.extend(["-e", "MODEL_NAME=gemini-3.8-flash", "--entrypoint", "bash", args.image, "/tests/test.sh"])
    (output / "replay-command.json").write_text(json.dumps(argv, indent=2), encoding="utf-8")
    print("Verified snapshot and four upstream inputs; wrote replay-command.json.")
    if args.run:
        image_id = subprocess.check_output(["docker","image","inspect","--format","{{.Id}}",args.image],text=True).strip()
        (output / "image-id.txt").write_text(image_id + "\n", encoding="utf-8")
        if image_id != PROTOCOL["policy"]["generation_image_id"]:
            print("Locally rebuilt image differs from the historical image ID.")
        with (output / "console.log").open("xb") as log:
            run = subprocess.run(argv, stdout=log, stderr=subprocess.STDOUT)
        (output / "exit-code.txt").write_text(str(run.returncode) + "\n", encoding="utf-8")
        print("Verifier exit:", run.returncode, "Inspect the validity field and raw reward under logs/verifier.")
        raise SystemExit(run.returncode)


if __name__ == "__main__":
    main()
