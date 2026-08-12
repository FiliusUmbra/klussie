# PostgreSQL Client Tools — Windows Installation

**This document owns:** getting `pg_dump`, `pg_restore` and `psql` onto a
Windows machine and verified against Klussie's databases. It exists
because those tools are a prerequisite for
[`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md) and therefore for any
production migration.

**Time required:** about 10 minutes.

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
17** for Windows x86-64.

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
3. Add: `C:\Program Files\PostgreSQL\17\bin`
4. OK out of all three dialogs.
5. **Open a new terminal.** Existing terminals keep the old PATH.

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
| Host | `aws-1-eu-west-1.pooler.supabase.com` |
| Port | `5432` — **session mode**, required for `pg_dump` |
| Database | `postgres` |
| User | `postgres.<project-ref>` |
| Password | Project Settings → Database → Database password |

**Use the pooler, not `db.<project-ref>.supabase.co`.** The direct host
may resolve to IPv6 only, which many Windows networks cannot reach. The
pooler is reachable over IPv4, and port **5432** is session mode — port
6543 is transaction mode and **`pg_dump` will not work against it.**

If you do not have the database password, reset it in Project Settings →
Database. Resetting does not affect the anon key the application uses.

### 5.2 · Smoke test

Set the password in the environment rather than typing it into a command
line, so it does not land in your shell history:

```bash
export PGPASSWORD='<staging-database-password>'

psql -h aws-1-eu-west-1.pooler.supabase.com -p 5432 \
     -U postgres.<staging-ref> -d postgres \
     -c "select count(*) from public.service_requests;"
```

A row count means the toolchain works end to end.

```bash
unset PGPASSWORD
```

## 6 · Handling the password safely

- **Never** put a database password on a command line — it is visible in
  shell history and to other processes.
- Use `PGPASSWORD` for the duration of a task and `unset` it after, or a
  `%APPDATA%\postgresql\pgpass.conf` file if you prefer it persisted.
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
| Password prompt in a script | `PGPASSWORD` not exported | §5.2 |

---

Version 1.0 — 2026-08-12 (Epic 00 WP07)
