# Security Audit Report: Peer Production Deployment

**Repository**: Public GitHub Repository
**Audit Date**: 2026-03-23
**Auditor**: Infrastructure Security Auditor

---

## Executive Summary

This public repository contains a real-time WebRTC application deployment targeting production server `204.168.181.142`. The deployment infrastructure has **critical security gaps** that could expose production credentials, allow unauthorized server access, and enable various attacks from anyone who can read this public repo.

**Overall Security Posture**: POOR — Multiple critical and high-severity findings require immediate remediation before production use.

---

## Findings Summary

| Severity | Count | Priority |
|----------|-------|----------|
| Critical | 4 | Immediate action required |
| High | 5 | Address before production |
| Medium | 4 | Recommended improvements |
| Low | 3 | Nice-to-have hardening |

**Confidence Score**: 95/100 — All relevant files were reviewed. Some findings require access to GitHub Actions secrets/admin to fully verify.

---

## Critical Findings

### CR-1: Production Server IP Exposed in Public Repo
- **Severity**: Critical
- **Location**: `deploy.sh:7`, `docker-compose.production.yml:11,12,45`
- **Description**: Production server IP address `204.168.181.142` is hardcoded across multiple files visible to anyone.
- **Risk**: A malicious actor can directly target the production server for attacks, port scanning, and exploitation attempts.
- **Evidence**:
  ```bash
  # deploy.sh:7
  SSH_HOST="${1:-root@204.168.181.142}"
  ```
- **Mitigation**:
  1. Move IP to environment variable: `SSH_HOST="${1:-${DEPLOY_HOST}}"`
  2. Store `DEPLOY_HOST` as a GitHub Actions secret
  3. Replace all hardcoded IPs in docker-compose and nginx configs with `${PRODUCTION_IP}` env var

---

### CR-2: Root Login Over SSH for Deployments
- **Severity**: Critical
- **Location**: `deploy.sh:7`, `ci.yml:449`
- **Description**: Deployment authenticates as `root` on the production server.
- **Risk**: If the SSH key/password is compromised, attacker has full root access to the server including ability to: modify system files, access other containers, exfiltrate data, install backdoors.
- **Evidence**:
  ```bash
  SSH_HOST="${1:-root@204.168.181.142}"
  ```
- **Mitigation**:
  1. Create a dedicated deployment user with limited sudo privileges
  2. Configure sudoers for specific commands only (docker compose, git pull)
  3. Disable direct root SSH login in `/etc/ssh/sshd_config`: `PermitRootLogin no`
  4. Use `DEPLOY_USER` env var instead of hardcoding `root`

---

### CR-3: SSH StrictHostKeyChecking Disabled
- **Severity**: Critical
- **Location**: `deploy.sh:21-25`
- **Description**: SSH connections bypass host key verification with `-o StrictHostKeyChecking=no`.
- **Risk**: Man-in-the-middle attack is trivial — attacker can intercept deployment traffic, steal credentials, inject malicious code into the deployment.
- **Evidence**:
  ```bash
  SSH_CMD="ssh -o StrictHostKeyChecking=no"
  SCP_CMD="scp -o StrictHostKeyChecking=no"
  ```
- **Mitigation**:
  1. Remove `StrictHostKeyChecking=no` from SSH commands
  2. Pre-populate known_hosts with the server's host key before first deployment
  3. Use `ssh-keyscan` in CI to get host key and add to known_hosts

---

### CR-4: Plaintext Password Passed to SSH
- **Severity**: Critical
- **Location**: `deploy.sh:8,20`, `ci.yml:450`
- **Description**: `DEPLOY_PASSWORD` is passed as environment variable and used with `sshpass`, exposing it in process listings and shell history.
- **Risk**: Password visible in CI logs (if not masked), in `/proc/*/cmdline`, and in shell history.
- **Evidence**:
  ```bash
  DEPLOY_PASSWORD: ${{ secrets.DEPLOY_PASSWORD }}  # in CI
  export SSHPASS="$SSH_PASS"                        # in deploy.sh
  sshpass -e ssh ...                                # exposes password
  ```
- **Mitigation**:
  1. Use SSH key authentication exclusively, eliminate password-based deploy
  2. If passwords must be used, use `expect` script with `SSH_ASKPASS` to avoid cmdline exposure
  3. GitHub Actions should mask secrets automatically, but verify in workflow logs

---

## High Findings

### HI-1: TURN Server Open to Public Internet
- **Severity**: High
- **Location**: `docker-compose.production.yml:65-67`
- **Description**: TURN server ports 5349 (TCP/UDP) are exposed to the public internet without authentication requirements visible in config.
- **Risk**: Open TURN relay can be abused for DDoS amplification, bandwidth theft, and anonymization of malicious traffic.
- **Evidence**:
  ```yaml
  ports:
    - "5349:5349/udp"
    - "5349:5349/tcp"
  ```
- **Mitigation**:
  1. Restrict TURN port access via firewall (ufw, iptables) to known IP ranges
  2. Use strong authentication for TURN (long-term credentials are enabled but verify strength)
  3. Monitor TURN usage for anomalies
  4. Consider VPN-only access for TURN if possible

---

### HI-2: Weak CIPHER_LIST in Coturn
- **Severity**: High
- **Location**: `turnserver.conf:12`
- **Description**: TLS cipher list includes potentially weak ciphers and uses deprecated naming.
- **Risk**: Downgrade attacks may force use of weaker ciphers.
- **Evidence**:
  ```
  cipher-list=ECDHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256
  ```
- **Mitigation**:
  1. Use modern TLS 1.3-only cipher suites: `TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256`
  2. If TLS 1.2 required: `ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256`
  3. Remove SHA-1 and 3DES based ciphers

---

### HI-3: Default Certbot Email in Production
- **Severity**: High
- **Location**: `docker-compose.production.yml:130`
- **Description**: Default email `admin@example.com` used if `CERTBOT_EMAIL` not set, causing TLS cert issues or misdirected communications.
- **Evidence**:
  ```yaml
  command: certonly --webroot --webroot-path=/var/www/certbot --email ${CERTBOT_EMAIL:-admin@example.com}
  ```
- **Mitigation**:
  1. Make `CERTBOT_EMAIL` a required env var without default
  2. Add validation in entrypoint: `if [ -z "$CERTBOT_EMAIL" ]; then exit 1; fi`

---

### HI-4: Production IP in Frontend Build Arg
- **Severity**: High
- **Location**: `docker-compose.production.yml:45`
- **Description**: Production IP `204.168.181.142` embedded in frontend Docker image build arg.
- **Risk**: Image built with this contains production IP hardcoded, potentially leaked via image layers.
- **Evidence**:
  ```yaml
  args:
    - VITE_API_URL=https://204.168.181.142
  ```
- **Mitigation**:
  1. Use env var at runtime instead of build-time arg
  2. Or use domain name instead of raw IP

---

### HI-5: coturn Container Runs as Root
- **Severity**: High
- **Location**: `docker-compose.production.yml:62`
- **Description**: coturn container explicitly sets `user: "1001:1001"` which is just a UID, not a proper security context. Container still runs as root.
- **Risk**: If container is compromised, attacker has root on host (via container escape).
- **Evidence**:
  ```yaml
  user: "1001:1001"  # This is just UID, not a proper USER directive
  ```
- **Mitigation**:
  1. Use proper Dockerfile `USER` directive with username: `USER coturn`
  2. Create dedicated user in Dockerfile: `RUN adduser -S coturn -u 1001`

---

## Medium Findings

### ME-1: Missing `security-opt` on Multiple Containers
- **Severity**: Medium
- **Location**: `docker-compose.production.yml` (nginx, backend, frontend, certbot)
- **Description**: Only `coturn` service has `no-new-privileges:true`. Other containers lack this hardening.
- **Risk**: Privilege escalation if any container is exploited.
- **Mitigation**: Add to all containers:
  ```yaml
  security_opt:
    - no-new-privileges:true
  ```

---

### ME-2: Missing Resource Limits on Multiple Containers
- **Severity**: Medium
- **Location**: `docker-compose.production.yml` (nginx, certbot)
- **Description**: nginx and certbot have no CPU/memory limits defined.
- **Risk**: Unbounded resource consumption could DoS other services.
- **Mitigation**: Add resource limits to all services per docker-compose.production.yml best practices already used for backend/coturn.

---

### ME-3: No Health Checks on Some Containers
- **Severity**: Medium
- **Location**: `docker-compose.production.yml` (nginx, certbot)
- **Description**: nginx and certbot lack healthcheck definitions.
- **Risk**: Orchestrator may consider container healthy even when it's misconfigured.
- **Mitigation**: Add healthchecks:
  ```yaml
  healthcheck:
    test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/health"]
  ```

---

### ME-4: Unused SSL Certificate Path Mounted
- **Severity**: Medium
- **Location**: `docker-compose.production.yml:97`
- **Description**: `/etc/ssl/peer` mounted to nginx but TLS is terminated at load balancer per comments. If certs missing, nginx won't start.
- **Evidence**:
  ```yaml
  - /etc/ssl/peer:/etc/ssl/peer:ro
  ```
- **Mitigation**: Verify path exists on server, or remove if not used.

---

### ME-5: No Firewall/Network Isolation Config
- **Severity**: Medium
- **Location**: Infrastructure level (not in repo)
- **Description**: No UFW/iptables/firewall rules visible in repo. TURN, HTTP, HTTPS all exposed.
- **Risk**: All services publicly accessible.
- **Mitigation**: Document required firewall rules and optionally add to deploy script.

---

## Low Findings

### LO-1: Unsafe Inline Scripts in CSP
- **Severity**: Low
- **Location**: `nginx.conf:55`
- **Description**: CSP header allows `'unsafe-inline'` for scripts and styles.
- **Risk**: XSS attacks can execute inline scripts.
- **Evidence**:
  ```
  Content-Security-Policy: "default-src 'self'; script-src 'self' 'unsafe-inline'..."
  ```
- **Mitigation**: Use nonces or hashes for inline scripts. If React requires inline styles, use nonces.

---

### LO-2: No Auto-Deploy Verification
- **Severity**: Low
- **Location**: `ci.yml:438-451`
- **Description**: Deploy job doesn't verify application health after deployment completes.
- **Risk**: Failed deployment goes unnoticed.
- **Mitigation**: Add health check step after deploy:
  ```bash
  curl -sf https://204.168.181.142/health || exit 1
  ```

---

### LO-3: Backend `read_only: true` But Has Writable Volume
- **Severity**: Low
- **Location**: `docker-compose.production.yml:19-20,38`
- **Description**: Backend has `read_only: true` but also mounts `backend-data` volume which is writable.
- **Risk**: Contradictory security settings.
- **Mitigation**: Verify if `backend-data` volume is actually needed for persistence.

---

## CI/CD Specific Findings

### CI-1: OWASP ZAP Scan Disabled
- **Severity**: High (in context of security testing program)
- **Location**: `ci.yml:238`
- **Description**: `if: false` disables OWASP ZAP security scanning entirely.
- **Mitigation**: Re-enable when Docker issues on runners are resolved, or run in separate self-hosted runner.

---

### CI-2: No Dependency Security Scanning
- **Severity**: Medium
- **Location**: `ci.yml`
- **Description**: No `npm audit`, `snyk`, or `trivy` dependency scanning in CI.
- **Risk**: Known vulnerabilities in dependencies may reach production.
- **Mitigation**: Add dependency audit step to CI pipeline.

---

### CI-3: Deployment Triggers on Push to Main
- **Severity**: Medium
- **Location**: `ci.yml:441`
- **Description**: Any push to main (including force push, deleted branch, tag push) triggers deployment.
- **Risk**: Accidental or malicious force-push can trigger unintended deployment.
- **Mitigation**: Require PR merges only, or add path filters to only deploy on changes to specific files.

---

## Public Repository Risk Assessment

Given this is a **public repository**, an attacker can:

1. **Reconnaissance**: Know the exact production IP, open ports, and services
2. **Target attacks**: Scan for vulnerabilities in nginx, coturn, node.js
3. **Credential stuffing**: If any leaked credentials match the pattern
4. **Supply chain attacks**: Inject malicious code if maintainer account compromised
5. **Exploit CI/CD**: If GitHub Actions secrets are exposed via log injection

**What they CANNOT do** (if properly secured):
- Access the server without valid credentials
- Read actual secrets stored in GitHub Actions
- Execute code on production without valid SSH credentials

**What MUST be fixed immediately**:
1. Remove hardcoded production IP from all files
2. Disable root SSH login, use deploy user
3. Enable StrictHostKeyChecking
4. Move all secrets to GitHub Actions secrets

---

**CRITICAL OVERRIDE**: All password-based SSH authentication methods (including sshpass) are explicitly rejected due to CR-4. Only SSH key-based authentication via `webfactory/ssh-agent` or equivalent is acceptable for production deployments.

---

## Recommendations (Priority Order)

### Immediate (Before Next Deployment)
1. Regenerate SSH credentials for `root@204.168.181.142`
2. Remove hardcoded IP from all files (use env vars)
3. Create deployment user with limited sudo
4. Enable StrictHostKeyChecking

### Before Production Go-Live
5. Set up firewall rules restricting TURN access
6. Add `no-new-privileges` to all containers
7. Add resource limits to all containers
8. Fix cipher suites to TLS 1.3 only
9. Enable dependency scanning in CI

### Ongoing Hardening
10. Set up monitoring/alerting for failed SSH attempts
11. Implement fail2ban or similar on SSH
12. Regular security audits of dependencies
13. Penetration testing after hardening

---

## Conclusion

This deployment infrastructure has significant security gaps that would allow an informed attacker to:
- Target the production server directly using exposed IP
- Potentially intercept deployments via MITM
- Abuse the open TURN relay server
- Exploit weak container security

**The primary risk is INFORMATION DISCLOSURE** — the production IP and infrastructure layout are not secrets in this public repo.

**Immediate action is required** to remediate CR-1 through CR-4 before this system should handle any sensitive communications.
