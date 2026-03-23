# CI/CD Debug Report: SSH Auth Failure in Production Deployment

## 1. Root Cause

The deployment fails with `Permission denied (publickey,password)` because **the `DEPLOY_PASSWORD` secret is not configured in the repository**. When GitHub Actions resolves `${{ secrets.DEPLOY_PASSWORD }}` and the secret does not exist, it expands to an **empty string** — not an unset variable. The shell script sees an empty `DEPLOY_PASSWORD`, skips the `sshpass` code path, and falls back to key-based auth. The GitHub Actions runner has no SSH private key configured, so the SSH connection is rejected immediately.

The error trace shows the script prints `Warning: DEPLOY_PASSWORD not set. Using key-based auth if available.` — confirming the password is not reaching the remote.

## 2. Current State

| Item | Status |
|---|---|
| `DEPLOY_PASSWORD` secret in repo | **NOT CONFIGURED** — must be added (but see Note below) |
| SSH private key on runner | **NOT CONFIGURED** — no `ssh-agent` or key file present |
| `DEPLOY_PASSWORD` in `deploy.sh` | Empty fallback → key-based auth → fails |
| CI deploy job env block | Correctly references `${{ secrets.DEPLOY_PASSWORD }}` but the secret does not exist |

> **Security Note**: Password-based SSH authentication is rated CRITICAL severity by the security audit. SSH key authentication via `ssh-agent` is the **only acceptable deployment method**. `DEPLOY_PASSWORD` should not be used.

The deploy job at line 448-451 in `ci.yml` passes the secret correctly — the issue is purely that the secret value is unconfigured and key auth is also missing.

## 3. Recommended Fix: SSH Key Auth with `ssh-agent` (Only Acceptable Method)

### Step 1 — Generate a dedicated deploy key on the server

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
```

### Step 2 — Add the private key as a GitHub Actions secret

- Name: `DEPLOY_SSH_KEY`
- Value: contents of `~/.ssh/deploy_key`

### Step 3 — Update `ci.yml` deploy step

```yaml
- name: Setup SSH key
  uses: webfactory/ssh-agent@v0.9.0
  with:
    ssh-private-key: ${{ secrets.DEPLOY_SSH_KEY }}

- name: Fetch host key for known_hosts
  run: |
    mkdir -p ~/.ssh
    ssh-keyscan -t ed25519, rsa 204.168.181.142 >> ~/.ssh/known_hosts 2>/dev/null

- name: Deploy to server
  run: ./deploy.sh
```

> **Note**: `StrictHostKeyChecking=no` was previously used as a convenience, but it introduces a MITM risk. Using `ssh-keyscan` to populate `known_hosts` is the secure equivalent — host keys are verified on every subsequent connection.

### Step 4 — Update `deploy.sh` to detect agent auth

```bash
# If SSH_AUTH_SOCK is set (from ssh-agent), prefer agent-based auth
if [ -n "$SSH_AUTH_SOCK" ]; then
    SSH_CMD="ssh -o StrictHostKeyChecking=yes -o AddKeysToAgent=yes"
    SCP_CMD="scp -o StrictHostKeyChecking=yes"
    echo "Using SSH agent for key-based auth."
fi
```

Note: `StrictHostKeyChecking=yes` (the default) will fail if the host key is not in `known_hosts` — this is intentional and secure. The `ssh-keyscan` step in CI populates this before the deploy script runs.

## 4. `deploy.sh` Improvements Applied

The following improvements have been applied to `deploy.sh`:

- **Pre-flight connectivity check** before any SSH operation
- **ERR trap with step tracking** so failures report which step failed
- **Explicit auth failure detection** when neither password nor key auth is available — script now fails immediately with a clear message instead of silently falling through to a failing SSH attempt
- **Better fallback messaging** directing users to use SSH key auth

## 5. Summary of Required Actions

| Step | Owner | Action |
|---|---|---|
| 1 | Server | Generate deploy key: `ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""` and add pub key to `authorized_keys` |
| 2 | Repo admin | Add `DEPLOY_SSH_KEY` secret with the private key contents |
| 3 | CI/CD | Update `ci.yml` deploy step to use `webfactory/ssh-agent` + `ssh-keyscan` for known_hosts |
| 4 | CI/CD | Update `deploy.sh` with pre-flight checks, ERR trap, and improved error messaging (changes applied) |

The root cause is: **the `DEPLOY_PASSWORD` secret does not exist in the repository** (and password auth is not acceptable anyway), and no SSH key is configured for the CI runner.
