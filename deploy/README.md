# Deploying to AWS

This app is a single Docker container (Node/Express + an on-disk SQLite
file) that needs: a persistent, encrypted volume for the database, HTTPS,
and a way for only you to reach it. The instructions below use a single
small EC2 instance, which is the simplest option that meets all three and
is cheap enough to run continuously (a `t4g.small` is roughly $12–14/mo on-
demand, or less with a savings plan).

**Nothing in this repo has been deployed yet.** Provisioning real AWS
resources costs money and is tied to your account, so do this step
yourself (or ask Claude to do it via the AWS tools, and confirm before it
runs anything that creates billed resources).

## Before you start

1. **Sign the AWS Business Associate Addendum (BAA).** Even though this
   app is designed to hold only de-identified data (see
   `docs/HIPAA-COMPLIANCE.md`), sign the BAA anyway as a safety net — it's
   free and takes five minutes: AWS Console → **AWS Artifact** → Agreements
   → accept the "AWS Business Associate Addendum" for your account. Only
   use the "HIPAA-eligible services" AWS lists once you've signed it (EC2,
   EBS, and everything else this guide uses are on that list).
2. Have an AWS account and, ideally, a domain name you control (needed for
   a real TLS certificate via Let's Encrypt). If you don't have a domain,
   you can still get HTTPS using a free subdomain from a dynamic DNS
   provider, or terminate TLS with an AWS Application Load Balancer + ACM
   certificate instead of the Caddy approach below.

## Architecture

```
Internet ──HTTPS(443)──▶ Caddy (auto TLS) ──▶ App container (127.0.0.1:3000)
                                                     │
                                          Encrypted EBS volume (/app/data)
```

- **Caddy** terminates TLS automatically (Let's Encrypt) and reverse-proxies
  to the app over localhost — the app itself is never exposed directly.
- The EC2 root volume is encrypted by default on modern account settings;
  this guide double-checks that explicitly.
- Security group only opens 443 (and 80, required once for the Let's
  Encrypt handshake) to the world, and 22 (SSH) to your own IP only.
- The 4-digit PIN plus bcrypt hashing, rate limiting, and a 15-minute
  lockout after 5 failed attempts protect the login; a 20-minute idle
  session timeout signs you out automatically.

## Step by step (AWS Console)

1. **Security group** — create one, e.g. `abog-caselist-sg`:
   - Inbound: TCP 443 from `0.0.0.0/0`; TCP 80 from `0.0.0.0/0` (Let's
     Encrypt only); TCP 22 from *your current IP* `/32` only — never
     `0.0.0.0/0` for SSH.
   - Outbound: allow all (default).
2. **Launch an instance**:
   - AMI: Amazon Linux 2023 (arm64 if using `t4g.small`, cheaper than x86).
   - Instance type: `t4g.small` (or `t3.small` on x86).
   - Storage: 20 GiB gp3, confirm **"Encrypted"** is checked.
   - Key pair: create/download one — this is the only way to SSH in.
   - Security group: the one from step 1.
   - IAM role: none required for the basic setup.
3. **Allocate an Elastic IP** and associate it with the instance, so the
   address doesn't change on reboot.
4. **Point your domain's DNS** (an `A` record) at the Elastic IP.
5. **SSH in** and install Docker + Compose:
   ```bash
   sudo dnf install -y docker
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user   # log out/in after this
   DOCKER_COMPOSE_VERSION=v2.29.2
   sudo curl -SL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```
6. **Get the code onto the instance** (clone the repo, or `scp` a tarball)
   and `cd` into it.
7. **Create `.env`** from `.env.example`:
   ```bash
   cp .env.example .env
   # Generate a real session secret:
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   # paste it into SESSION_SECRET in .env
   ```
   Set `TRUST_PROXY=true` and `COOKIE_SECURE=true` in `.env` (Caddy runs
   in front of the app over HTTPS).
8. **Add Caddy** to `docker-compose.yml` (or run it as a separate compose
   file) — see `deploy/Caddyfile` in this folder for a ready-to-use config.
   Update the domain in that file first.
9. **Bring it up**:
   ```bash
   docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
   ```
   (For a quick local smoke test before deploying, run
   `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`
   instead — that publishes port 3000 to your machine without Caddy/TLS.)
10. Visit `https://your-domain`, sign in with PIN **1732**, and
    **immediately change it** from Settings → Change access PIN.
11. **Back up the database.** Turn on **AWS Backup** for the instance's EBS
    volume (daily snapshot, e.g. 30-day retention) so case data survives an
    instance failure — Console → AWS Backup → create a backup plan → assign
    this instance's volume as a resource.

## Updating the app later

```bash
git pull
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
```

The SQLite file lives in the named Docker volume `abog_data` and is
untouched by rebuilds.

## Tighter privacy (optional)

If you want the site unreachable from the open internet entirely (not just
PIN-gated), two options:
- Restrict the security group's port 443 rule to your home/office IP
  ranges instead of `0.0.0.0/0` (simplest, but breaks if your IP changes).
- Put the instance in a private subnet and require an AWS Client VPN or
  Site-to-Site VPN connection to reach it. More setup, but genuinely
  private at the network layer.

## Alternative: AWS Lightsail

If the EC2/security-group steps above feel like too much, **AWS Lightsail**
gives you a similar small VM with a simpler console, a built-in static IP,
and one-click snapshots — the same Docker steps apply once you're SSH'd in.
It costs about the same as a `t4g.small`.
