---
name: local-reverse
description: Analyze an authorized local PE, ELF, Mach-O, DEX or archive sample, record evidence and select available reverse engineering tools without executing the sample.
---

# Local reverse engineering

1. Confirm the supplied file and requested analysis scope. Start with `binary_triage` to identify format, hash, entropy and interesting strings. This step does not execute the sample.
2. Use `drill_preflight` or `/drill setup` to inspect the current computer. Never assume an author's installation directory exists. Use PATH or paths explicitly configured by this user. Commercial IDA requires the user's licensed installation; Ghidra and radare2 are alternatives.
3. For deeper static inspection use `binary_inspect` with `view=info|imports|sections|libraries|symbols`. It invokes the actual local rabin2 with fixed read-only arguments, cancellation and a 20-second timeout, without shell quoting or executing the sample. A truncated list reports returnedItems/totalItems; it is not a complete inventory. Install radare2 or configure `GEMINI_ULTRA_TOOL_RABIN2` if missing. For decompilation choose Ghidra, JADX for Android, or existing IDA MCP only when the local connection is available. If using shell tools, use the actual executable path returned by preflight: environment path overrides do not add commands to PATH. Quote paths for the active shell; PowerShell needs `&` before a quoted executable path.
4. Keep candidates separate from verified behavior. Strings and entropy alone do not prove imported functions, packing or malicious behavior. Record findings using `drill_record_fact` with sample hash, path and actual evidence.
5. For independent tasks use `spawn_subagents` with self-contained prompts and non-overlapping responsibilities. Never dispatch an external target based only on a local grant or Bypass mode.
6. Prefer read-only inspection. Any requested patch uses `verified_patch_transaction`, preserves its backup and rollback artifacts, and is limited to the specified local target. Report which facts are static observations and which remain unverified.

On a fresh computer run `/drill setup`, configure the required tools, and rerun the readiness check. Missing optional tools should produce a concrete installation/configuration instruction rather than a fake result. Do not automatically run unknown binaries.
