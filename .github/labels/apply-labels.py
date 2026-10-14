#!/usr/bin/env python3
"""Apply .github/labels/issue-label-map.json to the issues in this repository.

The map is a JSON object of the form {"<issue number>": ["label", ...]} and is
kept in the repository so the triage state of every tracked issue is reviewable
in a pull request. Requires the gh CLI with a token that can write issues.
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys

MAP_PATH = pathlib.Path(__file__).with_name("issue-label-map.json")


def main() -> int:
    repo = os.environ["GITHUB_REPOSITORY"]
    mapping = json.loads(MAP_PATH.read_text(encoding="utf-8"))

    failures: list[str] = []
    for number, labels in sorted(mapping.items(), key=lambda item: int(item[0])):
        result = subprocess.run(
            ["gh", "api", "-X", "POST", f"/repos/{repo}/issues/{number}/labels", "--input", "-"],
            input=json.dumps({"labels": labels}),
            text=True,
            capture_output=True,
        )
        if result.returncode:
            failures.append(number)
            print(f"error: #{number}: {result.stderr.strip()}", file=sys.stderr)
        else:
            print(f"#{number}: {', '.join(labels)}")

    if failures:
        print("failed to label: " + ", ".join(f"#{n}" for n in failures), file=sys.stderr)
        return 1
    print(f"labelled {len(mapping)} issues")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
