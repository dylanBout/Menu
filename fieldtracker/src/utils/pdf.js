import { getPhotoURL } from './photoStore';
import { PHOTO_CATEGORIES } from './constants';
import { formatDuration } from './helpers';

// Generates a printable work-order report in a new window and triggers the
// browser's native print dialog (which on phones includes "Save as PDF").
// Zero dependencies, works offline, and embeds photos. Returns true on success.
export async function downloadJobPDF(job, photos = []) {
  try {
    // Resolve photo object URLs first so images are ready when the window prints.
    const resolved = [];
    for (const p of photos) {
      const url = await getPhotoURL(p.id);
      if (url) {
        const cat = PHOTO_CATEGORIES.find(c => c.key === p.category) || PHOTO_CATEGORIES[5];
        resolved.push({ url, label: cat.label, color: cat.color, caption: p.caption || '' });
      }
    }

    const place = [job.building, job.floor && `Floor ${job.floor}`, job.room && `Room ${job.room}`]
      .filter(Boolean).join(', ') || job.location || 'N/A';
    const dur = formatDuration(job.startTime, job.endTime);
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    const partsRows = (job.parts || []).map(p =>
      `<tr><td>${esc(p.name)}</td><td>${esc(p.partNumber || '')}</td><td style="text-align:center">${esc(p.qty || 1)}</td><td style="text-align:right">${p.cost ? '$' + (Number(p.cost) * Number(p.qty || 1)).toFixed(2) : ''}</td></tr>`
    ).join('');
    const totalCost = (job.parts || []).reduce((s, p) => s + Number(p.cost || 0) * Number(p.qty || 1), 0);

    const neededRows = (job.partsNeeded || []).map(p => `<li>${esc(p.name)}${p.ordered ? ' <span style="color:#16a34a">(ordered)</span>' : ''}</li>`).join('');
    const materialRows = (job.materials || []).map(m => `<li>${m.done ? '☑' : '☐'} ${esc(m.name)}</li>`).join('');

    const equip = job.equipment && (job.equipment.brand || job.equipment.model || job.equipment.serial)
      ? `<tr><td class="k">Equipment</td><td>${esc([job.equipment.brand, job.equipment.model, job.equipment.serial && 'S/N ' + job.equipment.serial].filter(Boolean).join(' · '))}</td></tr>`
      : '';

    const photoHTML = resolved.length
      ? `<h2>Photos</h2><div class="grid">${resolved.map(p =>
          `<div class="ph"><img src="${p.url}"/><div class="cap"><span style="color:${p.color};font-weight:700">${esc(p.label)}</span>${p.caption ? ' — ' + esc(p.caption) : ''}</div></div>`
        ).join('')}</div>`
      : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>WO ${esc(job.woNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #111; margin: 24px; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 16px; }
  h2 { font-size: 14px; border-bottom: 2px solid #1e40af; color: #1e40af; padding-bottom: 3px; margin: 22px 0 10px; }
  table.meta { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.meta td { padding: 4px 6px; vertical-align: top; }
  table.meta td.k { font-weight: 700; width: 130px; color: #444; }
  table.parts { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.parts th, table.parts td { border: 1px solid #ccc; padding: 5px 7px; }
  table.parts th { background: #f1f5f9; text-align: left; }
  .notes { white-space: pre-wrap; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
  ul { margin: 4px 0; padding-left: 20px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .ph img { width: 100%; border: 1px solid #ccc; border-radius: 6px; }
  .cap { font-size: 11px; color: #555; margin-top: 3px; }
  .total { text-align: right; font-weight: 700; margin-top: 6px; }
  @media print { body { margin: 12mm; } .ph { break-inside: avoid; } }
</style></head><body>
  <h1>${job.title ? esc(job.title) : 'Work Order #' + esc(job.woNumber)}</h1>
  <div class="sub">${job.title ? 'WO #' + esc(job.woNumber) + ' · ' : ''}${esc(job.date)}</div>

  <table class="meta">
    <tr><td class="k">Location</td><td>${esc(place)}</td></tr>
    <tr><td class="k">Status</td><td>${esc((job.status || '').replace('-', ' '))}</td></tr>
    <tr><td class="k">Priority</td><td>${esc(job.priority || 'normal')}</td></tr>
    ${dur ? `<tr><td class="k">Time on job</td><td>${esc(dur)}</td></tr>` : ''}
    ${job.mileage ? `<tr><td class="k">Mileage</td><td>${esc(job.mileage)} mi</td></tr>` : ''}
    ${job.tags && job.tags.length ? `<tr><td class="k">Tags</td><td>${esc(job.tags.join(', '))}</td></tr>` : ''}
    ${equip}
  </table>

  <h2>Completion Notes</h2>
  <div class="notes">${esc(job.finalNotes || '(no notes recorded)')}</div>

  ${partsRows ? `<h2>Parts Used</h2><table class="parts"><tr><th>Part</th><th>Part #</th><th>Qty</th><th>Cost</th></tr>${partsRows}</table>${totalCost ? `<div class="total">Total: $${totalCost.toFixed(2)}</div>` : ''}` : ''}
  ${neededRows ? `<h2>Parts Needed / To Order</h2><ul>${neededRows}</ul>` : ''}
  ${materialRows ? `<h2>Material Checklist</h2><ul style="list-style:none;padding-left:4px">${materialRows}</ul>` : ''}
  ${photoHTML}
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) return false; // popup blocked
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Give images a moment to load, then invoke print (native Save-as-PDF on phones).
    await new Promise(r => setTimeout(r, 600));
    w.focus();
    w.print();
    return true;
  } catch (e) {
    return false;
  }
}
