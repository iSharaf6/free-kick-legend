# Animation implementation order

| Plan | Title | Severity | Status |
| --- | --- | --- | --- |
| 001 | Move match feedback off the goal and add authored character motion | HIGH | DONE |
| 002 | Synchronise the striker and ball at contact | HIGH | DONE |
| 003 | Author keeper and crowd reactions | HIGH | DONE |

Execute `002` before `003`: the keeper must not begin its read until the ball impulse is applied on the striker contact frame. `001` is already complete.
