# Security Audit Report - https://204.168.181.142

## Executive Summary
- **Date**: 2026-03-27
- **Target**: https://204.168.181.142
- **Security Grade**: A-
- **Confidence**: 85/100

## Security Headers Analysis

| Header | Status | Value |
|--------|--------|-------|
| Content-Security-Policy | OK | default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' wss: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self' |
| X-Frame-Options | OK | DENY |
| X-Content-Type-Options | OK | nosniff |
| X-XSS-Protection | OK | 1; mode=block |
| Strict-Transport-Security | OK | max-age=31536000; includeSubDomains |
| Referrer-Policy | OK | strict-origin-when-cross-origin |
| Permissions-Policy | OK | camera=(), microphone=(), geolocation=() |

## HTTPS/TLS Configuration
- Protocol: TLS 1.3 and TLS 1.2
- Ciphers: TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256, TLS_AES_128_GCM_SHA256, TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384, TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256, TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
- Certificate: Self-signed (CN=peer)

## Vulnerability Findings

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| Low | Server Version Disclosure | HTTP Headers | nginx 1.29.6 exposed |
| Medium | Self-Signed Certificate | TLS Config | Not from trusted CA |

## XSS Assessment
- CSP properly configured
- X-XSS-Protection enabled
- No input vectors on public pages

## Recommendations
1. Hide nginx version with `server_tokens off;`
2. Consider CA-signed certificate for public deployment
3. Add security.txt for vulnerability reporting
4. Consider SRI for external fonts

## Grade Calculation
- Base Score: 100
- nginx disclosure: -5
- Self-signed cert: -5
- **Final: A-**
