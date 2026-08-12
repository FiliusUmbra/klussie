# PostgreSQL Client Tools — Windows Installation

**This document owns:** getting `pg_dump`, `pg_restore` and `psql` onto a
Windows machine and verified against Klussie's databases. It exists
because those tools are a prerequisite for
[`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md) and therefore for any
production migration.

**Time required:** about 10 minutes.

> **Status on this project's machine: complete and verified 2026-08-12.**
> PostgreSQL 18.4 client tools installed, `pgpass.conf` working,
> authentication succeeding against both production and staging over the
> session-mode pooler, with no Docker involved. This document is now the
> guide for the *next* machine.

---

## 1 · What is being installed, and what is not

**Client tools only.** `pg_dump`, `pg_restore`, `psql`. No PostgreSQL
server runs on your machine, no service is started, and nothing listens
on a port. The installer offers a server; you will deselect it.

**Docker is not involved.** That is the point — see
[ADR-0017](../adr/0017-free-tier-disaster-recovery-strategy.md).

## 2 · Version requirement — this one matters

Klussie's databases run **PostgreSQL 17.6**. `pg_dump` refuses to dump a
server newer than itself, so **install version 17 or later**. A
PostgreSQL 16 client against this server fails with a version mismatch,
not a warning.

## 3 · Install

### 3.1 · Download

Go to <https://www.postgresql.org/download/windows/> and follow
*"Download the installer"*, which links to EDB's build. Choose **version
17 or later** for Windows x86-64.

> **Installed on this project's machine: PostgreSQL 18.4 client tools**,
> at `C:\Program Files\PostgreSQL\18\bin`. Verified working against the
> 17.6 server — a newer client dumping an older server is supported; the
> reverse is not.

### 3.2 · Run the installer

1. Run the downloaded `.exe`. Accept the User Account Control prompt.
2. **Installation Directory** — accept the default
   (`C:\Program Files\PostgreSQL\17`).
3. **Select Components** — this is the step that matters:

   | Component | Action |
   |---|---|
   | PostgreSQL Server | **Uncheck** |
   | pgAdmin 4 | **Uncheck** (optional GUI, not needed) |
   | Stack Builder | **Uncheck** |
   | **Command Line Tools** | **Keep checked** |

   With the server unchecked, the installer will not ask for a superuser
   password, a port, or a locale. If it does, you left the server
   selected — go back.
4. Complete the install. Decline Stack Builder if it offers to launch.

### 3.3 · Put the tools on your PATH

The installer does not always do this.

1. Press `Win`, type *"environment variables"*, open **Edit the system
   environment variables**.
2. **Environment Variables…** → under **User variables**, select `Path` →
   **Edit** → **New**.
3. Add the `bin` directory, with the version folder matching what you
   installed — on this machine: `C:\Program Files\PostgreSQL\18\bin`
4. OK out of all three dialogs.
5. **Open a new terminal.** Existing terminals keep the old PATH.

> **Not done on this machine as of 2026-08-12.** The tools work but are
> not on PATH, so they are invoked by full path
> (`"C:\Program Files\PostgreSQL\18\bin\pg_dump"`). A two-minute
> convenience, not a blocker — every command in
> [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md) works either way.

### 3.4 · Alternatives

If you use a package manager, `winget` or `scoop` can install the same
tools. Verify the version afterwards with §4 either way — package
managers sometimes lag behind the current major.

## 4 · Verify the installation

```bash
pg_dump --version
pg_restore --version
psql --version
```

Each must report **17.x or higher**. If the command is not found, §3.3
did not take effect or the terminal predates the change.

## 5 · Verify against Klussie

The install is only proven when it can reach a real database. **Use
staging** — it holds no real customer data.

### 5.1 · Connection details

| Field | Value |
|---|---|
| Host | **Per project — see below. Not a constant.** |
| Port | `5432` — **session mode**, required for `pg_dump` |
| Database | `postgres` |
| User | `postgres.<project-ref>` |
| Password | Project Settings → Database → Database password |

> **The pooler host differs per project, even within one region.**
> Two Klussie projects, both `eu-west-1`, sit on different pooler
> clusters. Using the wrong one fails with
> `FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found` — which looks
> like a bad username but is a wrong-host error.

**Verified 2026-08-12:**

| Project | Pooler host |
|---|---|
| `klussie` (production) | `aws-0-eu-west-1.pooler.supabase.com` |
| `klussie-staging` | `aws-1-eu-west-1.pooler.supabase.com` |

**Find it for any project:** Dashboard → Project Settings → Database →
**Connection pooling**. The CLI also writes it to `supabase/.temp/pooler-url`
for whichever project is currently linked.

**Use the pooler, not `db.<project-ref>.supabase.co`.** The direct host
resolves to IPv6, which works on some networks and not others — on this
machine it resolved to `2a05:d018:…` and connected, but that is not
portable. The pooler answers over IPv4. Port **5432** is session mode;
port 6543 is transaction mode and **`pg_dump` will not work against it.**

If you do not have the database password, reset it in Project Settings →
Database. Resetting does not affect the anon key the application uses.

### 5.2 · Smoke test

With `pgpass.conf` in place (§6), `-w` means no password is typed, stored
in history, or prompted for:

```bash
psql -w -h aws-1-eu-west-1.pooler.supabase.com -p 5432 \
     -U postgres.<staging-ref> -d postgres \
     -c "select current_user, version();"
```

**Verified working 2026-08-12** against both projects — returns
`postgres` and `PostgreSQL 17.6`. A successful query means the toolchain
works end to end: tools installed, version compatible, correct pooler
host, session-mode port, and credentials resolved from `pgpass.conf`.

## 6 · Handling the password safely

- **Never** put a database password on a command line — it is visible in
  shell history and to other processes.
- Use `PGPASSWORD` for the duration of a task and `unset` it after, or a
  password file if you prefer it persisted.

**The password file is the better option when someone else — or an
assistant — will run the backup for you**, because the password never
appears in a command, a transcript or a log. Create
`%APPDATA%\postgresql\pgpass.conf` with one line per database:

```
aws-1-eu-west-1.pooler.supabase.com:5432:postgres:postgres.<project-ref>:<password>
```

One line per project (production, staging, any scratch target). `libpq`
finds it automatically, so `pg_dump` and `psql` then need no password
argument at all. The file is read by every Postgres tool on the machine —
treat it as the credential store it is.
- **Never commit it.** `.gitignore` covers `.env*`, but a note-to-self in
  a `.md` or `.sql` file would be committed.
- The staging and production passwords are different. Treat production's
  as the most sensitive credential in the project — it grants full
  read/write to every customer record.

## 7 · Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `pg_dump: command not found` | PATH not applied | §3.3, then a **new** terminal |
| `server version 17.6; pg_dump version 16.x` | Client too old | Install 17+; check §4 |
| Connection times out | Direct IPv6-only host | Use the pooler host (§5.1) |
| `prepared statement ... already exists` | Transaction-mode pooler | Use port **5432**, not 6543 |
| Authentication failed | Wrong username shape | User is `postgres.<project-ref>`, not `postgres` |
| `(ENOTFOUND) tenant/user postgres.<ref> not found` | **Wrong pooler host** — the ref is not a tenant on that cluster | Use the project's own pooler host (§5.1). Not a username problem, despite the message |
| Password prompt in a script | `PGPASSWORD` not exported | §5.2 |

---

Version 1.0 — 2026-08-12 (Epic 00 WP07)
