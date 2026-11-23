# Run a single task

Read `AGENTS.md`, `MEMORY.md`, `PLAN.md` and `TASKS.md` in full, then the doc sections the task's phase prompt names. Follow the clean-room rule in `AGENTS.md`. Read current docs for any third-party API before coding.

**Task:** {{TASK_ID}} from `TASKS.md`.

Before coding, state in 3 to 5 lines what you will change, which files, and how you will prove *Done when*. Then implement, verify (lint, typecheck, unit, Rust tests if touched, relevant e2e, screenshot for UI), update `TASKS.md` and `MEMORY.md`, and open one PR named `{{TASK_ID}}: <summary>` on branch `tf/{{TASK_ID}}-<slug>`. End with a short report: result, evidence, follow-ups.
