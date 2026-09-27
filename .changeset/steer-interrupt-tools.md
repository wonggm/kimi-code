---
"@moonshot-ai/agent-core-v2": major
"@moonshot-ai/kimi-web": patch
---

Steering can now interrupt running work, behind the `steer_interrupt` experimental flag (off by default, switchable from Settings → Lab in kimi-web).

A tool call can declare `cuttableOnSteer`. When the flag is on and a message is steered into a live turn, those calls are aborted, calls the scheduler has not started yet are skipped with a placeholder result, and the steered text reaches the model wrapped in a priority notice. Hook results gain a `deliverAs` field (`steer`, `notify` or `nextTurn`), and `IAgentLoopService` gains `injectSteer`.
