## Outcome
Not delivered. The run lasted 0.27 h (16 min) and was stopped by Michael at 13:10. Only 1 of 39 features passed (M1-01, the plan for migration 3, opus, 3 min, $1.44). Nothing was verified or merged, and tests stayed at 387. Cost was $7.07: init $5.63 (Fable, 0.18 h) and plan $1.44. The main reason is the manual stop. The log shows no failure: M1-02 through M8-03 (38 features) are all "not reached: run ended: stopped by Michael". I can't tell from the artifacts why Michael stopped it. The init session took 80% of the cost and 75% of the time for a feature list and brief, which is expensive for a run that stopped one session later.

## Non-passing features by cause
There are no "not done" features, so none of the causes in the list apply. All 38 non-passing features are "not reached" (M1-02…M8-03, 38 of them), counted under the stop. No session ran on any of them.

## Harness behaviour
- All guards were at 0: repairs, red_unpass, verify_failed, limit_waits, verify_escalations, merges. Nothing needed to fire, so there is nothing to judge.
- Verify: none ran (verified 0). I can't compare evidence rows with steps from this run.
- Possible waste: init cost $5.63 for 39 features across 8 milestones, and the plan session M1-01 took 3-4 min at $1.44. This is only a cost note. The one plan that ran did pass, so it was not wasted.
- Minor: `summary.json` records the stop as `end_reason` with no reason from Michael, so the retro can't separate a wanted stop from a surprise.
- Before this run, earlier retros in the ledger covered the failure patterns I could look for here, and none of them applies to this run. Other runs: rane-one-mixxx-2026-10-19 also ended "stopped by Michael" with 17 features not reached, and its retro may show a repeat. I did not read it.

## Proposed harness changes
1. **Make the stop reason recordable.** In the driver's stop handling, read an optional note from `INBOX.md` (e.g. a `## Stop reason` line) and write it into `harness-log.md`, `summary.json` and the ledger. Evidence: this run and rane-one-mixxx-2026-10-19 both ended "stopped by Michael" with no recorded reason. I found no earlier retro proposing it, but I did not read them in full.
2. **Cap or flag init cost.** In the init prompt/config, report the init session's cost and time in `summary.json` against the planned feature count, and warn if init is over about 50% of run cost. Evidence: $5.63 of $7.07 here. Other runs' init cost ($3.47–$6.51) is a similar order but a smaller share of cost. No earlier retro proposed it that I found.
3. **Retro for zero-failure early stops.** Give a stopped run with no "not done" features a shortened retro prompt. This retro had no causes to assign and gave little for the harness to learn from. Not proposed before that I know of.
