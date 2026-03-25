/* eslint-disable no-console */
import http  from 'http';
import https from 'https';
import fs    from 'fs';
import path  from 'path';

const BASE_URL   = process.env.API_URL  ?? 'http://localhost:3000';
const DOC_COUNT  = parseInt(process.env.DOC_COUNT ?? '1000', 10);
const POLL_MS    = 2000;
const OUTPUT_DIR = path.resolve(__dirname, '../benchmark-reports');

interface Snapshot {
  t:         number;
  processed: number;
  failed:    number;
  heapMB:    number;
}

interface BatchStatusResponse {
  status:         string;
  processedCount: number;
  failedCount:    number;
}

interface BatchCreateResponse {
  batchId: string;
}

interface ReportParams {
  batchId:        string;
  totalMs:        number;
  docsPerSec:     number;
  processedCount: number;
  failedCount:    number;
  peakMemMB:      number;
  cpuUserMs:      number;
  snapshots:      Snapshot[];
}

function post(url: string, body: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const lib  = url.startsWith('https') ? https : http;
    const req  = lib.request(url, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c: Buffer) => (raw += c.toString()));
      res.on('end',  () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      let raw = '';
      res.on('data', (c: Buffer) => (raw += c.toString()));
      res.on('end',  () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function pollUntilDone(batchId: string): Promise<{
  status:         string;
  processedCount: number;
  failedCount:    number;
  snapshots:      Snapshot[];
}> {
  const snapshots: Snapshot[] = [];
  const t0 = Date.now();

  while (true) {
    const result = await get(`${BASE_URL}/api/documents/batch/${batchId}`) as BatchStatusResponse;

    snapshots.push({
      t:         Date.now() - t0,
      processed: result.processedCount,
      failed:    result.failedCount,
      heapMB:    Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });

    const done = result.processedCount + result.failedCount;
    process.stdout.write(
      `\r  ⏳ ${done}/${DOC_COUNT} (${result.processedCount} OK · ${result.failedCount} ERR)`
    );

    if (result.status === 'completed' || result.status === 'failed') {
      process.stdout.write('\n');
      return { ...result, snapshots };
    }

    await new Promise<void>((r) => setTimeout(r, POLL_MS));
  }
}

//Rapport HTML 
function generateHtmlReport(p: ReportParams): string {
  const labels   = p.snapshots.map((s) => `${(s.t / 1000).toFixed(1)}s`);
  const progress = p.snapshots.map((s) => s.processed);
  const memory   = p.snapshots.map((s) => s.heapMB);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Benchmark Report</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
  <style>
    body{font-family:system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;background:#f8f9fa;color:#212529}
    h1{font-size:1.4rem;margin-bottom:4px}
    .sub{color:#6c757d;font-size:.85rem;margin-bottom:32px}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
    .kpi{background:white;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
    .kpi-value{font-size:1.8rem;font-weight:700;color:#003189}
    .kpi-label{font-size:.75rem;color:#6c757d;margin-top:4px}
    .chart-card{background:white;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:24px}
    .chart-title{font-size:.9rem;font-weight:600;margin-bottom:16px;color:#343a40}
    canvas{max-height:260px}
  </style>
</head>
<body>
  <h1>Rapport de Benchmark — Document Generation Service</h1>
  <p class="sub">
    Exécuté le ${new Date().toLocaleString('fr-FR')} ·
    batchId: ${p.batchId} · ${DOC_COUNT} documents
  </p>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-value">${(p.totalMs / 1000).toFixed(1)}s</div>
      <div class="kpi-label">Durée totale</div>
    </div>
    <div class="kpi">
      <div class="kpi-value">${p.docsPerSec}</div>
      <div class="kpi-label">Documents / seconde</div>
    </div>
    <div class="kpi">
      <div class="kpi-value">${p.processedCount}</div>
      <div class="kpi-label">Documents OK</div>
    </div>
    <div class="kpi">
      <div class="kpi-value" style="color:${p.failedCount > 0 ? '#e74c3c' : '#27ae60'}">
        ${p.failedCount}
      </div>
      <div class="kpi-label">Documents en échec</div>
    </div>
  </div>

  <div class="chart-card">
    <div class="chart-title">Progression — documents générés dans le temps</div>
    <canvas id="c1"></canvas>
  </div>
  <div class="chart-card">
    <div class="chart-title">Mémoire heap (MB) dans le temps</div>
    <canvas id="c2"></canvas>
  </div>

  <script>
    const labels = ${JSON.stringify(labels)};
    new Chart(document.getElementById('c1'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Documents générés',
          data: ${JSON.stringify(progress)},
          borderColor: '#003189',
          backgroundColor: 'rgba(0,49,137,.08)',
          fill: true, tension: 0.3, pointRadius: 3,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: ${DOC_COUNT},
               title: { display: true, text: 'Documents' } },
          x: { title: { display: true, text: 'Temps (s)' } }
        }
      }
    });
    new Chart(document.getElementById('c2'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Heap (MB)',
          data: ${JSON.stringify(memory)},
          borderColor: '#e67e22',
          backgroundColor: 'rgba(230,126,34,.08)',
          fill: true, tension: 0.3, pointRadius: 3,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true,
               title: { display: true, text: 'MB' } },
          x: { title: { display: true, text: 'Temps (s)' } }
        }
      }
    });
  </script>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\n Benchmark — ${DOC_COUNT} documents contre ${BASE_URL}\n`);

  const userIds = Array.from(
    { length: DOC_COUNT },
    (_, i) => `user-${String(i).padStart(6, '0')}`
  );

  const cpuBefore = process.cpuUsage();
  const wallStart = Date.now();

  const res      = await post(`${BASE_URL}/api/documents/batch`, { userIds }) as BatchCreateResponse;
  const batchId  = res.batchId;
  console.log(` batchId : ${batchId}`);

  const { processedCount, failedCount, snapshots } = await pollUntilDone(batchId);

  const totalMs    = Date.now() - wallStart;
  const cpuAfter   = process.cpuUsage(cpuBefore);
  const docsPerSec = Math.round((processedCount / totalMs) * 1000);
  const peakMemMB  = Math.max(...snapshots.map((s) => s.heapMB));

  console.log('\n┌──────────────────────────────────────────┐');
  console.log('│         RAPPORT DE BENCHMARK              │');
  console.log('├──────────────────────────────────────────┤');
  console.log(`│ Durée totale      : ${String((totalMs / 1000).toFixed(1)).padEnd(8)} s          │`);
  console.log(`│ Documents/seconde : ${String(docsPerSec).padEnd(8)}             │`);
  console.log(`│ Documents OK      : ${String(processedCount).padEnd(8)}             │`);
  console.log(`│ Documents KO      : ${String(failedCount).padEnd(8)}             │`);
  console.log(`│ Pic mémoire heap  : ${String(peakMemMB).padEnd(8)} MB          │`);
  console.log(`│ CPU user          : ${String(Math.round(cpuAfter.user / 1000)).padEnd(8)} ms          │`);
  console.log('└──────────────────────────────────────────┘');

  // Génération du rapport HTML
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const reportPath = path.join(OUTPUT_DIR, `report-${Date.now()}.html`);
  fs.writeFileSync(
    reportPath,
    generateHtmlReport({
      batchId, totalMs, docsPerSec,
      processedCount, failedCount,
      peakMemMB,
      cpuUserMs: Math.round(cpuAfter.user / 1000),
      snapshots,
    })
  );

  console.log(`\nRapport HTML : ${reportPath}\n`);
}

main().catch(console.error);