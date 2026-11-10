---
name: local-reverse
description: Analyze an authorized local PE, ELF, Mach-O, DEX or archive sample, record evidence and select available reverse engineering tools without executing the sample.
---

# Local reverse engineering

1. Confirm the supplied file and requested analysis scope. Start with `binary_triage` to identify format, hash, entropy and interesting strings. This step does not execute the sample.
2. Use `drill_preflight` or `/drill setup` to inspect the current computer. Never assume an author's installation directory exists. Use PATH or paths explicitly configured by this user. Commercial IDA requires the user's licensed installation; Ghidra and radare2 are alternatives.
3. For deeper static inspection use `binary_inspect` with `view=info|imports|sections|libraries|symbols`. It invokes the actual local rabin2 with fixed read-only arguments, cancellation and a 20-second timeout, without shell quoting or executing the sample. A truncated list reports returnedItems/totalItems; it is not a complete inventory. Install radare2 or configure `GEMINI_ULTRA_TOOL_RABIN2` if missing. For decompilation choose Ghidra, JADX for Android, or existing IDA MCP only when the local connection is available. If using shell tools, use the actual executable path returned by preflight: environment path overrides do not add commands to PATH. Quote paths for the active shell; PowerShell needs `&` before a quoted executable path.
4. Use `binary_analyze` for static functions, instruction windows and incoming cross-references when native r2 is available. Start with view=functions, then use a numeric virtual address from its result for view=instructions or view=xrefs (address required). No r2 expressions or commands are accepted. Instructions are a bounded window, not a complete function; empty references do not prove no callers exist. The tool does not execute or modify the sample, ignores user startup scripts/plugins, and has 30-second/4-MiB-output/64-MiB-sample limits. Configure `GEMINI_ULTRA_TOOL_R2` or install radare2 when missing. It provides disassembly, not decompilation.
5. Keep candidates separate from verified behavior. Strings and entropy alone do not prove imported functions, packing or malicious behavior. Record findings using `drill_record_fact` with sample hash, path and actual evidence.
6. For independent tasks use `spawn_subagents` with self-contained prompts and non-overlapping responsibilities. Never dispatch an external target based only on a local grant or Bypass mode.
7. Prefer read-only inspection. Any requested patch uses `verified_patch_transaction`, preserves its backup and rollback artifacts, and is limited to the specified local target. Report which facts are static observations and which remain unverified.

On a fresh computer run `/drill setup`, configure the required tools, and rerun the readiness check. Missing optional tools should produce a concrete installation/configuration instruction rather than a fake result. Do not automatically run unknown binaries.
