# Public release audit

The publication directory was assembled from an explicit list of files in an empty Git repository. It contains three frozen applications, per-turn measurements, per-case results and the media shown to readers. Each application file was checked against the sealed generation snapshot. The input image order and the PNG bytes were recovered from each sealed native request. See the [application fingerprints](../apps/snapshot-hashes.json), [ordered image pairs](../results/image-verdicts.json) and [release checksums](../SHA256SUMS).

## What was inspected

- All ten first-evaluation MP4 files were decoded locally. They contain 441 frames in total and have one video stream each. All frames were inspected on contact sheets. All fifteen PNGs were inspected, including eight files used in the four independently captured image requests. The screens show the simulated room, application UI and virtual hands. Metadata inspection covered MP4 streams, format tags, PNG text and EXIF.
- The release uses one record per actual model turn. Each Bash event carries its ordinal, category, exit status and fingerprints. Full prompts, console transcripts, model reasoning, secrets, commercial dashboards, private chats and screenshots of account pages stay in the private archive. Published web judgment descriptions summarize the experimental response.
- The file allowlist, checksum manifest, committed paths, Git author identity and root history were checked. The content scan covered credential patterns, personal email addresses, machine-specific paths, private endpoint identifiers and disallowed file types. File paths inside the experimental container and public service domains are part of the execution protocol.
- The English and Chinese homepages link directly to the same source snapshots, outcome tables and downloadable media. The verification command below recalculates the study totals from released events. New verifier runs and model calls are independent experiments.

```sh
python scripts/verify.py
```

Third-party credits and the applicable license notices are in [Attribution and release scope](rights.md). The repository contains simulator captures and small generated apps. The third-party environment, raw asset models and private experiment archive are obtained or retained separately.
