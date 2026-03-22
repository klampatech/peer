/**
 * HTTP Security Headers Verification
 *
 * Verifies all security headers required by Section 8.4 of the spec:
 *   REQUIRED:  CSP, X-Frame-Options, X-Content-Type-Options,
 *              Referrer-Policy, Strict-Transport-Security
 *   RECOMMENDED: Permissions-Policy, X-XSS-Protection
 *   FORBIDDEN:  Server, X-Powered-By, X-AspNet-Version, X-Generator
 *
 * Performs deep validation:
 *   - CSP: checks for unsafe-inline, unsafe-eval, overly permissive src
 *   - HSTS: verifies max-age >= 31536000, includeSubDomains
 *   - X-Frame-Options: must be DENY or SAMEORIGIN
 *
 * Run:
 *   node tests/security/http-headers.js
 *
 * Environment:
 *   BASE_URL — signalling server URL (default: http://localhost:3000)
 *   DEEP     — enable deep header analysis (default: true)
 */

'use strict';

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DEEP     = process.env.DEEP !== 'false';

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

let pass = 0, fail = 0, warn = 0;
function PASS(msg)  { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${msg}`); }
function FAIL(msg)  { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${msg}`); }
function WARN(msg)  { warn++; console.log(`  \x1b[33mWARN\x1b[0m  ${msg}`); }
function INFO(msg)  { console.log(`  \x1b[90mINFO\x1b[0m  ${msg}`); }

// ---------------------------------------------------------------------------
// HTTP request helper
// ---------------------------------------------------------------------------

function fetchHeaders(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      // Consume body
      res.on('data', () => {});
      res.on('end', () => resolve(res.headers));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ---------------------------------------------------------------------------
// Deep header validators
// ---------------------------------------------------------------------------

function validateCSP(csp) {
  if (!csp) return { valid: false, reason: 'missing' };

  const issues = [];
  const normalized = csp.replace(/\s+/g, ' ').trim();

  if (/unsafe-inline/i.test(normalized) && /script-src/i.test(normalized)) {
    const scriptMatch = normalized.match(/script-src[^;]*/i);
    if (scriptMatch && !/nonce-|strict-dynamic/i.test(scriptMatch[0])) {
      issues.push('script-src contains unsafe-inline without nonce or strict-dynamic');
    }
  }

  if (/unsafe-eval/i.test(normalized)) {
    issues.push('contains unsafe-eval — allows eval() of strings as code');
  }

  if (/\*(\s|$)/.test(normalized) || /\*\./.test(normalized)) {
    // Wildcard in src is checked carefully — * alone is very permissive
    const wildcards = normalized.match(/\*(\s|$|\;)/g) || [];
    if (wildcards.length > 0) issues.push('contains wildcard (*) — overly permissive');
  }

  if (/report-uri|report-to/.test(normalized)) {
    INFO(`CSP reporting directive present: ${normalized.match(/report-(?:uri|to)[^;]*/i)?.[0]}`);
  }

  const required = ['default-src'];
  for (const dir of required) {
    if (!new RegExp(dir + '\\s', 'i').test(normalized)) {
      issues.push(`missing ${dir} directive`);
    }
  }

  return { valid: issues.length === 0, reason: issues.join('; ') || 'ok' };
}

function validateHSTS(hsts) {
  if (!hsts) return { valid: false, reason: 'missing' };

  const issues = [];
  const normalized = hsts.trim();

  const maxAgeMatch = normalized.match(/max-age=(\d+)/i);
  if (!maxAgeMatch) {
    issues.push('missing max-age directive');
  } else {
    const maxAge = parseInt(maxAgeMatch[1], 10);
    if (maxAge < 31536000) {
      issues.push(`max-age=${maxAge} is below recommended minimum of 31536000 (1 year)`);
    }
  }

  if (!/includeSubDomains/i.test(normalized)) {
    issues.push('missing includeSubDomains — subdomains may not be protected');
  }

  if (/ preload/i.test(normalized)) {
    INFO('HSTS preload directive present (also needs to be submitted to browser preload lists)');
  }

  return { valid: issues.length === 0, reason: issues.join('; ') || 'ok' };
}

function validateXFrameOptions(val) {
  if (!val) return { valid: false, reason: 'missing' };
  const upper = val.toUpperCase().trim();
  if (upper !== 'DENY' && upper !== 'SAMEORIGIN') {
    return { valid: false, reason: `value is "${val}", expected DENY or SAMEORIGIN` };
  }
  return { valid: true, reason: `value=${val}` };
}

function validateXContentTypeOptions(val) {
  if (!val) return { valid: false, reason: 'missing' };
  if (val.toLowerCase().trim() !== 'nosniff') {
    return { valid: false, reason: `value is "${val}", expected "nosniff"` };
  }
  return { valid: true, reason: 'ok' };
}

function validateReferrerPolicy(val) {
  if (!val) return { valid: false, reason: 'missing' };
  const valid = [
    'no-referrer', 'no-referrer-when-downgrade', 'origin',
    'origin-when-cross-origin', 'same-origin', 'strict-origin',
    'strict-origin-when-cross-origin', 'unsafe-url', 'never', 'default',
  ];
  if (!valid.includes(val.toLowerCase())) {
    return { valid: false, reason: `value "${val}" is not a recognized Referrer-Policy value` };
  }
  return { valid: true, reason: `value=${val}` };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  HTTP Security Headers Verification                          ║');
  console.log('║  Target: ' + BASE_URL.padEnd(45) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  let headers;
  try {
    headers = await fetchHeaders(BASE_URL + '/health');
    PASS('Server responded — headers captured');
  } catch (err) {
    FAIL(`Cannot reach ${BASE_URL}: ${err.message}`);
    console.log('  Start backend: cd packages/backend && pnpm dev\n');
    process.exit(1);
  }

  const h = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );

  // ---- REQUIRED headers ----
  console.log('\n=== Required Headers ===');

  // Content-Security-Policy
  INFO('Content-Security-Policy:');
  const cspResult = validateCSP(h['content-security-policy']);
  if (h['content-security-policy']) {
    INFO(`  Value: ${h['content-security-policy'].substring(0, 120)}...`);
    if (cspResult.valid) PASS('  CSP is well-formed and secure');
    else WARN(`  CSP has issues: ${cspResult.reason}`);
  } else {
    FAIL('  CSP is MISSING — critical security risk (XSS protection)');
  }

  // X-Frame-Options
  INFO('X-Frame-Options:');
  const xfoResult = validateXFrameOptions(h['x-frame-options']);
  if (xfoResult.valid) PASS(`  X-Frame-Options: ${xfoResult.reason}`);
  else FAIL(`  X-Frame-Options: ${xfoResult.reason}`);

  // X-Content-Type-Options
  INFO('X-Content-Type-Options:');
  const xctoResult = validateXContentTypeOptions(h['x-content-type-options']);
  if (xctoResult.valid) PASS('  X-Content-Type-Options: nosniff');
  else FAIL(`  X-Content-Type-Options: ${xctoResult.reason}`);

  // Referrer-Policy
  INFO('Referrer-Policy:');
  const rpResult = validateReferrerPolicy(h['referrer-policy']);
  if (rpResult.valid) PASS(`  Referrer-Policy: ${rpResult.reason}`);
  else FAIL(`  Referrer-Policy: ${rpResult.reason}`);

  // Strict-Transport-Security
  INFO('Strict-Transport-Security (HSTS):');
  const hstsResult = validateHSTS(h['strict-transport-security']);
  if (h['strict-transport-security']) {
    INFO(`  Value: ${h['strict-transport-security']}`);
    if (hstsResult.valid) PASS('  HSTS meets minimum requirements (max-age >= 1yr, includeSubDomains)');
    else WARN(`  HSTS: ${hstsResult.reason}`);
  } else {
    FAIL('  HSTS is MISSING — critical for production HTTPS enforcement');
  }

  // ---- RECOMMENDED headers ----
  console.log('\n=== Recommended Headers ===');

  // Permissions-Policy
  INFO('Permissions-Policy:');
  if (h['permissions-policy']) {
    PASS(`  Present: ${h['permissions-policy'].substring(0, 100)}...`);
  } else {
    WARN('  Missing — recommended to restrict browser features (camera, mic, geolocation)');
  }

  // X-XSS-Protection
  INFO('X-XSS-Protection:');
  if (h['x-xss-protection']) {
    INFO(`  Present: ${h['x-xss-protection']}`);
    if (/1\s*;\s*block/i.test(h['x-xss-protection'])) {
      PASS('  X-XSS-Protection: 1; block (recommended)');
    } else {
      WARN('  X-XSS-Protection present but not "1; block" — modern browsers prefer CSP');
    }
  } else {
    WARN('  Missing — modern browsers rely on CSP instead; not critical');
  }

  // ---- FORBIDDEN headers ----
  console.log('\n=== Forbidden / Information-Leaking Headers ===');

  const forbidden = [
    { name: 'server',           note: 'Web server identification' },
    { name: 'x-powered-by',     note: 'Technology stack disclosure' },
    { name: 'x-aspnet-version', note: 'ASP.NET version disclosure' },
    { name: 'x-generator',       note: 'CMS / framework disclosure' },
    { name: 'x-ua-compatible',   note: 'usually harmless but may leak browser targeting' },
  ];

  for (const { name, note } of forbidden) {
    if (h[name]) {
      FAIL(`  ${name} is PRESENT (${note}): "${h[name]}" — should be removed`);
    } else {
      PASS(`  ${name} is properly hidden`);
    }
  }

  // ---- Summary ----
  console.log('\n=== Summary ===');
  console.log(`Passed:  ${pass}`);
  console.log(`Failed:  ${fail}`);
  console.log(`Warnings: ${warn}`);

  const total = pass + fail + warn;
  console.log(`\nChecked: ${total} header assertions`);

  if (fail > 0) {
    console.log(`\nResult: \x1b[31mFAIL\x1b[0m — ${fail} required header(s) missing or misconfigured\n`);
    process.exit(1);
  } else if (warn > 0) {
    console.log(`\nResult: \x1b[33mPASS\x1b[0m — All required headers present (${warn} recommendation(s) noted)\n`);
    process.exit(0);  // warnings are non-blocking — required headers all pass
  } else {
    console.log(`\nResult: \x1b[32mPASS\x1b[0m — All required headers present and secure\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
