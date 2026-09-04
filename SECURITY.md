# Security

This project reads local Codex session data on the machine where it runs. It does not upload reports by itself.

- Use `--local-only` (the `$insights` default) when you do not want model calls.
- Review `report.html`, `report.json`, and any timestamped copies in `~/.codex/usage-data/` before sharing them.
- See [docs/privacy-and-trust.md](docs/privacy-and-trust.md) for redaction limits and deletion.

To report a vulnerability, email **mbr63drexel@gmail.com**. Do not open a public issue for credential leaks or undisclosed collector bugs.
