/**
 * OWASP ZAP Baseline Scan — Programmatic API
 *
 * Uses the ZAP REST API (via thin HTTP client — no zaproxy package needed)
 * to run a baseline scan against the Peer signalling server.
 *
 * Features:
 *   - Spider crawl of the target
 *   - Passive scan (no active attacks — safe for production targets)
 *   - Alert parsing by risk level
 *   - HTML + JSON report generation
 *   - Falls back to HTTP headers check if ZAP daemon not running
 *
 * Run:
 *   # Terminal 1 — start ZAP daemon:
 *   zap.sh -daemon -host localhost -port 8090
 *   #   or with Docker:
 *   docker run -p 8090:8090 -v $(pwd):/zap/wrk:rw owasp/zap2docker-stable zap.sh -daemon \
 *       -host 0.0.0.0 -port 8090
 *
 *   # Terminal 2 — run this script:
 *   node tests/security/owasp-zap-baseline.js
 *
 * Environment:
 *   ZAP_HOST   — ZAP daemon host (default: localhost)
 *   ZAP_PORT   — ZAP daemon port (default: 8090)
 *   ZAP_API_KEY — ZAP API key (set when starting ZAP: -config api.key=yourkey)
 *   BASE_URL   — target application (default: http://localhost:3000)
 *   REPORT_HTML — HTML report output path
 *   REPORT_JSON — JSON report output path
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ZAP_HOST   = process.env.ZAP_HOST   || 'localhost';
const ZAP_PORT   = process.env.ZAP_PORT   || '8090';
const ZAP_API_KEY = process.env.ZAP_API_KEY || '';
const BASE_URL   = process.env.BASE_URL   || 'http://localhost:3000';
const REPORT_HTML = process.env.REPORT_HTML || path.join(__dirname, 'zap-report.html');
const REPORT_JSON = process.env.REPORT_JSON || path.join(__dirname, 'zap-report.json');
const TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// ZAP REST API helpers
// ---------------------------------------------------------------------------

function zapUrl(pathAndQuery) {
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const key = ZAP_API_KEY ? `${sep}apikey=${ZAP_API_KEY}` : '';
  return `http://${ZAP_HOST}:${ZAP_PORT}${pathAndQuery}${key}`;
}

function zapRequest(method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const url     = new URL(zapUrl(apiPath));
    const options = {
      hostname:   ZAP_HOST,
      port:       parseInt(ZAP_PORT, 10),
      path:       url.pathname + url.search,
      method,
      headers:    {},
      timeout:    TIMEOUT_MS,
    };

    if (body) {
      const json  = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(json);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ZAP request timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Wait for ZAP to finish the current scan (poll until state = 'idle').
 */
async function waitForZap(pollIntervalMs = 3000, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await zapRequest('GET', '/JSON/spider/view/status/?scanId=0');
    const state = res.data?.status || '';
    if (['idle', 'stopped', 'finished'].includes(state)) return;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error('ZAP scan did not complete within timeout');
}

/**
 * Create a new ZAP session (clears previous state).
 */
async function createSession(sessionName = 'peer-baseline') {
  try {
    await zapRequest('GET', `/JSON/session/action/new/?name=${encodeURIComponent(sessionName)}`);
    console.log(`  ZAP session '${sessionName}' created`);
  } catch (err) {
    console.log(`  Session create returned: ${err.message} (may already exist)`);
  }
}

/**
 * Run the spider against the target URL.
 */
async function spiderTarget(target) {
  const encodedTarget = encodeURIComponent(target);
  const scanRes = await zapRequest('GET',
    `/JSON/spider/action/scan/?url=${encodedTarget}&maxChildren=20&recurse=true`
  );
  const scanId = scanRes.data?.scan || scanRes.data?.['scan-id'] || 0;
  console.log(`  Spider started (scanId=${scanId})`);
  await waitForZap();
  return scanId;
}

/**
 * Run the ascan (active scan) with a low number of threads for baseline scan.
 * We limit to Spider + Passive scan by default (passive only = safest).
 * Use AScan with caution on non-test environments.
 */
async function runActiveScan(target, threads = 2) {
  const encodedTarget = encodeURIComponent(target);
  const scanRes = await zapRequest('GET',
    `/JSON/ascan/action/scan/?url=${encodedTarget}&recurse=true&inScopeOnly=false&scanPolicyName=&method=&postData=&contextId=0`
  );
  const scanId = scanRes.data?.scan || 0;
  console.log(`  Active scan started (scanId=${scanId}) — this may take a while...`);
  // Poll active scan status
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    try {
      const res = await zapRequest('GET', `/JSON/ascan/view/status/?scanId=${scanId}`);
      const state = res.data?.status || '';
      if (['stopped', 'finished'].includes(state)) break;
    } catch { /* poll */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return scanId;
}

/**
 * Fetch all ZAP alerts.
 */
async function fetchAlerts(start = 0, count = 1000) {
  const res = await zapRequest('GET',
    `/JSON/alert/view/alerts/?start=${start}&count=${count}&regex=`
  );
  return res.data?.alerts || [];
}

/**
 * Generate HTML report.
 */
async function generateHtmlReport(outputPath) {
  const res = await zapRequest('GET', '/OTHER/core/other/htmlreport/', null);
  fs.writeFileSync(outputPath, res.raw || '');
  console.log(`  HTML report written: ${outputPath}`);
}

/**
 * Generate JSON report.
 */
async function generateJsonReport(outputPath) {
  const res = await zapRequest('GET', '/JSON/report/view/report/');
  fs.writeFileSync(outputPath, JSON.stringify(res.data, null, 2));
  console.log(`  JSON report written: ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

let pass = 0, fail = 0, warn = 0;
function PASS(msg) { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${msg}`); }
function FAIL(msg) { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${msg}`); }
function WARN(msg) { warn++; console.log(`  \x1b[33mWARN\x1b[0m  ${msg}`); }
function INFO(msg) { console.log(`  \x1b[90mINFO\x1b[0m  ${msg}`); }

const RISK_MAP = { high: 'High', medium: 'Medium', low: 'Low', informational: 'Info', info: 'Info' };

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  OWASP ZAP Baseline Security Scan                           ║');
  console.log('║  Target:  ' + BASE_URL.padEnd(45) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ---- Check if ZAP daemon is reachable ----
  let zapAvailable = false;
  try {
    const res = await zapRequest('GET', '/JSON/core/view/version/');
    if (res.status === 200 && res.data?.version) {
      zapAvailable = true;
      console.log(`  ZAP daemon: v${res.data.version} @ ${ZAP_HOST}:${ZAP_PORT}`);
    }
  } catch (err) {
    INFO(`ZAP daemon not reachable at ${ZAP_HOST}:${ZAP_PORT}`);
  }

  // ---- Verify target is accessible ----
  try {
    await new Promise((resolve, reject) => {
      http.get(BASE_URL + '/health', { timeout: 5000 }, (res) => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`HTTP ${res.statusCode}`));
      }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
    });
    PASS('Target is reachable');
  } catch (err) {
    FAIL(`Target ${BASE_URL} is not accessible: ${err.message}`);
    console.log(`  Start backend: cd packages/backend && pnpm dev\n`);
    process.exit(1);
  }

  if (!zapAvailable) {
    // ---- Fallback: basic HTTP security headers scan ----
    console.log('\n=== Running fallback: HTTP Security Headers Scan ===\n');
    await runFallbackHeadersScan();
    await printSummary();
    process.exit(fail > 0 ? 1 : 0);
    return;
  }

  // ---- ZAP available — run full scan ----
  console.log('\n=== Step 1: Creating ZAP Session ===');
  await createSession('peer-baseline-' + Date.now());

  console.log('\n=== Step 2: Spider Crawl ===');
  await spiderTarget(BASE_URL);

  // Passive scan runs automatically during spider; give it a moment
  await new Promise((r) => setTimeout(r, 2000));

  // ---- Optionally run active scan (disabled by default — safe baseline) ----
  const RUN_ACTIVE_SCAN = process.env.ZAP_ACTIVE_SCAN === 'true';
  if (RUN_ACTIVE_SCAN) {
    console.log('\n=== Step 3: Active Scan (ENABLED via ZAP_ACTIVE_SCAN=true) ===');
    await runActiveScan(BASE_URL);
  } else {
    console.log('\n=== Step 3: Active Scan ===');
    INFO('Skipping (passive scan only — set ZAP_ACTIVE_SCAN=true to enable active scan)');
  }

  console.log('\n=== Step 4: Fetching Alerts ===');
  const alerts = await fetchAlerts();
  const byRisk = { High: [], Medium: [], Low: [], Info: [] };
  for (const a of alerts) {
    const risk = RISK_MAP[a.risk] || 'Info';
    byRisk[risk].push(a);
  }

  console.log(`  Total alerts: ${alerts.length}`);
  for (const [risk, label] of [['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low'], ['Info', 'Info']]) {
    if (byRisk[risk].length > 0) {
      INFO(`${label} severity: ${byRisk[risk].length} alert(s)`);
    }
  }

  console.log('\n=== Step 5: Risk Assessment ===');
  if (byRisk.High.length > 0) {
    FAIL(`${byRisk.High.length} HIGH-severity vulnerability(es) found:`);
    byRisk.High.forEach((a) => console.log(`    - ${a.name} (${a.url})`));
  } else {
    PASS('No HIGH-severity vulnerabilities');
  }

  if (byRisk.Medium.length > 0) {
    WARN(`${byRisk.Medium.length} MEDIUM-severity issue(s):`);
    byRisk.Medium.forEach((a) => console.log(`    - ${a.name}`));
  } else {
    PASS('No MEDIUM-severity vulnerabilities');
  }

  // ---- Report generation ----
  console.log('\n=== Step 6: Generating Reports ===');
  try {
    await generateHtmlReport(REPORT_HTML);
    await generateJsonReport(REPORT_JSON);
    INFO(`Reports: ${REPORT_HTML}  |  ${REPORT_JSON}`);
  } catch (err) {
    WARN(`Report generation failed: ${err.message}`);
  }

  await printSummary();
  process.exit(fail > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Fallback: HTTP security headers check (when ZAP not available)
// ---------------------------------------------------------------------------

async function runFallbackHeadersScan() {
  const REQUIRED_HEADERS = [
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'strict-transport-security',
  ];
  const FORBIDDEN_HEADERS = ['server', 'x-powered-by'];

  return new Promise((resolve) => {
    http.get(BASE_URL + '/health', { timeout: 5000 }, (res) => {
      const headers = res.headers;

      // Required headers
      for (const h of REQUIRED_HEADERS) {
        if (headers[h]) {
          PASS(`${h} is present`);
          // Basic validation
          if (h === 'strict-transport-security') {
            if (!headers[h].includes('max-age=') || !headers[h].includes('includeSubDomains')) {
              WARN(`${h} present but may be missing required directives`);
            }
          }
          if (h === 'x-frame-options' && headers[h].toUpperCase() !== 'DENY' && headers[h].toUpperCase() !== 'SAMEORIGIN') {
            WARN(`${h} present but value is not DENY or SAMEORIGIN`);
          }
        } else {
          FAIL(`${h} is MISSING — security risk`);
        }
      }

      // Forbidden headers
      for (const h of FORBIDDEN_HEADERS) {
        if (headers[h]) {
          WARN(`${h} is present (should be hidden): ${headers[h]}`);
        } else {
          PASS(`${h} is properly hidden`);
        }
      }

      resolve();
    }).on('error', (err) => {
      FAIL(`Could not reach ${BASE_URL}: ${err.message}`);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

async function printSummary() {
  console.log('\n=== Summary ===');
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${fail}`);
  console.log(`Warnings: ${warn}`);

  if (fail > 0) {
    console.log(`\nResult: \x1b[31mFAIL\x1b[0m — ${fail} security issue(s) found\n`);
  } else {
    console.log(`\nResult: \x1b[32mPASS\x1b[0m — No critical security issues detected\n`);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
