/**
 * quote.js
 * Builds and opens the quote summary modal.
 */

function openQuoteModal() {
  const body = document.getElementById('modalBody');
  body.innerHTML = buildQuoteHTML();
  document.getElementById('quoteTotal').textContent = fmt(calcTotal(state));

  // Show customer name in header if captured
  const subtitle = document.getElementById('quoteSubtitle');
  subtitle.textContent = leadInfo.name
    ? `Prepared for ${leadInfo.name} · Indicative pricing · subject to site survey`
    : 'Indicative pricing · subject to site survey and final specification';

  document.getElementById('modal').classList.add('open');
}

function closeQuoteModal() {
  document.getElementById('modal').classList.remove('open');
}

// ─── LINE ITEM RENDERING ───────────────────────────────────────────────────────

function qLine(label, cost, isSubItem = false) {
  const priceStr = typeof cost === 'number' ? fmt(cost) : cost;
  const cls = isSubItem ? 'q-line sub' : 'q-line';
  return `<div class="${cls}"><span>${label}</span><span>${priceStr}</span></div>`;
}

function qSection(title, lines) {
  if (!lines.length) return '';
  const rows = lines.map(l => qLine(l.label, l.cost, l.sub)).join('');
  return `
    <div class="q-section">
      <div class="q-section-title">${title}</div>
      ${rows}
    </div>`;
}

// ─── QUOTE BUILDER ─────────────────────────────────────────────────────────────

function buildQuoteHTML() {
  const found  = calcFoundation(state);
  const door   = calcDoor(state);
  const reinf  = calcReinforcement(state);
  const elec   = calcElectrical(state);
  const lights = calcLighting(state);
  const deck   = calcDecking(state);

  const roofStyleAddon  = ROOF_STYLE[state.roof]?.addon    ?? 0;
  const roofFinishAddon = ROOF_FINISH[state.roofFinish]?.addon ?? 0;
  const claddingAddon   = CLADDING[state.cladding]?.addon  ?? 0;

  // Windows: sum per opening by its own style
  const windows = state.openings.filter(o => o.type === 'window');
  const windowAddon = windows.reduce((sum, op) => sum + (WINDOW_STYLE[op.style]?.addon ?? 0), 0);

  // ── Foundation ──────────────────────────────────────────────────────────────
  const foundLines = [{ label: found.detail, cost: found.total }];
  if (found.extraArea > 0) {
    foundLines.push({ label: `Extra area: ${found.extraArea}m² × £${found.extraPerSqm}/m²`, cost: found.extraCost, sub: true });
  }

  // ── Structure ───────────────────────────────────────────────────────────────
  const structLines = [
    { label: ROOF_STYLE[state.roof]?.label,    cost: roofStyleAddon  || 'Included' },
    { label: ROOF_FINISH[state.roofFinish]?.label, cost: roofFinishAddon || 'Included' },
    { label: CLADDING[state.cladding]?.label,  cost: claddingAddon   || 'Included' },
    { label: `Windows (${windows.length} placed)`, cost: windowAddon || 'Included' },
  ];
  if (state.extras.lantern) {
    structLines.push({ label: 'Roof Lantern', cost: ROOF_LANTERN });
  }

  // ── Door ────────────────────────────────────────────────────────────────────
  const doorLabel = door.notes.length
    ? `${door.label} (${door.notes.join(', ')})`
    : door.label;
  const doorLines = [{ label: doorLabel, cost: door.total }];

  // ── Build sections HTML ─────────────────────────────────────────────────────
  let html = '';
  html += qSection('Foundation',               foundLines);
  html += qSection('Structure & Roof',          structLines);
  html += qSection('Doors',                     doorLines);
  html += qSection('Structural Reinforcement',  reinf.lines);
  html += qSection('Electrical & Heating',      elec.lines);
  html += qSection('Lighting',                  lights.lines);
  html += qSection('Decking',                   deck.lines);

  // ── Exclusions & notes ──────────────────────────────────────────────────────
  html += `
    <div class="q-section">
      <div class="q-section-title">Exclusions</div>
      <div class="excl-box">
        <strong>Not included in this estimate:</strong> mains water connection, waste connection,
        external electrical supply, groundworks beyond base preparation, plumbing external to building.
        <br><br>
        <em>All prices are indicative and subject to site survey and final specification.</em>
      </div>
      <div class="var-box">
        <strong>Variations:</strong> A signed variation form is required for any changes after order.
        No amendments are carried out until approved in writing. Variations may affect price and lead time.
      </div>
    </div>`;

  return html;
}
