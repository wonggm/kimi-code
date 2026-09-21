# Web tool cards, upstream sync (opened 2026-09-21)

The user asked for the transcript's tool cards to match upstream: the expanded style, the behaviour
of expanding and clicking each card, and which cards open the right panel.

## Method

The upstream bundle and the fork build are both served against the same mock, so the two can be
driven identically:

```
MOCK_ROOT=.tmp/upstream-web MOCK_PORT=5399 node apps/kimi-web/webdiff/mock-server.mjs
MOCK_ROOT=apps/kimi-web/dist MOCK_PORT=5400 node apps/kimi-web/webdiff/mock-server.mjs
```

`.tmp/wd0433/toolcard-walk.mjs <app port> <label> <out dir>` then, for every `.tool-line` in the
run: scroll it into view, screenshot it clipped to its own box, click its head, screenshot again,
click the first clickable in its body, and record on both sides of each click whether the right
panel changed width or gained a tab. Evidence lands in `.tmp/wd0433/toolcards/<app>/` as
`NN-collapsed.png`, `NN-expanded.png`, `NN-collapsed.html`, `NN-expanded.html` and `cards.json`.

`CHROME_BIN` must be set by hand (see the skill's step 0b).

## Which cards open the right panel

| Card | Upstream head | Upstream body | Fork head (before) | Fork body (before) |
|---|---|---|---|---|
| Read, Run, Search, Todo, the two goal cards, the four browser cards | no | no | no | no |
| Edit | no | yes, opens `config.py` | **yes, opened `config.py`** | yes, opened a second `config.py` |
| Agent | no | yes, opens a tab titled with the prompt | no | no |

So upstream's Edit card expands on a head click and opens the file preview only from the body's
file link. The fork opened the panel from the head click and then duplicated the tab from the body.

## Fixed

1. **Edit card opened the panel on expand.** `ConversationPane.vue` passed `:tool-diff-panel="true"`
   to the main transcript's `ChatPane`, and `EditTool.toggle()` emits `openToolDiff` whenever that
   prop is set, so the head click opened the diff instead of expanding and `canExpand` was false.
   The main transcript now passes `false`. Verified: the fork's Edit card reads
   head → no panel, body → one `config.py` tab, matching upstream.
2. **A status glyph on every row.** `ToolRow.vue` rendered `span.tl-status` unconditionally, with
   `ok`/`err`/`run` class names and a check icon for `ok`. Upstream's bundle guards it with
   `status !== "ok"` and names the class after the status (`error`, `cancelled`). The fork now
   matches: the span appears only when the status is not `ok`, carries the status name as its
   class, and the CSS keeps the base rule plus `.tl-status.error`.

After both, the expanded structure of the Search card and the two goal cards is byte-identical to
upstream, and the glyph difference is gone from all thirteen.

## Still open

Measured from the same walk, in descending size:

1. **Browser cards (4 of 13).** Upstream renders `div.btd`, `div.btd-stack`, `div.bfold`,
   `button.bfold-head`, `div.tp-body`; the fork renders its own `div.browser-tool-details` and
   `button.bt-open`. This is the browser surface the 2e605b10b round skipped, so it is out of scope
   unless the user re-opens that decision.
2. **Edit card body.** Upstream's opened diff is `div.hl-body` / `div.hl-code` / `div.hl-row.row-add`
   / `div.hl-row.row-del`; the fork renders `span.ed-head` and its own diff body.
3. **Agent card.** Upstream's card is `button.ag-card.clickable`; the fork renders `div.ag-card`
   because `canOpenAgent` is false when the tool call's task id does not resolve. Upstream reads the
   agent id off the tool frame (`agent_id` / `agentRefs`), which the fork's `ToolCall` does not
   carry. Same root cause as the allowlisted `BUTTON.ag-card.clickable` entry from the 0.43.1 round.
4. **Todo card.** The fork adds `button.ui-icon-button.ui-icon-button--sm` and
   `span.kw-dot.kw-dot--idle`; upstream draws a plain `g` where the fork draws an icon.
5. **Read and Run cards.** The fork adds `button.path-link` (Read) and `div.cmd-echo` (Run).

Verification after the two fixes: `vue-tsc` clean, `check:style` 31 findings in baseline mode
(no new ones), kimi-web vitest 1064/1064.
