# Design review: PR 60, the page on a desk top

Reviewed against the branch at `scratchpad/wt/design-mix` (head d319ea4), served as a production build at http://localhost:4320/. Screenshots are in `shots/`, the raw measurements in `measure.json`, `measure2.json`, `measure3.json` and `measure4.json`, and the scripts that took them sit beside this file. Every number below was measured in headless Chromium at device scale 1, reduced motion on, with `monospace` resolving to DejaVu Sans Mono. Paint timings are from a software renderer, so they only mean something relative to each other.

## Verdict

The concept holds. Past 64rem the page reads as sheets laid on a desk, the cutting mat gives the demos one surface and one rhythm, the numerals in the margin give the four sheets an order, and the contributions really do sit on their rules: all 150 baselines land within 1px of a rule at 1440 in all four themes, and the row marks sit on the same middle as the writing. The four desks read as wood and not as filters, the paper fibre is quiet, and nothing of the desk leaks below 64rem beyond the gutter the owner asked for.

Three things hold it back. First, from 1680px the details zigzag: every drawing, bubble and title jumps 264px left or right as the card alternates sides, the Demos heading lines up with the even details only, and the folio stands still while everything beside it moves. Second, the joins are rougher than the parts: crossing 1024px the drawings shrink by 51px and the chain line lands on the mat's own edge, the name card carries an 86px blank band under its last line at every width, the sheet numeral sits 10px from the window's edge, and its 12px label wraps and falls under 3:1 on the wood. Third, the branch still carries its review rig (tuner, switches, review page, a second fibre tile), and the spec pins a dozen design values by copy, so most of the changes below trip a test that duplicates a token rather than reads it.

## Proposed changes, by impact

### 1. Put every title card on the same side

**Problem.** From 1680px each detail is offset by the card lane on its own side, so the seven stacks alternate. At 1728 detail A's stack spans 516 to 1476 and B's 252 to 1212; at 1920, 612 to 1572 against 348 to 1308: a 264px shift (12rem card plus 4.5rem gap, index.astro:167 and :170), not the 240 the PR body quotes. The bubbles and titles ride with the stacks, the Demos heading is 1224px wide and left-aligned with the even details only, and the 03 numeral is fixed. See `light-1920-mat.png`, `light-1728-folio.png`, `dark-2560-mat.png`. The PR body looked at centring the stacks and rejected it because a lane on both sides pushes the first card out to about 1960px. One side was not considered.

**Change.** All seven cards on the end side. In `src/pages/index.astro:42-93` set `cardSide="end"` on every `Callout` (or make `end` the default at `Callout.astro:28` and drop the prop). Delete the `[data-card='start']` rules at `Callout.astro:122-124`, `:138-140` and `:173-180`. Nothing else in the mat's arithmetic changes: the 105rem threshold, the lane and the 3rem margin stay. Update `e2e/design-mix.spec.ts:424` (alternating sides) to expect `end` throughout.

**Improves.** One left edge for the numeral, the Demos heading, the seven bubbles and the seven drawings; the cards become a column down the right; the eye moves down the mat instead of across it. **Trade-off.** The left and right alternation was a deliberate pick; a column of seven cards on one side is more uniform. **Effort.** Small.

### 2. Lift the torn sheets without a filter

**Problem.** `.sheet { filter: drop-shadow() drop-shadow() }` at `src/components/OpenSourceContributions/OpenSourceContributions.astro:119-123`. Two drop-shadows on a masked element re-rasterise the whole sheet (about 1,000px tall) whenever its height changes, which is every time a row's note opens. Measured at 1440, opening one row to the next paint, median of six:

| variant | ms |
| --- | --- |
| as is | 128 |
| one drop-shadow instead of two | 116 |
| no filter on `.sheet` | 83 |
| no veneer on `main` | 83 |

Scrolling a window's worth costs about 3ms a frame less without the filter (48 against 45). The veneer costs the same again but it is the design; the filter is replaceable.

**Change.** Give the lift to a box under the sheet, inset by the tear so it never shows past the jags:

```scss
.sheet {
  position: relative;
  isolation: isolate;          // so z-index -1 stays inside the sheet

  &::before {
    content: '';
    position: absolute;
    inset: var(--tear) 0;      // hoist --tear from the section to .sheet
    z-index: -1;
    border-radius: 0.25rem;
    box-shadow: var(--sheet-lift);
  }
}
```

and drop the `filter`. `--sheet-lift` is the shadow every other sheet on the desk already uses (`Layout.astro:304`), so one token then lifts everything.

**Improves.** Toggling a note goes from 128ms to about 83ms here, scrolling loses a filter pass, and the three torn sheets share the other sheets' shadow instead of a private one. **Trade-off.** The bottom tear loses a shadow that follows its jags. At a 0.9rem blur offset 0.5rem down that shadow is barely there today (`crop-light-1440-tear.png`: the top tear has no visible shadow at all, because the offset points down). **Effort.** Small.

### 3. Keep the mat edge to edge between 64rem and 80rem

**Problem.** The mat's inset, rim and 3rem margin all switch on at 64rem (`index.astro:217-220`, `Layout.astro:362`), but the desk has no slack there, so the mat's content box is narrower than the window was:

| width | mat | mat rim | first stack | chain line vs mat edge |
| --- | --- | --- | --- | --- |
| 1024 | 0 to 1024 | 39 | 944 wide | boundary at 16, mat edge at 0 |
| 1025 | 41 to 984 | 24 | 893 wide | boundary at 42, mat edge at 41 |
| 1088 | 44 to 1045 | 24 | 951 wide | boundary at 44.5, mat edge at 43.5 |
| 1279 | 51 to 1228 | 24 | 960 wide | boundary at 135, mat edge at 51 |

Crossing 1024 the drawings shrink 51px, and from 1025 to about 1100 the dash-dot boundary (drawn 1.5rem outside the column, `Callout.astro:58` and `:68`) runs 1px inside the mat's own border, so two lines sit side by side. `light-1100-mat.png` shows it: the chain line hugs the mat's inner edge on both sides. Nothing else opens at 64rem for the mat: no folio, no card, and the "3rem clear" rule only holds from about 1250px, where the mat's content box first reaches 1056px.

**Change.** Hold the below-64rem mat until the folio's width. In `index.astro:217` change `@media (width > 64rem)` to `@media (width >= 80rem)`, and in `Layout.astro:362` set `--mat-inset` only from 80rem too (leave it `0px` below). Between 64 and 80rem the mat then runs edge to edge with the 1024 rim and the 944px stack, exactly as at 1024, while the other bands are already sheets. At 80rem the mat's margin, its inset and the folio arrive together.

**Improves.** No 5% shrink of the drawings across 1024, no doubled line, and one fewer visual state (the one from 1025 to 1279 that has neither margin nor folio). **Trade-off.** From 1025 to 1279 the mat is the one band that reaches the window while the sheets have 40 to 50px of desk beside them. That is already how the page looks at 1024. **Effort.** Small. The existing 1024 and 1440 mat tests are unaffected.

### 4. Close the name card's blank band

**Problem.** The title block is 291px tall at every desk width, with 24px above the DWG line and 86px below the "Show Pronunciation Guide" line (measured in all four themes). The pronunciation player is laid out and hidden (`src/components/Name.astro:214-216`, 54px tall) so that asking for it does not push the page, and the block's padding sits under it as well. The PR body says the block is now 24px shorter and the name optically in the middle; what renders is writing in the top 70% of the card and a blank band the height of two lines under it. Every top screenshot shows it, for instance `light-1440-top.png`, `dark-2560-top.png`, `crop-light-1440-namecard.png`.

**Change.** Reserve the player's row only when it is asked for. Wrap the `<audio>` in a grid row that collapses:

```scss
.player {                       // new wrapper round the <audio>
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 250ms ease;
  > audio { min-height: 0; overflow: clip; visibility: hidden; }
}
.title-block:has(input:checked) .player {
  grid-template-rows: 1fr;
  > audio { visibility: visible; }
}
```

and drop the hover reveal at `Name.astro:230`, otherwise the card grows under a passing pointer. The checkbox stays the control, which is what the comment at `:228` already wants for keyboard users.

**Improves.** The first thing the eye lands on stops being a card that is a third empty; the block becomes about 235px tall with the writing centred. **Trade-off.** Opening the guide moves the sheets below by 54px. It only happens on request. **Effort.** Small.

### 5. The folio: edge, label, and which edge it hangs from

Three problems, three small changes, in one place.

**(a) The numeral touches the window.** With the webfont loaded the numeral's left edge is 9.8px from the window at 1440, 9.9px at 1728 and 1920, 4px at 1280, while its right side keeps 1.5rem to the paper (`Layout.astro:251-258`, `Folio.astro:60`). `light-1440-top.png`, `light-1728-top.png`. When the stencil fails to load the fallback (`Impact, Arial Black, system-ui`, `Layout.astro:204`) sets the two digits 148px wide in a 138px lane, so they overflow it and eat 10px of the gap to the paper (measured at 1920 in the first pass, before the retake).

Change: give the lane a gap on both sides. `Layout.astro:253` becomes `calc((var(--folio-lane) - 2 * var(--folio-gap)) / 1.15)`, `:258` becomes `calc(7.5rem * 1.15 + 2 * var(--folio-gap))`, and `Folio.astro:60` becomes `padding-inline: var(--folio-gap)`. At 1440 the numeral is then 97px instead of 118 and reaches 120px from about 1490px. Below about 1330px the lane no longer holds a 3rem numeral, so the 80rem queries at `Layout.astro:255` and `Folio.astro:42` move to 84rem; at 1344 the numeral starts at 56px.

**(b) The label is too small and too faint for where it is.** 12px Special Elite at 45% ink (`Folio.astro:50`, `:71`) on the veneer measures, from the rendered pixels at 1440:

| theme | desk L range | label contrast |
| --- | --- | --- |
| light | 0.55 to 0.65 | 3.1 to 3.3 |
| arctic | 0.57 to 0.65 | 2.8 to 3.0 |
| dark | 0.005 to 0.019 | 4.7 to 5.1 |
| forest | 0.006 to 0.018 | 4.5 to 4.9 |

and from 1280 to about 1400 it wraps to two lines in a 60px lane under a 49px numeral (`crop-light-1280-folio.png`: "Hugo / Sales"). It is decoration and hidden from assistive tech, but it is written text, so it should be readable or absent.

Change: move the 45% to `.folio-number` only, set `.folio-label { font-size: 0.8125rem; color: color-mix(in oklch, var(--ink), transparent 20%); }` (about 4.9:1 on the light and arctic desks), and show the label only from 90rem, where the numeral is full size and the lane wide enough for "Bill of materials" on one line.

**(c) The numeral hangs off the mat, not off its own sheet.** `--desk-edge` is the mat's edge (`Layout.astro:270`, `Folio.astro:48`), so the gap between a numeral and the paper it numbers is:

| width | 01 name card | 02 bill | 03 mat | 04 open source |
| --- | --- | --- | --- | --- |
| 1440 | 248 | 92 | 16 | 91 |
| 1920 | 476 | 332 | 14 | 332 |
| 2560 | 478 | 334 | 14 | 334 |

At 1920 and above three of the four numerals float a third of the way across bare desk from their sheet (`light-1920-top.png`, `dark-2560-top.png`). The PR's own rule is that the number hangs off the paper.

Change, owner's call: for the three content-width rows place the rail against the content column instead of the desk edge. The rail is an absolutely positioned grid child of its row spanning `full-width-start / content-start`, so `inset-inline-start: auto; inset-inline-end: 0` puts its right edge on the sheet's left edge; keep the `--desk-edge` formula for the mat's row (a `lane="paper" | "mat"` prop on `Folio`). Every numeral then keeps 1.5rem to its sheet. Trade-off: 03 stands 80px (1440) to 320px (2560) left of 01, 02 and 04, so the four stop being one column. That is the honest consequence of a 960px sheet beside a 1600px mat; the alternative is the floating shown above.

**Effort.** Small for all three. `e2e/design-mix.spec.ts:543` (FOLIO_FROM) and the 1264px "no folio" case follow the new start width.

### 6. Repository names still break inside a word

**Problem.** `ContributionRow.astro:44-49` and `:66` add `<wbr>` after each owner and before the issue number so a name breaks there, but the hyphens keep their own break opportunities and `overflow-wrap: break-word` (`:155`) allows any. At 1440, 15 of 69 repositories wrap; 6 break before the number as designed and 9 break at a hyphen inside a word: `bootstrap-vue-next/bootstrap-vue-` / `next#2040` (four times), `software-mansion/react-native-` / `reanimated#1666`, `cheapestinference/claude-auto-` / `retry#82`, `th3rdwave/react-native-safe-area-` / `context#173`, `react-native-community/react-` / `native-template-typescript#179`. `light-1440-contrib.png`, rows 3, 12, 13 and 19; `crop-light-1440-rows.png`.

**Change.** Make the declared breaks the only ones:

```astro
<cite>{citePieces.map((piece) => (piece === null ? <wbr /> : <span class="piece">{piece}</span>))}</cite>
```

```scss
cite .piece { white-space: nowrap; }
```

and remove `overflow-wrap: break-word` from `cite`. Verified in the served page: still 15 wrapped repositories and 32 two-line rows, none overflowing its column, and every break after a slash or before a `#`. The longest single piece, `react-native-template-typescript` at 32 characters, is 269px in a 288px column.

**Effort.** Small.

### 7. Link underlines double the rule

**Problem.** A title link is underlined in ink 0.15em (2.1px) below the baseline (`ContributionRow.astro:179-180`); the rule sits 1px below the baseline at 14% ink. So under every title there is a 2px dark bar where every other cell shows a faint rule, and the "one rule under every line" reading breaks at each link. `crop-light-1440-rows.png`: the rule under "Fix wrong handling of combinators" is heavy, under "withastro/compiler-rs#61" faint.

**Change.** Draw the link's underline on the rule and in the accent, dotted, the way the name card's links are already set (`Name.astro:130-132`):

```scss
.title-text {
  text-decoration: underline dotted var(--accent-muted);
  text-underline-offset: 0.07em;   // about 1px: on the rule, not under it
  text-decoration-thickness: 1px;
}
```

A link is then written on an accent-dotted rule, and the external-link glyph stays as the second cue. Check the offset with the spec's baseline probe once, since underline placement is rounded per engine.

**Improves.** Rules stay one weight down the sheet; links keep an affordance that is not colour alone. **Trade-off.** On the dark themes the dotted accent is brighter than the rule; that is the point. **Effort.** Small.

### 8. Small labels: two contrast failures and one weight

**Problem.** Measured against the surface they sit on (resolved `light-dark()` and `color-mix()` values, not the desk):

| text | size | light | arctic | dark | forest |
| --- | --- | --- | --- | --- | --- |
| Japanese labels (`[lang=ja]`, ink-faint at 80%) on the mat | 11px | 4.4 | 3.85 | 4.62 | 4.54 |
| title card `dt` (ink-faint on the sunken cell) | 10px | 4.69 | 3.99 | 4.98 | 5.03 |
| open source ja label on paper | 11px | 4.58 | 3.74 | 5.22 | 3.57 |

Arctic fails AA on all three and forest on the third; the rest scrape by. The ja labels are content (`<small lang="ja">`, not `aria-hidden`), and the audit's clean axe run does not cover them: axe skips contrast where a background image lies under the text, which the mat's rulings and the fibre are. `Callout.astro:299-306` copies the 80% mix from `index.astro:232-239` and `OpenSourceContributions.astro:103-110`. Separately, "DETAIL A   SCALE 3:1" renders at weight 700 (it inherits the h3's bold, `Callout.astro:277-284`) while the "SH-DEMOS / REV A" stamp it copies is 400; visible in `light-1440-mat.png`.

**Change.** Drop the `transparent 20%` at `index.astro:237`, `Callout.astro:305`, `OpenSourceContributions.astro:108` and `SectionHeader.astro:45`: the labels sit at `--ink-faint`, which is 7.2 (light) and 5.98 (arctic) on the mat. `TitleCard.astro:75`: `color: var(--ink-muted)`, which is 8.1 and 6.65 on the cell and matches the drawing's own title block, whose labels are in `--ink`. `Callout.astro:277`: `font-weight: 400`. **Effort.** Small.

### 9. Before it lands: the review rig and the spec's copies

**Problem.** Review-only code that ships in the build today:

| what | where | in the built page |
| --- | --- | --- |
| `?theme`, `?tile`, `?grain` switches | `Layout.astro:80-128` | 1,513 B inline script |
| PaperTuner import and element | `Layout.astro:3-4`, `:133`, `src/components/PaperTuner.astro` (442 lines) | 2,991 B markup + 10,616 B script |
| review page | `src/pages/review.astro` (217 lines) | `dist/client/review/index.html`, noindex, deploys |
| second fibre tile | `public/paper-fibre-lifted.webp` | 21.6 KB, only reachable by `?tile=lifted` |
| `--theme-paper-tile`, `--theme-paper-filter` indirections | `src/scss/_colors.scss:229`, `:233` | exist only for the switches |

Two of these are more than weight. `?theme=` writes the visitor's stored theme (`Layout.astro:95-103`), so a shared link with `?theme=dark` changes what every later visit shows. And both the tuner and the review page read `ThemePicker.astro` as raw text and regex the numbers out of it (`PaperTuner.astro:14-27`, `review.astro:11-30`): a build-time dependency on the source's formatting.

**Change.** Delete the five rows above. Keep `scripts/cut-paper-tile.mjs` (provenance) and `public/_headers`. Replace `var(--theme-paper-tile, url('/paper-fibre.webp'))` with the url.

Then the spec. `e2e/design-mix.spec.ts` pins by copy: `DESKS` (:12-17) and `WOODS` (:20-25) restate ThemePicker's `desk`, `deskWood` and `deskBase`; `TILE = 720` (:9, :96) restates `Layout.astro:320`; `CARDS_FROM` (:391) restates `index.astro:222`; `FOLIO_FROM` (:543) restates `Layout.astro:255`; the 48px margin (:699-702) restates `index.astro:219`; `'normal, overlay'` (:95) restates `Layout.astro:321`; the alternation (:424) restates the `cardSide` props; the one-line ratio (:801) passes at 0.54 here (37 of 69 on DejaVu Sans Mono; the PR counted 42) with a floor of 0.5. Every change in this list trips at least one of them, not because the design broke but because a number is written twice. Move `THEMES` to `src/themes.ts` and import it in `ThemePicker.astro` and the spec; put the three breakpoints in one SCSS partial (`$desk: 64rem` is written in `Layout.astro:355`, `index.astro:134`, `:217` and `OpenSourceContributions.astro:80`; `$folio: 80rem` in `Layout.astro:255`, `Callout.astro:70`, `Folio.astro:42`). Two smaller duplicates: `var(--card-gap, 3rem)` at `Callout.astro:139`, `:143`, `:154` carries a fallback that disagrees with the real 4.5rem (`index.astro:170`); and the `10rem` at `Layout.astro:257` is the mat's per-side allowance (3rem margin + 1.5rem rim + a 0.5rem that nothing names) written by hand, so a change to the margin at `index.astro:219` silently desynchronises the folio lane.

**Effort.** Medium, mostly deletion.

### 10. Arctic's desk renders warm

**Problem.** The token asks for `oklch(0.81 0.013 232)` (`ThemePicker.astro:104`), the PR body for "still cool, bleached wood". The rendered desk, averaged over a bare strip at 1440:

| theme | token | rendered |
| --- | --- | --- |
| light | L 0.76, C 0.05, h 68 | L 0.85, C 0.062, h 76 |
| arctic | L 0.81, C 0.013, h 232 | L 0.85, C 0.013, h 60 |
| dark | L 0.235, C 0.01, h 55 | L 0.227, C 0.01, h 57 |
| forest | L 0.225, C 0.03, h 75 | L 0.228, C 0.03, h 75 |

Light and arctic come out at the same lightness and within 16 degrees of hue: the oak's own colour comes through an 85% overlay and the veil cannot cool it. `arctic-1440-top.png` beside `light-1440-top.png`. So the four desks are two pairs, a tan pair and a near-black pair (dark and forest sit at L 0.227 and 0.228 and differ only in chroma).

**Change.** Give arctic a scan with no colour of its own so the token's hue is what shows: `sharp('oak-7760.webp').modulate({ saturation: 0.15 })` to `oak-7760-grey.webp`, same size and bytes, and `deskWood: 'oak-7760-grey'` at `ThemePicker.astro:107`. With a neutral tile the overlay keeps hue 232. At C 0.013 the hue is faint; 0.02 would read cool. If greige is what is intended, skip this. Either way, the table above says the tokens are not what is on screen (light renders a step lighter than asked), so tuning by token is blind; record rendered values next to the tokens in the PR's per-theme table. **Effort.** Small.

### 11. The veneer repeats every 720px down the desk

**Problem.** `background-size: 45rem` (`Layout.astro:320`) lays a 1440px scan at half size, so the desk repeats every 720px down the page: on an 11,178px page, 15 identical tiles per margin. Measured on the right margin of the full-page shots, the autocorrelation of row brightness is 0.996 at a lag of 720 and under 0.2 at every other lag, in all four themes, and 99 to 100% of sampled pixels are identical at y and y + 720. The dark scan's figure makes it legible: `crop-dark-1920-tile-repeat.png` and `crop-light-2560-tile-repeat.png` put two consecutive tiles side by side. On a 1x screen the grain is also at half scale (native only at 2x).

**Change.** `background-size: auto, 90rem 90rem`: the repeat halves to 7 or 8 per page and the grain is life-size at 1x. Update `TILE` in `e2e/design-mix.spec.ts:9` to 1440 (the 2560 seam test derives its edges from it). **Trade-off.** On 2x screens the scan is upsampled. CSS has no mirrored repeat, and a pre-mirrored two-up tile doubles the bytes, so this is the cheap option. **Effort.** Small.

### 12. What a phone downloads for a 14px strip of wood

**Problem.** At 390 the light theme fetches `oak-7760-limed.webp` (202,014 B) to show wood in a 14px gutter and 40px bands between sheets (`crop-light-390-gutter.png`); dark fetches 155,526 B, forest 125,336 B. That is the largest single asset the page loads on a phone and it paints a few thousand pixels. The Allerta Stencil stylesheet (`Layout.astro:55-60`) is requested at every width for a numeral that exists from 80rem; it is 2 KB, so this is minor.

**Change.** A quarter-size cut per theme, 720px square from the same scan (the `sharp` pipeline in `scripts/cut-paper-tile.mjs` is the pattern), roughly a quarter of the bytes each, chosen below the desk width:

```scss
@media (width <= 64rem) { main { --theme-desk-tile: url('/desk/oak-7760-limed-720.webp'); } }
```

at the same `45rem` size, so the grain scale is unchanged at 1x and only softer on a 2x phone, where the strip is 28 device pixels wide. Add `/desk/*` to `public/_headers` with the week's cache the fibre already has (`:1-2`). **Effort.** Small to medium (four files).

### 13. The card copy is unreachable below 105rem

**Problem.** The seven cards carry 32 to 48 words each and are `display: none` below 1680px (`Callout.astro:133`, `index.astro:222-225`), which the spec requires at 1664, 1440, 1280 and 390 (`e2e/design-mix.spec.ts:465-483`). Medium and year are also on the sheet's title block; the notes sentence exists nowhere else. On a laptop or a phone, sighted or not, it is not there.

**Change.** Owner's call. Below 105rem render the card as a strip under the callout label rather than hiding it: `.callout-card { position: static; width: auto; display: block; }` with the `dl` as one row (title cell hidden, since the h3 says it; medium and year inline; notes as one 12px line). About 3rem per detail. Or, cheaper, move the notes sentence into each drawing's own note so the content exists once and the card is only a second display of it at wide widths. **Trade-off.** "Never under the view" was chosen for the desk case, where the card would have crowded the drawing; a strip under the label at narrow widths is a different thing. **Effort.** Medium.

### 14. The detail's heading outranks its sheets

**Problem.** The measured outline is h2 "Demos", h3 "Detail A Loading logo", then h2 "Visrez Animated Loading Logo", h2 "Original Logo" and so on: each drawing page's title is an h2 (`TechnicalDrawing/Page.astro:109-110`) inside a section labelled by an h3 (`Callout.astro:31`). A headings list reads the sheets as outranking the detail they belong to.

**Change.** Demote the page titles to h3 and their subtitles to h4, or promote the callout's heading to h2 (cheaper, and the sheets' h2s are then siblings inside it, which is no worse than main). At least five spec files select `h2.typewriter` (`e2e/home.spec.ts:18-24`, `annotations-position`, `note-fold-tab`, `tagging-tool`, `title-block-overflow`), so the first option is a medium change. **Effort.** Medium.

### 15. The ruled pitch on a phone

**Problem.** At 390 the pitch is 36px (`OpenSourceContributions.astro:339-340`, chosen for a thumb) and 57 of 69 rows are three rules or taller because the repository sits over a title that wraps; a row averages about 3.3 rules, or 120px, and the three sheets take roughly 8,000 of the page's 16,428px. A wrapped title is already a 72 to 108px target; the pitch is not what makes it comfortable.

**Change.** `--rule-pitch: 1.75rem` at 34rem and below (28px, still a line height of 2 on the 14px face, above the 24px target minimum). About 1,800px off the phone page. **Trade-off.** Rules 28px apart rather than 36. **Effort.** Small.

## Checked and found fine

- Baselines: 150 of 150 within 1px of a rule at 1440 in all four themes (`text-box-trim` supported); at 390 every row and group name too. The column heads are hidden at 390 so their offsets do not apply.
- The marks sit level with the repository's capitals (`crop-light-1440-rows.png`); the open note and the hover wash keep every row under them on a rule (`light-1440-row-open.png`, `dark-1440-row-open.png`). I re-ran the baseline probe myself; the marks and the letter centring I checked by eye against the crops, not by re-running the spec.
- No horizontal scroll at 390, 1024, 1100, 1280, 1440, 1728, 1920 or 2560 in any theme.
- Phone: no folio, no card, the mat edge to edge with a 12.6px rim; the wood is a 14px strip and 40px bands, nothing more (`light-390-*.png`, `crop-light-390-gutter.png`). Tears read as tears at 1rem (`crop-light-390-tear.png`).
- Folios are `aria-hidden`, hold no links, and 03 is stuck 24px down the screen 400px into the demos.
- Card leaders end on the boundary within 2px; the letters sit centred in their circles (`crop-light-1440-bubble.png`).
- Focus: the row's summary takes a 2px accent outline inset across the whole row, the title link a 2px accent outline offset 2px; both visible on light and dark (`light-1440-focus-summary.png`, `light-1440-focus-link.png`, `dark-1440-focus-summary.png`).
- One veneer per theme is fetched, not four: limed 202 KB (light), mid 156 KB (dark), plain 188 KB (arctic), smoked 125 KB (forest). One fibre tile, 21.6 KB, lossless, and no lattice visible on the sheets at 1x (`crop-light-1440-fibre-sheet.png`).
- Blend cost: `overlay` against `normal` on the desk measured the same scroll cost; the veneer as a whole costs about 8ms a frame here. No new `backdrop-filter`; the only new mask is the tears, which cost about 2ms a frame.
- Mat rulings against the mat are 1.07 and 1.16 on light, 1.09 and 1.21 on dark: faint by design, and the chain line is 5 to 6.8:1 on every theme. Sheet edges (`--line`) are 2.1 to 3.4:1 on their paper.
- Type on the mat and cards, apart from item 8: callout titles 28px at 7.1 to 15:1, card values 13px at 8.4 to 10:1, notes 12px at 6.7 to 8.1:1, stamps 10px at 6.7 to 8.2:1, group names and rows on the ruled paper 7.4 to 16:1.
- Nothing new animates, so reduced motion has nothing to switch off; the folio is `position: sticky`, not scripted.
- The peel hint's contrast could not be measured here: it is transparent until the reader scrolls it into view.

A note on the screenshots: this sandbox's TLS proxy made Google Fonts intermittent, so first-pass shots where a face failed were retaken after checking that Special Elite, Poppins and Permanent Marker had loaded. `arctic-390-top.png` and `arctic-390-contrib.png` still show the fallback monospace after four retries. The type measurements come from computed style and do not depend on which face painted.

## Screenshots

All in `shots/`. Viewport shots are 900px tall (1200 at 2560). `top` is the name card and bill of materials; `mat` is scrolled to detail A with its bubble and, from 1728, its card; `folio` is 400px into the demos with the 03 numeral stuck; `contrib` is the first ruled sheet; `full` is the whole page.

| file | shows |
| --- | --- |
| `light-390-{top,mat,folio,contrib,full}.png` | the phone: gutter wood, edge-to-edge mat, torn sheets at the 2.25rem pitch |
| `light-1024-{top,mat,folio,contrib,full}.png` | just under the desk threshold: full-bleed mat, 944px stacks |
| `light-1100-{top,mat,folio,contrib,full}.png` | the 64 to 80rem state: 24px rim, chain line on the mat's edge, no folio (item 3) |
| `light-1280-{top,mat,folio,contrib,full}.png` | folio on at 49px, label wrapped, no cards (item 5) |
| `light-1440-{top,mat,folio,contrib,full}.png` | the reference width: 118px numeral 10px from the edge, 1120px mat, name card's blank band (items 4, 5, 6, 7) |
| `light-1728-{top,mat,folio,contrib,full}.png` | cards on, first alternation, heading aligned with B (item 1) |
| `light-1920-{top,mat,folio,contrib,full}.png` | the zigzag and the 332 to 476px folio gaps (items 1, 5c) |
| `light-2560-{top,mat,folio,contrib,full}.png` | the 100rem mat cap, folio hanging off the mat, 480px of desk between 01 and its sheet |
| `dark-{1024,1280,1728}-mat.png`, `dark-1280-top.png` | the dark mat and cards at the narrow desk widths |
| `dark-{1440,1920}-{top,mat,folio,contrib,full}.png`, `dark-2560-{top,mat,contrib}.png` | the dark desk, blueprint mat, dark paper and rules |
| `dark-390-{top,contrib}.png` | dark phone |
| `arctic-*` (same set as dark) | the arctic desk beside the light one (item 10); `arctic-390-*` are fallback-face |
| `dark-forest-*` (same set as dark) | the smoked desk and green paper |
| `light-1440-focus-summary.png`, `light-1440-focus-link.png`, `dark-1440-focus-summary.png` | keyboard focus on a row and on a title link |
| `light-1440-hover-row.png`, `light-1440-row-open.png`, `dark-1440-row-open.png` | the hover wash and an open note on the rules |
| `crop-light-1280-folio.png`, `crop-{dark,arctic,dark-forest}-1280-folio.png` | the 49px numeral and its wrapped label at 4x |
| `crop-light-1440-namecard.png` | the title block with its blank band (item 4) |
| `crop-light-1440-rows.png` | underlines on the rules and a mid-word repository break at 2x (items 6, 7) |
| `crop-light-1440-tear.png`, `crop-light-390-tear.png` | the torn edge and its fibre fade at 2x and 3x |
| `crop-light-1440-bubble.png` | the A bubble, leader and dot at 3x |
| `crop-light-1920-card.png`, `crop-light-1728-card-lane.png` | a title card, its leader and arrowhead |
| `crop-light-2560-tile-repeat.png`, `crop-dark-1920-tile-repeat.png` | two consecutive 720px tiles of the margin side by side (item 11) |
| `crop-light-2560-margin.png` | the left margin over three tiles |
| `crop-{light,dark}-1440-fibre-sheet.png`, `crop-{light,dark}-1440-fibre-contrib.png` | the paper fibre at 3x, nearest-neighbour |
| `crop-light-390-gutter.png` | the 14px gutter and a 40px gap at 8x (item 12) |
| `crop-light-1024-callout-title.png`, `crop-light-1440-callout-title.png` | the callout title at the two widths |
