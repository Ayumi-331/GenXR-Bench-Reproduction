"""Verify the released evidence using Python's standard library. No network or model."""
import csv
import hashlib
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def ensure(condition, message):
    if not condition:
        raise SystemExit("Verification failed: " + message)


def records(name):
    with (ROOT / name).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def load(name):
    return json.loads((ROOT / name).read_bytes())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    entries = (ROOT / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
    seen = set()
    for line in entries:
        expected, name = line.split("  ", 1)
        path = ROOT / name
        ensure(name not in seen and path.resolve().is_relative_to(ROOT), name)
        ensure(path.is_file() and digest(path) == expected, name)
        seen.add(name)

    cohort = records("results/cohort.csv")
    jobs = load("results/job-attempts.json")
    costs = Decimal(0)
    seconds = Decimal(0)
    totals = Counter()
    for run in cohort:
        task = run["task"]
        turns = [json.loads(line) for line in (ROOT / "trajectories" / (task + ".jsonl")).read_text(encoding="utf-8").splitlines()]
        ensure([t["turn"] for t in turns] == list(range(1, len(turns) + 1)), task + " sequence")
        ensure(all(t["http"] == 200 and t["model"] == "deepseek-flash" for t in turns), task + " receipts")
        tool_calls = [c for t in turns for c in t["calls"]]
        ensure([c["ordinal"] for c in tool_calls] == list(range(1, len(tool_calls) + 1)), task + " Bash ordering")
        ensure(all(c["tool"] == "bash" for c in tool_calls), task + " tool definition")
        counts = {"turns": len(turns), "bash": len(tool_calls),
                  "test_turns": sum(t["counts_as_test"] for t in turns),
                  "edit_turns": sum(t["counts_as_edit"] for t in turns)}
        for key, field in [("input", "input_tokens"), ("output", "output_tokens"), ("total", "total_tokens"), ("cache_hit_input", "cache_hit_input")]:
            counts[field] = sum(t["usage"][key] for t in turns)
        for key, value in counts.items():
            ensure(value == int(run[key]), task + " " + key)
        totals.update(counts)
        ensure(all(t["usage"]["total"] == t["usage"]["input"] + t["usage"]["output"] for t in turns), task + " token arithmetic")
        peak = sum(Decimal(t["peak_estimate_usd"]) for t in turns)
        period_factor = Decimal("0.5") if task == "focus-mode" else Decimal("1")
        estimate = peak * period_factor
        ensure(estimate == Decimal(run["time_window_estimate_usd"]), task + " historical cost")
        costs += estimate
        seconds += Decimal(run["agent_seconds"])
        for name, meta in load("apps/snapshot-hashes.json")[task].items():
            ensure(digest(ROOT / "apps" / task / name) == meta["sha256"], task + " snapshot")
        web = load("results/web-design.json")[task]
        ensure(len(web["items"]) == 10 and sum(x["raw_score"] for x in web["items"]) / 10 == web["raw_ten_item_mean"] == float(run["web_raw_design_mean"]), task + " web scores")
        ensure(web["evidence_accepted_mean"] is None and not run["official_api_design_score"], task + " judge separation")
    ensure(len(jobs) == 4 and sum(j["agent_submitted"] for j in jobs if j["job"] == 1) == 2, "job attempts")
    ensure([r["effective_reward"] for r in cohort] == ["1", "", ""], "original effective rewards")
    cases = records("evaluation/first-cases.csv")
    ensure(Counter(c["interpretation"] for c in cases) == {"passed": 4, "required_program_assertion_failed": 2, "missing_visual_judge": 4}, "ten first-run hand cases")
    pictures = load("results/image-verdicts.json")
    ensure([p["verdict"] for p in pictures if p["source"].endswith("original model API")] == [False, False, True, None], "API image decisions")
    ensure(sum(p["source"].endswith("web Auto review") and p["verdict"] is True for p in pictures) == 1, "web image supplement")
    for item in pictures:
        pair = item["evidence_images"]
        ensure([p["ordinal"] for p in pair] == [1, 2], item["task"] + " image order")
        for image in pair:
            ensure(image["file"] in seen and digest(ROOT / image["file"]) == image["sha256"], image["file"])
    media = records("media/manifest.csv")
    ensure(len(media) == 25 and len({r["file"] for r in media}) == 25, "distinct recordings and stills")
    for item in media:
        ensure(item["file"] in seen and digest(ROOT / item["file"]) == item["sha256"], item["file"])
    videos = [m for m in media if m["file"].endswith(".mp4")]
    ensure(len(videos) == 10 and sum(int(v["frames"]) for v in videos) == 441, "video inventory")
    ensure((totals["turns"], totals["bash"], totals["total_tokens"], seconds, costs) ==
           (227, 280, 27601034, Decimal("2167.985"), Decimal("0.455349060")), "registered cohort totals")
    print(f"{len(entries)} file hashes verified; {len(jobs)} jobs; {len(cohort)} submitted apps.")
    print(f"{totals['turns']} replies, {totals['bash']} Bash results, {totals['total_tokens']:,} tokens, {seconds} agent seconds, USD {costs:.9f} estimated.")
    print("First official effective rewards [1, null, null]; 3/4 API image verdicts; 0/3 original API design scores.")


if __name__ == "__main__":
    main()
