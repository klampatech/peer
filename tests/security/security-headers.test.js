/**
 * Security Headers Verification Test
 *
 * Verifies that all required security headers are present:
 * - Content-Security-Policy
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - Referrer-Policy
 * - Permissions-Policy
 * - Strict-Transport-Security (HSTS)
 *
 * Usage:
 *   # Run as standalone script with node
 *   node tests/security/security-headers.test.js
 *
 *   # Or include in CI to verify headers
 */

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Required security headers according to spec
const REQUIRED_HEADERS = {
  'content-security-policy': {
    description: 'Content Security Policy',
    required: true,
    checks: [
      "default-src 'self'",
      "script-src 'self'",
      "frame-src 'none'",
    ],
  },
  'x-frame-options': {
    description: 'X-Frame-Options',
    required: true,
    expected: 'DENY',
  },
  'x-content-type-options': {
    description: 'X-Content-Type-Options',
    required: true,
    expected: 'nosniff',
  },
  'referrer-policy': {
    description: 'Referrer-Policy',
    required: true,
  },
  'strict-transport-security': {
    description: 'HSTS',
    required: true,
    checks: [
      'max-age=',
      'includeSubDomains',
    ],
  },
};

// Optional but recommended headers
const OPTIONAL_HEADERS = {
  'permissions-policy': {
    description: 'Permissions-Policy',
    required: false,
  },
  'x-xss-protection': {
    description: 'X-XSS-Protection',
    required: false,
  },
};

/**
 * Make HTTP request and capture all headers
 */
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Check if header value contains required substring
 */
function headerContains(headerValue, check) {
  if (!headerValue) return false;
  return headerValue.toLowerCase().includes(check.toLowerCase());
}

/**
 * Run security header tests
 */
async function runSecurityTests() {
  console.log('=== Security Headers Verification ===');
  console.log(`Testing: ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;
  const results = [];

  try {
    const response = await makeRequest(`${BASE_URL}/health`);

    console.log(`Status Code: ${response.statusCode}`);
    console.log('---');

    // Check required headers
    for (const [headerName, config] of Object.entries(REQUIRED_HEADERS)) {
      const headerValue = response.headers[headerName];
      const headerFound = !!headerValue;

      if (config.required && !headerFound) {
        console.log(`❌ FAIL: ${config.description} (${headerName}) - MISSING`);
        failed++;
        results.push({ header: headerName, status: 'FAIL', reason: 'Missing required header' });
        continue;
      }

      // Check for specific values if specified
      if (config.expected && headerValue !== config.expected) {
        console.log(`❌ FAIL: ${config.description} - Expected "${config.expected}", got "${headerValue}"`);
        failed++;
        results.push({ header: headerName, status: 'FAIL', reason: `Expected ${config.expected}, got ${headerValue}` });
        continue;
      }

      // Check for substrings if specified
      if (config.checks) {
        let allChecksPassed = true;
        for (const check of config.checks) {
          if (!headerContains(headerValue, check)) {
            console.log(`⚠️  WARN: ${config.description} - Missing "${check}"`);
            allChecksPassed = false;
          }
        }
        if (!allChecksPassed && config.required) {
          failed++;
          results.push({ header: headerName, status: 'FAIL', reason: 'Missing required checks' });
          continue;
        }
      }

      console.log(`✅ PASS: ${config.description}`);
      if (headerValue) {
        console.log(`   Value: ${headerValue.substring(0, 100)}${headerValue.length > 100 ? '...' : ''}`);
      }
      passed++;
      results.push({ header: headerName, status: 'PASS' });
    }

    // Check optional headers
    console.log('\n--- Optional Headers ---');
    for (const [headerName, config] of Object.entries(OPTIONAL_HEADERS)) {
      const headerValue = response.headers[headerName];
      if (headerValue) {
        console.log(`✅ PRESENT: ${config.description}`);
        console.log(`   Value: ${headerValue}`);
      } else {
        console.log(`⚠️  MISSING: ${config.description} (optional)`);
      }
    }

    // Check for forbidden headers
    console.log('\n--- Forbidden Headers ---');
    const forbiddenHeaders = ['server', 'x-powered-by'];
    for (const header of forbiddenHeaders) {
      if (response.headers[header]) {
        console.log(`⚠️  WARN: ${header} should be hidden (found: ${response.headers[header]})`);
      } else {
        console.log(`✅ PASS: ${header} is properly hidden`);
      }
    }

  } catch (error) {
    console.error(`❌ ERROR: ${error.message}`);
    failed++;
    results.push({ header: 'request', status: 'ERROR', reason: error.message });
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  // Exit with appropriate code
  if (failed > 0) {
    console.log('\n❌ Security headers verification FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ All security headers verified');
    process.exit(0);
  }
}

// Run tests
runSecurityTests();
