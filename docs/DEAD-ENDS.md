# Dead ends

Approaches tried and dropped, with the numbers. Read before starting perf or layout work. Add a line when you drop one: date, branch, one sentence on what, one on why, where the patch or probe lives. Retry only with a specific reason the shortcoming no longer applies.

- 2026-09-27, annotation-anchor: CSS anchor positioning for the callouts instead of the measuring script. Layout cost 25 to 50% more than main on resize and page turn; only dropping the insets that place the callouts got back to main. An `anchor-name` inside a sheet also stops Blink treating the section as a layout boundary. Patch in the session scratchpad, annotation-anchor/wip-on-4c6b362c.patch.
- 2026-09-27, led-pulse-paint: moving the demo LED pulse to compositor-only properties. It already animates opacity alone and costs 0 style, layout or paint passes in isolation; the audit's LED figure was the dog-ear before #182. Nothing to change.
