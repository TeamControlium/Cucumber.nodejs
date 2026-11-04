// Works around a whitespace-control bug in multiple-cucumber-html-reporter@4.5.0's
// "inline" attachment layout (templates/includes/scenario_card.liquid): the "+ Show Info"
// text box's <div>/{% for item in step.text %} loop isn't trimmed against its surrounding
// tags on either side:
// - `{% for item in step.text -%}` only trims *after* itself, so the raw newline +
//   source-indentation between the opening <div> and the loop leaks in as a literal blank
//   line + indent before the first log entry.
// - `{%- endfor %}` only trims *before* itself, so the same thing happens in reverse — the
//   newline + indentation between the loop and the closing </div> leaks in after the last
//   log entry.
// Every entry in between (joined inside the loop) is unaffected by either.
//
// Surgical fix: strip only the leading/trailing whitespace runs from each affected box's
// HTML, once, on load. Nothing else in these boxes has leading/trailing whitespace, so this
// can't eat real content — internal newlines within a single log entry (e.g. Controlium's
// own multi-line log messages) sit strictly between the first and last non-whitespace
// characters and are left untouched.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('div[id$="-text"]').forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/^\s+/, '').replace(/\s+$/, '');
  });
});

// h2/h3 and .font-medium text, 1.5x larger. Tailwind sets an absolute font-size directly on
// these elements (e.g. text-xl/text-2xl on an h2, whatever size class accompanies a given
// .font-medium usage) — a CSS override can only *replace* that value, never scale it, and
// `em` units resolve against the PARENT's font-size, not the element's own pre-override
// size, so they can't express "1.5x whatever this already is" either. Reading each
// element's actual rendered (responsive-breakpoint-aware) font-size and writing back 1.5x
// that, once, as an explicit inline px value is the only way to scale relative to each
// element's own original size rather than overwriting every one to the same fixed size.
//
// One combined selector, not two separate passes — an element matching more than one part
// (e.g. an h2 that also happens to carry .font-medium) still gets visited exactly once, so
// it scales by 1.5x total, never 1.5x applied twice over.
document.querySelectorAll('h2, h3, .font-medium').forEach((el) => {
  const currentSize = parseFloat(getComputedStyle(el).fontSize);
  el.style.fontSize = `${currentSize * 1.5}px`;
});

// Prefixes each scenario card's heading with its own Gherkin keyword ("Scenario: ",
// "Scenario Outline: ", "Background: " — whatever the test author actually wrote), on the
// feature-detail page. multiple-cucumber-html-reporter's own Scenario type (types.d.ts)
// never declares a `keyword` field, and no template ever reads `scenario.keyword` — but
// confirmed live (grepping the generated page's own embedded JSON) that the field survives
// anyway: generate-report.js builds its scenario objects by mutating the original parsed
// cucumber-js JSON in place (`scenario.duration = ...`, `scenario.passed = ...`, etc.),
// never reconstructing a stripped-down object, so `keyword` — present in cucumber-js's own
// JSON output for every scenario — is still sitting on the very same object feature.liquid
// embeds client-side as `const featureData = {{ data.featureSummary | json }}`.
//
// scenario_card.liquid never tags a card with its own data-index, so correlating DOM to
// data relies on document order matching array order — both come from the exact same
// single `{% for scenario in data.feature.elements %}` loop, so the Nth `.scenario-card`
// in the DOM is guaranteed to be featureData.elements[N]. `typeof featureData ===
// 'undefined'` guards index.html, which never declares this variable at all (it's local to
// feature.liquid's own embedded script) — referencing an undeclared bare identifier any
// other way would throw.
if (typeof featureData !== 'undefined' && Array.isArray(featureData.elements)) {
  document.querySelectorAll('.scenario-card').forEach((card, i) => {
    const keyword = featureData.elements[i]?.keyword;
    const heading = card.querySelector('h4');
    if (keyword && heading) heading.textContent = `${keyword}: ${heading.textContent}`;
  });
}

// Completes the DataTable column-resize story report-overrides.css starts (table.border-
// collapse's own rules). CSS alone can add a resize affordance via native `resize:
// horizontal`, and that was the first thing tried — but confirmed live, repeatedly, that
// Chromium's table-layout engine reconciles a resized cell against the table's overall
// width in surprising, undocumented ways once table-layout is 'fixed': growing one column
// could shrink an unrelated neighbour, and dragging past another column's min-width floor
// damped the rate to a fraction instead of just stopping. Not a timing/ordering bug to
// patch around — it's the browser's own internal compensation logic for resize-on-a-table-
// cell, which this package has no control over. The fix is to stop using native `resize`
// entirely and drive the drag by hand (below) — each handle then only ever touches its own
// <th>'s width, with no other column involved in the computation at all.
//
// `table-layout: fixed` is still needed first — it's what makes a column's width come
// solely from its own <th>, independent of every other cell, so our own hand-driven drag
// has something well-behaved to adjust. The only trick is ordering: a column's *rendered*
// width only reflects its content while still in the default 'auto' layout, so each <th>'s
// natural width has to be measured and frozen as an explicit inline px value *before*
// switching to 'fixed' — switch first and every column just starts at an even split of the
// table's width instead.
//
// Can't just do that once at DOMContentLoaded, though: every scenario's body starts with a
// `hidden` class (scenario_card.liquid's own toggle button — a plain inline `onclick`, not
// something this script can hook directly) until the test author expands it, so every
// DataTable is genuinely 0×0 at page load, every time, regardless of whether that scenario
// is ever opened at all — confirmed live (every <th> froze at literal "0px", and
// table-layout: fixed makes that permanent; there's no later recalculation to recover from
// once set).
//
// A ResizeObserver was tried next — conceptually the right tool (fire once a watched
// element's box actually gets a real size, independent of what caused that) — but confirmed
// live, repeatedly, not to fire at all in this environment, even observing document.body
// directly with the page genuinely visible/focused (document.hidden: false, hasFocus():
// true). Not something to ship unverified.
//
// Delegating on `click` instead: every scenario's own toggle is a plain inline `onclick`
// directly on its button (scenario_card.liquid), which runs synchronously at the target
// phase — by the time a *bubble*-phase click listener on `document` runs afterward, that
// toggle has already happened, so re-scanning for any now-visible, not-yet-frozen table on
// every click reliably catches the transition, however it happened, using nothing but a
// standard event that's guaranteed to fire. `data-width-frozen` marks a table done so a
// later manual resize drag (which also fires mousedown/click) never gets re-measured and
// stomped on. The bare call before the listener catches the (currently never-true, but
// cheap to cover) case of a table already visible before any click ever happens.
const MIN_COLUMN_WIDTH_PX = 40; // matches the old native-resize CSS's `min-width: 2.5rem`

// table-layout: fixed does NOT treat each <th>'s width as an absolute pixel value on its
// own — confirmed live, with a precisely controlled +50px synthetic drag: the dragged
// column only grew ~24px, its untouched neighbour shrank by the exact same ~24px, and the
// table's own rendered width stayed pinned at its pre-drag total throughout. Per the fixed-
// layout algorithm, a <th>'s width is only a *proportion* the browser redistributes actual
// column widths by, UNLESS the table's own width already equals the sum of its columns —
// only then does each column get exactly what it was given, nothing redistributed. Leaving
// `table.style.width = 'auto'` left that condition unmet (it still resolves against the
// container), so every drag reopened a mismatch for the browser to reconcile by scaling
// every column, not just the one dragged.
//
// Fix: keep the table's own width exactly equal to the sum of every column's width,
// updated atomically alongside the dragged column on every mousemove — never leaving a gap
// for the browser's own redistribution to kick in at all.
function makeColumnResizable(table, th) {
  const handle = document.createElement('span');
  handle.className = 'col-resize-handle';
  th.appendChild(handle);

  handle.addEventListener('mousedown', (mousedownEvent) => {
    mousedownEvent.preventDefault(); // avoid selecting header text while dragging
    const startX = mousedownEvent.clientX;
    const startWidth = th.getBoundingClientRect().width;
    // Every OTHER column's width, fixed for the duration of this drag — only the dragged
    // column's own share changes; every other column keeps exactly what it already had.
    const otherColumnsWidth = [...table.querySelectorAll('th')]
      .filter((otherTh) => otherTh !== th)
      .reduce((sum, otherTh) => sum + otherTh.getBoundingClientRect().width, 0);
    handle.classList.add('is-resizing');
    document.body.style.userSelect = 'none'; // stop the drag selecting surrounding page text

    const onMouseMove = (mousemoveEvent) => {
      const delta = mousemoveEvent.clientX - startX;
      const newWidth = Math.max(MIN_COLUMN_WIDTH_PX, startWidth + delta);
      th.style.width = `${newWidth}px`;
      table.style.width = `${otherColumnsWidth + newWidth}px`;
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      handle.classList.remove('is-resizing');
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function freezeVisibleDataTableColumns() {
  document.querySelectorAll('table.border-collapse:not([data-width-frozen])').forEach((table) => {
    if (table.getBoundingClientRect().width === 0) return; // still hidden — nothing to freeze yet
    table.dataset.widthFrozen = '';
    let totalWidth = 0;
    table.querySelectorAll('th').forEach((th) => {
      const width = th.getBoundingClientRect().width;
      th.style.width = `${width}px`;
      totalWidth += width;
      makeColumnResizable(table, th);
    });
    // Set explicitly to the sum of the column widths just frozen above, not 'auto' — see
    // makeColumnResizable's own doc comment for why leaving it 'auto' (resolved against the
    // container) reopens exactly the mismatch a later drag would have to fight.
    table.style.width = `${totalWidth}px`;
    table.style.tableLayout = 'fixed';
  });
}
freezeVisibleDataTableColumns();
document.addEventListener('click', freezeVisibleDataTableColumns);
