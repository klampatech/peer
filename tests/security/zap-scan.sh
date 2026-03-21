#!/bin/bash
#
# OWASP ZAP Baseline Scan Script
#
# Runs OWASP ZAP baseline scan against the Peer application
# to check for security vulnerabilities.
#
# Usage:
#   # Start the backend first
#   cd packages/backend && pnpm dev &
#
#   # Run the scan
#   ./tests/security/zap-scan.sh
#
#   # With custom URL
#   TARGET_URL=http://localhost:3000 ./tests/security/zap-scan.sh
#

set -e

# Configuration
TARGET_URL="${TARGET_URL:-http://localhost:3000}"
ZAP_API_KEY="${ZAP_API_KEY:-}"
REPORT_FILE="${REPORT_FILE:-tests/security/zap-report.html}"
JSON_REPORT_FILE="${JSON_REPORT_FILE:-tests/security/zap-report.json}"

echo "=== OWASP ZAP Baseline Scan ==="
echo "Target: ${TARGET_URL}"
echo "Report: ${REPORT_FILE}"
echo ""

# Check if ZAP is available (either local or docker)
if command -v zap &> /dev/null; then
    ZAP_CMD="zap"
elif docker info &> /dev/null; then
    ZAP_CMD="docker run -v $(pwd):/zap/wrk:rw -t owasp/zap2docker-stable zap.sh"
else
    echo "❌ Error: OWASP ZAP not found. Install locally or use Docker."
    echo "   Docker: https://www.docker.com/"
    echo "   ZAP:    https://www.zaproxy.org/download/"
    exit 1
fi

echo "Using ZAP: ${ZAP_CMD}"
echo ""

# Check if target is accessible
echo "Checking target accessibility..."
if curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/health" | grep -q "200"; then
    echo "✅ Target is accessible"
else
    echo "❌ Error: Target ${TARGET_URL} is not accessible"
    echo "   Make sure the backend is running: cd packages/backend && pnpm dev"
    exit 1
fi

echo ""
echo "Starting ZAP baseline scan..."
echo "This may take a few minutes..."
echo ""

# Run ZAP baseline scan
# -T: timeout in minutes
# -r: generate HTML report
# -J: generate JSON report
# -n: new session
# -d: debug mode (optional)

${ZAP_CMD} -cmd -quickurl "${TARGET_URL}" -quickprogress \
    -timeout 10 \
    -reportfile "${REPORT_FILE}" \
    -jsonreport "${JSON_REPORT_FILE}" \
    ${ZAP_API_KEY:+-apikey "$ZAP_API_KEY"} \
    2>&1 || true

echo ""
echo "=== Scan Complete ==="

# Check for high-severity issues in JSON report
if [ -f "${JSON_REPORT_FILE}" ]; then
    HIGH_COUNT=$(grep -o '"High":[0-9]*' "${JSON_REPORT_FILE}" | grep -o '[0-9]*' | head -1 || echo "0")
    MEDIUM_COUNT=$(grep -o '"Medium":[0-9]*' "${JSON_REPORT_FILE}" | grep -o '[0-9]*' | head -1 || echo "0")

    echo "High severity issues: ${HIGH_COUNT}"
    echo "Medium severity issues: ${MEDIUM_COUNT}"

    if [ "${HIGH_COUNT}" -gt 0 ]; then
        echo ""
        echo "❌ FAIL: High severity vulnerabilities found!"
        echo "   Review the report: ${REPORT_FILE}"
        exit 1
    fi

    if [ "${MEDIUM_COUNT}" -gt 5 ]; then
        echo ""
        echo "⚠️  WARN: Many medium severity issues found"
        echo "   Review the report: ${REPORT_FILE}"
    fi
fi

echo ""
echo "✅ OWASP ZAP scan completed successfully"
echo "   HTML Report: ${REPORT_FILE}"
echo "   JSON Report: ${JSON_REPORT_FILE}"
