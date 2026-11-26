# Public agent trajectories

Each JSONL line is one saved model response in chronological order. Every response was matched locally to its recorded HTTP request, measured usage and outgoing conversation prefix. The calls array contains the Bash events in their original order, return codes, observed activity labels and command/result SHA-256 fingerprints. The sum of the arrays is 280. These are field-selected projections of the original trajectories. They support counting and auditing without releasing private model messages, reasoning, command bodies, machine paths or credentials.

| Task | Turns | Bash events | Testing turns | Editing turns |
|---|---:|---:|---:|---:|
| [Focus Mode](focus-mode.jsonl) | 30 | 49 | 12 | 2 |
| [Orchard Reach](orchard-reach.jsonl) | 80 | 98 | 34 | 19 |
| [Digital Beerpong](digital-beerpong.jsonl) | 117 | 133 | 36 | 39 |

Activity labels distinguish reading/exploration, static inspection, app or self-test edits, passive browser checks, hand input, internal-state checks, submission and observed session errors. A return code belongs to the Bash process. A successful command is not an official functional pass. A single model response can contain multiple commands and both edit and test activity. [Definitions and cost reconstruction](../docs/reproduce.md#metrics)
