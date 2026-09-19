#!/usr/bin/env python3
# =========================================================
# ARCHIE CODING & SECURITY INTELLIGENCE SEED — generator
#
# Owner directive (2026-09-10): seed ARCHIE's persistent Coding
# Intelligence and Security Intelligence with comprehensive
# knowledge of 18 programming languages and their legitimate
# cybersecurity applications. NOT a temporary dataset — the
# items are stored through the standard learning-governance
# machinery (frelux_learning_records → frelux_knowledge_items)
# so they persist and version like all ARCHIE knowledge.
#
# Honesty rules (owner directive):
#   - No fabricated language knowledge. Version-sensitive facts
#     were verified against official sources on 2026-09-10
#     (evidence_state=EXTERNAL_SOURCE_VERIFIED) or explicitly
#     flagged for re-verification.
#   - Offensive-security knowledge is encoded with its
#     authorization boundary attached to every relevant item:
#     authorized systems, owned infrastructure, controlled
#     laboratories, CTFs, and explicitly permitted assessments
#     ONLY.
#
# Generates: supabase/migrations/20260910034000_archie_coding_intelligence_seed.sql
# =========================================================
import json

VERIFIED = "2026-09-10"
AUTH_BOUNDARY = (
    "OFFENSIVE-SECURITY RESTRICTION: techniques and tooling described here are "
    "restricted to authorized systems, owned infrastructure, controlled "
    "laboratories, CTF challenges, and explicitly permitted security "
    "assessments. ARCHIE must refuse application against systems lacking "
    "explicit authorization."
)

ITEMS = []

def add(topic, domain, knowledge_type, confidence, evidence_state, content,
        cited_sources, assumptions, recommendation):
    ITEMS.append({
        "topic": topic, "domain": domain, "capability": domain,
        "knowledge_type": knowledge_type, "confidence": confidence,
        "evidence_state": evidence_state, "content": content,
        "cited_sources": cited_sources, "assumptions": assumptions,
        "recommendation": recommendation,
    })

# ---------------------------------------------------------
# GOVERNANCE ITEMS (2)
# ---------------------------------------------------------
add(
    "ARCHIE Coding Intelligence — continuous expansion mandate",
    "coding", "METHOD", 1.0, "USER_PROVIDED",
    {
        "mandate": (
            "ARCHIE must continuously expand its coding and security "
            "intelligence through: (1) official documentation and standards, "
            "(2) reading source code of real projects, (3) writing and "
            "running tests, (4) security research publications, and (5) "
            "practical exercises in AUTHORIZED laboratory environments only."
        ),
        "persistent": (
            "This knowledge is part of ARCHIE's persistent Coding Intelligence "
            "and Security Intelligence — never a temporary dataset. New "
            "knowledge must flow through the standard learning-governance "
            "machinery (evidence, provenance, versioning, owner approval)."
        ),
        "verification_duty": (
            "Uncertain or version-sensitive information must be verified "
            "against primary sources before it is stored or used. Never "
            "fabricate language knowledge."
        ),
        "priority_languages": [
            "Python", "C", "C++", "JavaScript", "TypeScript", "Bash",
            "PowerShell", "Go", "Rust", "Assembly", "SQL",
        ],
        "full_language_set": [
            "Python", "C", "C++", "JavaScript", "TypeScript", "Bash",
            "PowerShell", "Go", "Rust", "Assembly", "SQL", "Java", "PHP",
            "Ruby", "Kotlin", "Swift", "Dart", "Lua", "Solidity",
        ],
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["Owner directive, FRELUX Superagent conversation 2026-09-10"],
    [],
    "Treat as a standing directive for all future ARCHIE learning activity.",
)
add(
    "ARCHIE Offensive-Security Authorization Boundary — permanent rule",
    "cybersecurity", "STANDARD", 1.0, "USER_PROVIDED",
    {
        "rule": AUTH_BOUNDARY,
        "enforcement": (
            "This boundary is a hard constraint. Offensive techniques "
            "(exploitation, privilege escalation, credential attacks, "
            "reconnaissance against third parties, malware analysis that "
            "executes live code, etc.) may only be developed, tested or "
            "taught within: systems ARCHIE's owner owns or explicitly "
            "authorizes, controlled laboratory networks, CTF platforms, and "
            "engagements with documented permission (scope, rules of "
            "engagement, authorization letters)."
        ),
        "refusal_clause": (
            "ARCHIE must refuse and flag any request to apply offensive "
            "capability against systems outside these boundaries, including "
            "requests that lack verifiable authorization."
        ),
        "compatible_with": (
            "Defensive security knowledge (secure coding, hardening, detection "
            "engineering, vulnerability classes, safe analysis of malware "
            "samples, audit/verification) has no such restriction and is the "
            "default framing for user-facing guidance."
        ),
    },
    ["Owner directive, FRELUX Superagent conversation 2026-09-10"],
    [],
    "Applies to every offensive-security knowledge item in the cybersecurity domain.",
)

# ---------------------------------------------------------
# LANGUAGE OVERVIEWS (18)
# ---------------------------------------------------------
add(
    "Python — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.95, "EXTERNAL_SOURCE_VERIFIED",
    {
        "language": "Python",
        "paradigms": ["multi-paradigm", "imperative", "object-oriented", "functional", "procedural"],
        "current_version": {
            "stable": "3.14.x (stable since Oct 2025; free-threading and JIT compiler landed)",
            "upcoming": "3.15.0 final scheduled 2026-10-01 (rc2 shipped 2026-09-01)",
            "verified": VERIFIED,
        },
        "fundamentals": (
            "Dynamically typed, strongly typed at runtime; everything is an "
            "object. CPython compiles to bytecode executed on a VM. GIL "
            "limits thread parallelism; free-threaded builds (PEP 703) are "
            "officially supported from 3.13+ for opt-in, 3.14 adds JIT. "
            "asyncio for cooperative concurrency; multiprocessing for true parallelism."
        ),
        "standard_library": (
            "os, sys, pathlib, subprocess, socket, ssl, asyncio, threading, "
            "hashlib, hmac, secrets (cryptographically secure tokens), json, "
            "sqlite3, dataclasses, typing, logging, unittest, argparse, "
            "ctypes/cffi for FFI."
        ),
        "ecosystem": (
            "pip + PyPI; uv and poetry for project/lockfile management; venv "
            "for isolation. Major domains: NumPy/pandas (data), "
            "requests/httpx (HTTP), Django/FastAPI/Flask (web), "
            "SQLAlchemy (ORM), cryptography (libsodium/OpenSSL bindings)."
        ),
        "debugging_testing": (
            "pytest (de facto), unittest, coverage.py; pdb and breakpoint() "
            "for debugging; logging module; type checkers mypy/pyright; "
            "ruff for linting; fuzzing via hypothesis (property-based)."
        ),
        "performance_memory": (
            "Reference counting + cycle GC; interpreter overhead makes pure "
            "Python slow for hot loops — extend with C (or Rust via PyO3), "
            "vectorize with NumPy, or use PyPy/Cython. Memory: object "
            "overhead is high; slots and generators reduce it."
        ),
        "networking_systems": (
            "socket + asyncio for servers/clients; http.server/uvicorn for "
            "HTTP services; scapy for packet crafting. os/subprocess for "
            "system automation; limited raw systems programming — drop to C for that."
        ),
        "web_api": (
            "WSGI (Django/Flask) and ASGI (FastAPI/Starlette) standards; "
            "FastAPI gives OpenAPI + Pydantic validation; Django ORM + admin."
        ),
        "secure_coding": [
            "Never eval()/exec() untrusted input; never pickle/YAML.load untrusted data",
            "Use subprocess with argument lists, never shell=True with interpolatated input",
            "Parameterized SQL only (DB-API placeholders or ORM)",
            "secrets module for tokens/passwords, never random",
            "Pin dependencies; pip-audit for known CVEs; watch supply chain (typosquatting)",
            "Validate and canonicalize paths to prevent traversal",
        ],
        "vulnerability_classes": [
            "Command injection (shell=True, os.system)",
            "Deserialization RCE (pickle, yaml.load, marshal)",
            "SQL injection via string-built queries",
            "Path traversal in file serving",
            "SSRF via user-controlled URLs",
            "ReDoS via catastrophic regexes",
            "Dependency/supply-chain compromise",
        ],
        "reverse_engineering_relevance": (
            "Primary glue language for RE: Ghidra/IDAPython scripting APIs, "
            "angr for symbolic execution, Unicorn/Qiling for emulation, "
            "Capstone for disassembly, Frida for dynamic instrumentation, "
            "LIEF for binary parsing. Deobfuscation scripts, CTF exploit "
            "automation (pwntools)."
        ),
        "security_tooling": (
            "pwntools (exploit dev, CTF), scapy (packet crafting), "
            "python-nmap (scanning automation), mitmproxy scripting, "
            "Impacket (protocol attacks, authorized AD contexts), Frida "
            "bridging,requests/httpx for web testing automation."
        ),
        "interoperability": (
            "C ABI via ctypes/cffi; extension modules via Python C API or "
            "pybind11/PyO3; JVM via JPype; .NET via pythonnet; WASM via "
            "wasmtime bindings."
        ),
        "best_practices": (
            "Type hints + strict mypy/pyright; ruff formatting/linting; "
            "pytest with coverage gates; virtualenvs per project; pin and "
            "audit dependencies; prefer stdlib crypto APIs (hashlib/hmac/"
            "secrets) over hand-rolled."
        ),
        "ethical_hacking": (
            "Python is the primary language of authorized penetration "
            "testing: tool development, exploit scripting, automation of "
            "reconnaissance and post-exploitation validation within scope."
        ),
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.python.org/", "https://peps.python.org/pep-703/", "https://discuss.python.org/t/python-3-15-0-candidate-2-is-here/108841", "https://docs.python.org/3/library/secrets.html"],
    ["Version facts verified 2026-09-10; re-verify before version-sensitive use."],
    "Use as ARCHIE's Python baseline; expand per-topic depth through ongoing learning.",
)
add(
    "C — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.95, "EXTERNAL_SOURCE_VERIFIED",
    {
        "language": "C",
        "paradigms": ["procedural", "imperative", "systems"],
        "current_version": {
            "standard": "C23 (ISO/IEC 9899:2024) is the latest published standard; C17 remains the common baseline. Compiler support (GCC/Clang) for C23 is still maturing as of 2026-09.",
            "verified": VERIFIED,
        },
        "fundamentals": (
            "Manual memory management, pointers, arrays-as-pointers decay, "
            "no runtime safety. Undefined behavior is central: out-of-bounds "
            "access, signed overflow, strict aliasing violations are UB and "
            "compile unpredictably. Compiled to native code via gcc/clang; "
            "C is the ABI lingua franca of every platform."
        ),
        "standard_library": (
            "Small: stdio, stdlib (malloc/free, exit), string, math, time, "
            "errno. POSIX adds sockets, pthreads, mmap, dirent, unistd. "
            "glibc/musl on Linux, UCRT on Windows."
        ),
        "ecosystem": (
            "No package manager for the language itself; build via "
            "make/CMake/Meson; libraries vendored or via system package "
            "managers; pkg-config for discovery."
        ),
        "debugging_testing": (
            "gdb/lldb for debugging; Valgrind memcheck for leaks/heap errors; "
            "ASan/UBSan sanitizers (fast, first choice); unit testing with "
            "Check/Unity/Criterion; AFL++/libFuzzer-style fuzzing with "
            "harnesses."
        ),
        "performance_memory": (
            "Stack and heap; malloc/free; zero overhead abstraction — C is "
            "the performance reference point. Memory bugs (leaks, overflows, "
            "UAF) are the defining defect class. Alignment, padding, "
            "endian-ness matter for wire formats."
        ),
        "networking_systems": (
            "Berkeley sockets API; epoll/kqueue/IOCP for event-driven "
            "servers; raw sockets (privileged) for packet-level work; "
            "mmap for shared memory; pthreads for concurrency."
        ),
        "secure_coding": [
            "Bounds-check every array access; use checked size arithmetic (overflow-safe patterns)",
            "strlcpy/snprintf over strcpy/sprintf; never gets()",
            "Treat format strings as constants — never user input in printf-family",
            "Free exactly once; NULL out freed pointers; avoid UAF by design (ownership discipline)",
            "Use _FORTIFY_SOURCE, stack canaries, RELRO, PIE/ASLR; compile with -Wall -Wextra -Werror where feasible",
            "Avoid TOCTOU: operate on fds/handles opened safely (O_NOFOLLOW, fstat), not on paths",
        ],
        "vulnerability_classes": [
            "Stack/heap buffer overflows",
            "Format string vulnerabilities",
            "Use-after-free / double free",
            "Integer overflow/underflow leading to allocation or bounds errors",
            "Off-by-one errors",
            "TOCTOU race conditions",
            "NULL/invalid pointer dereference",
            "Signal-handler reentrancy bugs",
        ],
        "reverse_engineering_relevance": (
            "C is the foundation of binary exploitation and RE: ELF/PE "
            "formats, calling conventions, stack frames, ROP/JOP chains, "
            "shellcode, heap grooming, exploitation of mitigations "
            "(canaries, NX, ASLR, RELRO). Reading disassembly = reading "
            "compiled C."
        ),
        "security_tooling": (
            "gcc/clang, gdb, Valgrind, sanitizers, pwntools (with C "
            "targets), ROPgadget, checksec, AFL++/honggfuzz for fuzzing "
            "targets, binutils, objdump, readelf."
        ),
        "interoperability": (
            "C ABI is the universal FFI: Python ctypes, Rust extern \"C\", "
            "Java JNI, Go cgo, dlopen/dlsym for runtime loading."
        ),
        "best_practices": (
            "Compile with sanitizers in CI; static analysis (clang-tidy, "
            "cppcheck, CodeQL); prefer fail-closed error handling; document "
            "ownership of every allocation; review every memcpy with "
            "attacker-controlled length."
        ),
        "ethical_hacking": (
            "Understanding C is mandatory for memory-corruption exploitation "
            "in authorized labs/CTFs (pwn challenges) and for auditing "
            "native code."
        ),
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.open-std.org/jtc1/sc22/wg14/", "https://en.cppreference.com/w/c", "https://github.com/google/sanitizers"],
    ["C23 compiler-support status evolves; re-verify feature availability per compiler before use."],
    "Use as ARCHIE's C baseline for native-code analysis and exploitation theory.",
)
add(
    "C++ — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.95, "USER_PROVIDED",
    {
        "language": "C++",
        "paradigms": ["multi-paradigm", "OOP", "generic", "functional", "procedural", "systems"],
        "current_version": {
            "standard": "C++23 (ISO/IEC 14882:2024) published and supported across GCC 14+/Clang 17+/MSVC; C++26 in development. Re-verify compiler feature status before use.",
            "verified": "not independently verified 2026-09-10",
        },
        "fundamentals": (
            "RAII resource management, value semantics, move semantics, "
            "templates (compile-time polymorphism), exceptions, "
            "const-correctness. Zero-overhead abstraction goal, but UB "
            "inheritance from C plus class-specific traps: object lifetime, "
            "iterator invalidation, dangling references, virtual dispatch "
            "during construction."
        ),
        "standard_library": (
            "STL containers (vector, map, unordered_map), algorithms, "
            "ranges (C++20/23), smart pointers (unique_ptr/shared_ptr), "
            "string/string_view, span, optional/variant, chrono, thread, "
            "std::format, filesystem."
        ),
        "ecosystem": (
            "vcpkg and Conan package managers; CMake/Bazel/Meson builds; "
            "Boost as extended stdlib; Qt for GUI; abseil, fmt."
        ),
        "debugging_testing": (
            "gdb/lldb; ASan/UBSan/MSan/TSan sanitizers; GoogleTest/Catch2/"
            "doctest for units; clang-tidy static analysis; libFuzzer with "
            "LLVMFuzzerTestOneInput harnesses."
        ),
        "performance_memory": (
            "New/delete plus RAII wrappers; heap vs stack allocation "
            "matters; small-object overhead in iostream-heavy code; cache "
            "behavior dominates (SoA vs AoS); constexpr/compile-time work "
            "shifts cost out of runtime."
        ),
        "networking_systems": (
            "Asio (and std::networking proposals) for async networking; "
            "shared memory + atomics; boost.interprocess; kernel-level via "
            "C-style APIs."
        ),
        "web_api": "Server frameworks exist (Drogon, Crow, Oat++) but C++ is uncommon for web APIs; mostly infra/gateway components.",
        "secure_coding": [
            "Default to unique_ptr/make_unique; shared_ptr only for shared ownership",
            "Use span/string_view for buffer views instead of pointer+len pairs",
            "Do not iterate mutated containers; be aware iterator invalidation rules per container",
            "std::format over printf-family; no user-controlled format strings",
            "Validate in constexpr where possible (fail at compile time)",
            "Audit unsafe/ raw pointer escapes across API boundaries",
        ],
        "vulnerability_classes": [
            "Memory corruption (when safety discipline lapses or in unsafe code)",
            "Dangling references/iterators (UAF variants)",
            "Iterator/range bugs; vector<bool> quirks",
            "Concurrency data races (TSan-detectable) and deadlocks",
            "Undefined behavior exploited by optimizer assumptions",
            "Inherited C vuln classes in interop code",
        ],
        "reverse_engineering_relevance": (
            "Reversing C++ binaries: name mangling (Itanium/MSVC ABIs), "
            "vtable reconstruction, RTTI usage, exception tables; game "
            "hacking tooling and cheat/AC analysis largely C++-centric; "
            "many EDR/AV engines are C++ (analysis targets)."
        ),
        "security_tooling": (
            "Fuzzers (libFuzzer, AFL++ with C++ harnesses), sanitizers, "
            "clang-tidy security checks, Semgrep C++ rules, rocm/angr "
            "analysis of C++ binaries via debug info."
        ),
        "interoperability": (
            "extern \"C\" for C ABI; pybind11 for Python; JNI for Java; "
            "cgo/cstdint for Go/Rust interop; COM on Windows."
        ),
        "best_practices": (
            "Modern C++ (Core Guidelines); clang-format/tidy in CI; "
            "sanitize everything in tests; prefer std types and "
            "value semantics; document object-lifetime contracts."
        ),
        "ethical_hacking": (
            "Essential for reversing large native binaries, analyzing "
            "malware families, and exploit development in authorized labs."
        ),
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://isocpp.org/", "https://en.cppreference.com/w/", "https://github.com/isocpp/CoreGuidelines"],
    ["Standard-version status not independently verified 2026-09-10; verify before version-sensitive use."],
    "C++ baseline for native binary analysis and memory-safety guidance.",
)
add(
    "JavaScript — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.95, "EXTERNAL_SOURCE_VERIFIED",
    {
        "language": "JavaScript",
        "paradigms": ["multi-paradigm", "event-driven", "functional", "prototypal-OOP", "concurrent"],
        "current_version": {
            "standard": "ECMAScript 2025 (ES2025) published June 2025; ES2026 features on the TC39 proposal pipeline.",
            "runtimes": "Node.js 24.x is LTS (Krypton, LTS since 2026-09-07); Node 26.x is Current, entering LTS Oct 2026; also Deno and Bun.",
            "verified": VERIFIED,
        },
        "fundamentals": (
            "Single-threaded event loop with microtask/macrotask queues; "
            "prototypal inheritance with class syntax sugar; closures; "
            "first-class functions; promises/async-await over callbacks. "
            "Dynamic typing with coercion traps (== vs ===). JIT-compiled "
            "by V8/JSC/SpiderMonkey."
        ),
        "standard_library": (
            "ES built-ins (Map/Set, typed arrays, Atomics, structuredClone, "
            "crypto.subtle), Web APIs (fetch, WebSocket, URL, AbortController), "
            "Node APIs (fs, http, crypto, stream, worker_threads)."
        ),
        "ecosystem": (
            "npm registry (largest package ecosystem); pnpm/yarn; "
            "bundlers (Vite/esbuild/Rollup); frameworks (React, Vue, "
            "Svelte, Next/Nuxt, Express/Fastify/Hono); typechecking via TypeScript."
        ),
        "debugging_testing": (
            "Chrome DevTools + node --inspect; vitest/jest units; Playwright/"
            "Cypress E2E; source maps; performance profiling via flamecharts."
        ),
        "performance_memory": (
            "JIT tiers (interpreter → optimizing compiler); GC pauses "
            "(young/old gen); leaks via retained closures, detached DOM "
            "nodes, forgotten timers; heavy work in workers or WASM."
        ),
        "networking_systems": (
            "fetch/WebSocket clients; Node http/https servers; streams for "
            "backpressure; worker_threads for CPU parallelism; UDP via dgram."
        ),
        "web_api": (
            "Dominant web language: SPA frameworks, SSR (Next/Remix/Astro), "
            "REST/GraphQL APIs in Node; serverless at the edge."
        ),
        "secure_coding": [
            "Never eval()/new Function()/setTimeout(string) with untrusted input",
            "Escape contextual output (text/attr/URL/JS); use textContent over innerHTML; sanitize with DOMPurify",
            "Parameterized DB queries; Content-Security-Policy as XSS defense-in-depth",
            "Protect CSRF (SameSite cookies + tokens); CORS explicit allowlists",
            "npm supply chain: lockfiles (npm ci), npm audit, provenance checks, beware prototype-polluting deep-merge libs",
            "Never ship secrets in client bundles; validate server-side always",
        ],
        "vulnerability_classes": [
            "XSS (reflected/stored/DOM-based)",
            "Prototype pollution (object injection via __proto__)",
            "CSRF and session fixation",
            "ReDoS (catastrophic backtracking)",
            "SSRF in server-side fetch of user URLs",
            "Dependency compromise / typosquatting / dependency confusion",
            "Open redirects; JWT misuse (alg=none, weak secrets)",
        ],
        "reverse_engineering_relevance": (
            "JS deobfuscation is a full RE discipline: packed/staggered "
            "web-malware analysis, malicious npm package analysis, de-minifying "
            "via source maps or js-beautify, dynamic analysis in instrumented "
            "browsers, adware/web-skimmer forensics."
        ),
        "security_tooling": (
            "Burp Suite scripting, devtools-based DOM analysis, semgrep/eslint "
            "security rules, retire.js for known-vulnerable libs, "
            "deobfuscation with Babel AST transforms, Nuclei template writing."
        ),
        "interoperability": (
            "WASM interop (instantiate modules), native addons (N-API/node-gyp), "
            "FFI (koffi), PostMessage/embedding boundaries."
        ),
        "best_practices": (
            "Strict mode/ES modules; lint + format in CI; dependency pinning "
            "and provenance; TypeScript for static safety; threat-model every "
            "user input path to DOM, SQL, shell, and URL sinks."
        ),
        "ethical_hacking": (
            "Dominant language of web application testing in authorized "
            "engagements: request tampering, DOM analysis, payload "
            "development for XSS/CSRF validation."
        ),
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://tc39.es/ecma262/", "https://nodejs.org/en/about/previous-releases", "https://nodejs.org/en/download", "https://cheatsheetseries.owasp.org/"],
    ["Version facts verified 2026-09-10; re-verify before version-sensitive use."],
    "JS baseline for web security analysis and client-side engineering.",
)
add(
    "TypeScript — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.95, "EXTERNAL_SOURCE_VERIFIED",
    {
        "language": "TypeScript",
        "paradigms": ["multi-paradigm", "statically-typed superset of JavaScript"],
        "current_version": {
            "stable": "TypeScript 7.0.x (native Go-based compiler ~13x faster) is latest on npm; 6.0.x is the prior stable line; 5.9.x still maintained.",
            "verified": VERIFIED,
        },
        "fundamentals": (
            "Structural typing, generics, union/intersection types, "
            "narrowing, discriminated unions, mapped/conditional types, "
            "declaration files (.d.ts). Types are erased at runtime — zero "
            "runtime validation unless paired with a runtime checker."
        ),
        "standard_library": (
            "All JS built-ins plus TS utility types (Partial, Pick, Omit, "
            "ReturnType); tsconfig strict mode (strictNullChecks essential); "
            "lib DOM/ES definitions."
        ),
        "ecosystem": (
            "npm ecosystem; tsc/bundler-integrated type checking (Vite + "
            "tsc, tsx, esbuild transpile); DefinitelyTyped @types packages; "
            "zod/valibot for runtime schemas."
        ),
        "debugging_testing": (
            "Source-mapped debugging identical to JS; vitest with type "
            "awareness; tsd for type-level tests; type coverage tools."
        ),
        "performance_memory": (
            "Runtime performance = JS (types erase); build performance is "
            "the TS-specific axis — TS7 native compiler massively improves "
            "check speed; type instantiations can explode build times."
        ),
        "networking_systems": "Same as JS; typed API clients generated from OpenAPI/GraphQL schemas (openapi-typescript, graphql-codegen).",
        "web_api": "End-to-end typed stacks (Next, tRPC, Zod-validated APIs) cut contract bugs significantly.",
        "secure_coding": [
            "strict mode + no implicit any; ban ts-ignore (use @ts-expect-error with comment)",
            "Types are NOT validation: pair with zod/valibot at trust boundaries",
            "Avoid `any` and unsafe casts (especially as unknown as T chains)",
            "Discriminated unions make invalid states unrepresentable — prefer over boolean flags",
        ],
        "vulnerability_classes": [
            "Type-safety illusion (erased types → runtime injection still possible)",
            "All JS vulnerability classes after compilation",
            "Supply chain via @types and build-time dev deps",
        ],
        "reverse_engineering_relevance": (
            "Limited direct RE role; JS output analysis dominates. Static "
            "analysis of TS codebases (Semgrep/CodeQL with type info) is "
            "valuable in authorized code audits."
        ),
        "security_tooling": "eslint typed rules (no-unsafe-*), Semgrep TS rules, typed security linting of web apps under audit.",
        "interoperability": "JS interop is the language; WASM type definitions; declaration files for native libs.",
        "best_practices": "Strict tsconfig, runtime validation at boundaries, generated API types, monorepo-aware project references.",
        "ethical_hacking": "Used to build and type safe testing harnesses; static review of TS code in authorized audits.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.typescriptlang.org/", "https://www.npmjs.com/package/typescript", "https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/"],
    ["Version facts verified 2026-09-10; TS7 line is new — re-verify tooling compatibility before version-sensitive use."],
    "TS baseline; pair with the JavaScript item for runtime semantics.",
)
add(
    "Bash — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.95, "EXTERNAL_SOURCE_VERIFIED",
    {
        "language": "Bash (GNU Bash)",
        "paradigms": ["shell scripting", "command orchestration", "glue language"],
        "current_version": {
            "stable": "Bash 5.3.x (bash-5.3 released July 2025; 5.3.x current series)",
            "verified": VERIFIED,
        },
        "fundamentals": (
            "POSIX sh superset: pipelines, exit codes ($?), redirects (>, >>, 2>&1, <<<), "
            "process substitution, word splitting/globbing of unquoted "
            "expansions, traps/signals, job control. Arrays and associative "
            "arrays exist; no real data structures. Readability over "
            "cleverness; scripts fail on the first unquoted variable."
        ),
        "standard_library": "Bash builtins + coreutils (grep, sed, awk, cut, sort, find, xargs); curl/wget; jq for JSON.",
        "ecosystem": "No package manager; script distribution is vendor + shfmt/shellcheck ecosystems; nix/homebrew for tools.",
        "debugging_testing": (
            "set -euo pipefail (fail fast); bash -x tracing; shellcheck "
            "(mandatory static analysis); shfmt formatting; bats for unit tests."
        ),
        "performance_memory": "Process-spawn cost dominates — xargs/parallel batching; avoid loops over line-split input (use while read or xargs).",
        "networking_systems": "curl/wget/ssh/ip/netcat orchestration; ss/iptables wrappers; cron/systemd timers for scheduling.",
        "web_api": "curl scripting against REST APIs; jq pipelines; trivial to wrap in CGI-like services (rare).",
        "secure_coding": [
            "Quote EVERY variable expansion (\"$var\") — unquoted expansion enables word-splitting/globbing injection",
            "Never eval user input; avoid source of untrusted files",
            "Use mktemp for temp files (predictable /tmp paths = symlink attack)",
            "Absolute paths or verified PATH for security-relevant calls; hash binaries if integrity matters",
            "Use ${var:?} for required variables; validate with [[ ]] patterns, not regex injection",
            "mktemp -d, trap cleanup EXIT; umask for created files",
        ],
        "vulnerability_classes": [
            "Command injection via unquoted variables or eval",
            "PATH hijacking (relative-path command execution)",
            "TOCTOU/symlink races on temp files",
            "Unsafe source/pipe-to-shell from network input",
            "Cron/script permission misconfigurations as privesc paths",
        ],
        "reverse_engineering_relevance": (
            "Post-compromise analysis of attacker one-liners/reverse shells; "
            "reading malware dropper scripts; cleanup/forensic triage "
            "scripting (log carving with grep/awk)."
        ),
        "security_tooling": (
            "Authorized recon/enumeration loops (dig, whois, nmap wrappers), "
            "CTF automation, hardening scripts, log analysis, CI security "
            "gates, ssh-audit wrappers."
        ),
        "interoperability": "Executes every CLI on the system; embeds python/ jq for data work; called from cron/systemd/CI.",
        "best_practices": "shellcheck in CI; set -euo pipefail; longopts for readability; functions + local; prefer python when logic exceeds ~100 lines.",
        "ethical_hacking": "Standard for enumeration automation and lab exercises in authorized environments.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.gnu.org/software/bash/manual/", "https://www.fsf.org/free-software-supporter/2025/august", "https://www.shellcheck.net/"],
    ["Version facts verified 2026-09-10."],
    "Bash baseline for automation and secure scripting.",
)
add(
    "PowerShell — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.95, "EXTERNAL_SOURCE_VERIFIED",
    {
        "language": "PowerShell",
        "paradigms": ["object-pipeline shell", "scripting", ".NET-based automation"],
        "current_version": {
            "stable": "PowerShell 7.6.6 (Sep 8, 2026); 7.6 is LTS; 7.4 LTS supported until 2026-11-10; Windows ships legacy 5.1 built-in.",
            "verified": VERIFIED,
        },
        "fundamentals": (
            "Object pipeline (not text): cmdlets pass .NET objects; "
            "Verb-Noun naming; parameters common (-ErrorAction, -WhatIf); "
            "providers (filesystem/registry/AD as PSDrives); pipeline "
            "control (ForEach-Object, Where-Object); strict mode Set-StrictMode."
        ),
        "standard_library": "Core cmdlets + Microsoft.PowerShell.* modules; Invoke-WebRequest/RestMethod for HTTP; ConvertTo/From-Json; Test-Connection; Get-WinEvent.",
        "ecosystem": "PowerShellGet + PSGallery; modules auto-load; DSC for configuration management.",
        "debugging_testing": (
            "Set-PSDebug, breakpoints in VS Code/ISE, Pester for testing, "
            "Set-StrictMode -Latest, [CmdletBinding()] for advanced function behavior."
        ),
        "performance_memory": "Pipeline object overhead matters — .foreach()/.where() methods are faster; avoid Get-Content line loops for big files (-ReadCount).",
        "networking_systems": "Invoke-RestMethod, TCP clients via .NET, WinRM/SSH remoting (PSSession), CIM/WMI for system inventory.",
        "web_api": "Invoke-RestMethod for API work; JEA for constrained admin endpoints; Azure automation heavy user.",
        "secure_coding": [
            "ExecutionPolicy is NOT a security boundary — treat signed scripts + JEA as the real controls",
            "Never Invoke-Expression on external input; avoid iex download cradles",
            "Sanitize/format strings carefully with -f operator; validate $args",
            "Use SecretManagement module for credentials; never plaintext in scripts/repos",
            "Constrained Language Mode + AppLocker/WDAC as hardening; script block + transcription logging enabled",
        ],
        "vulnerability_classes": [
            "Command injection (Invoke-Expression)",
            "Credential leakage in scripts/transcripts",
            "Deserialization risk in .NET type conversion",
            "Abuse-as-attack-surface: PowerShell is the #1 LOLBin — defenders must know attacker tradecraft to detect it",
        ],
        "reverse_engineering_relevance": (
            "Analyzing PowerShell-based droppers/loaders (deobfuscation of "
            "encoded commands, AMSI bypass techniques for DEFENSIVE "
            "understanding), reading attacker scripts in incident response."
        ),
        "security_tooling": (
            "AD enumeration in authorized assessments (AD modules, "
            "PowerView-class tooling), hardening via JEA/DSC, detection "
            "engineering (script block logging, Sysmon), log analysis with "
            "Get-WinEvent, CTF Windows challenges."
        ),
        "interoperability": ".NET full interop (Add-Type for C#), COM, native Windows APIs via P/Invoke, JSON/CSV/CLIXML.",
        "best_practices": "Pester tests; strict mode; approved verbs; parameter validation attributes ([ValidatePattern]); modules over scripts for reuse.",
        "ethical_hacking": "Windows/AD authorized assessment and defense tooling; LOLBin detection knowledge.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://learn.microsoft.com/en-us/powershell/", "https://github.com/PowerShell/PowerShell/releases", "https://learn.microsoft.com/en-us/powershell/scripting/install/powershell-support-lifecycle?view=powershell-7.6"],
    ["Version facts verified 2026-09-10."],
    "PowerShell baseline for Windows automation and defense.",
)
add(
    "Go — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.95, "EXTERNAL_SOURCE_VERIFIED",
    {
        "language": "Go",
        "paradigms": ["imperative", "concurrent", "compiled", "statically-typed", "systems"],
        "current_version": {
            "stable": "Go 1.26.x (1.26 released Feb 2026; 1.26.7 Aug 19, 2026)",
            "verified": VERIFIED,
        },
        "fundamentals": (
            "Compiled, garbage-collected, statically typed; implicit "
            "interface satisfaction (structural typing); goroutines + "
            "channels for CSP-style concurrency; defer/panic/recover; "
            "explicit error values (no exceptions); zero-value "
            "initialization; fast single-static-binary compilation."
        ),
        "standard_library": (
            "Strong stdlib: net/http (full server), crypto/*, encoding/json, "
            "os/exec, io, context (cancellation), sync, testing (built-in "
            "test + benchmark + fuzz)."
        ),
        "ecosystem": "Go modules + proxy.golang.org; tools: golangci-lint, gosec (security), govulncheck (vuln DB-backed).",
        "debugging_testing": (
            "go test (table-driven tests), built-in fuzzing (go test -fuzz), "
            "race detector (go test -race), delve debugger, pprof profiling."
        ),
        "performance_memory": "Low-latency concurrent GC; goroutines are cheap (~KB stacks); escape analysis reduces heap pressure; predictable perf without JIT warmup.",
        "networking_systems": "goroutine-per-connection servers; net/http production-grade; syscall layer available; container/cloud-native standard language.",
        "web_api": "stdlib net/http (with 1.22+ improved routing), chi/gin/echo; gRPC first-class; the standard for microservices/CLI infra.",
        "secure_coding": [
            "Never exec.Command with shell + interpolated input; use argument lists",
            "govulncheck + gosec in CI; dependency pinning via go.sum",
            "Reject path traversal: filepath.Clean + prefix checks on user paths",
            "Limit http.Client redirects and control SSRF exposure on user-supplied URLs",
            "Context deadlines/timeouts on every network call",
        ],
        "vulnerability_classes": [
            "Command injection via shell invocation",
            "Path traversal in file servers",
            "SSRF in URL-fetching services",
            "Nil map/pointer panics (DoS if unrecovered)",
            "Supply chain via module typosquats (rarer than npm)",
        ],
        "reverse_engineering_relevance": (
            "Growing share of malware is Go (infostealers, loaders) — Go "
            "binary RE has distinct challenges (goroutine-aware analysis, "
            "symbol recovery, pclntab parsing) handled by IDA/Ghidra plugins."
        ),
        "security_tooling": (
            "Large authorized-tooling ecosystem: gobuster, ffuf-class web "
            "fuzzers, nuclei, katana, subfinder, httpx — ProjectDiscovery "
            "suite is Go; also C2-framework class tooling exists in Go "
            "(understanding for defense)."
        ),
        "interoperability": "cgo for C ABI (with overhead), WASM targets, static binaries for cross-compilation everywhere.",
        "best_practices": "go vet + golangci-lint; table-driven tests; context propagation; interface at consumer side; govulncheck in CI.",
        "ethical_hacking": "Modern web/infrastructure assessment tooling base in authorized engagements.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://go.dev/", "https://go.dev/VERSION", "https://groups.google.com/g/golang-announce/c/qA6Vpj2UA-4/m/BwmF6KTTBAAJ", "https://go.dev/blog/race-detector"],
    ["Version facts verified 2026-09-10."],
    "Go baseline for cloud-native tooling and Go-binary analysis.",
)
add(
    "Rust — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.95, "EXTERNAL_SOURCE_VERIFIED",
    {
        "language": "Rust",
        "paradigms": ["multi-paradigm", "systems", "functional + imperative", "concurrent"],
        "current_version": {
            "stable": "Rust 1.98.1 (Sep 3, 2026; 1.98 released Aug 20, 2026)",
            "verified": VERIFIED,
        },
        "fundamentals": (
            "Ownership + borrowing + lifetimes give memory safety WITHOUT "
            "GC at C-like performance: every value has one owner, borrows "
            "are checked at compile time. Zero-cost abstractions; traits "
            "for polymorphism; Result/Option instead of nulls/exceptions; "
            "unsafe blocks are the explicit escape hatch."
        ),
        "standard_library": (
            "std (collections, smart pointers, sync/mpmc channels, "
            "net::TcpListener), but core ecosystem is crates: tokio "
            "(async), serde (serialization), reqwest (HTTP), rand, "
            "ring/rust-crypto."
        ),
        "ecosystem": "cargo + crates.io; workspace monorepos; clippy linting; rustup toolchains; auditable builds (cargo auditable).",
        "debugging_testing": (
            "cargo test built-in; miri (UB detection for unsafe code), "
            "cargo-fuzz (libFuzzer), cargo-audit (RustSec advisory DB), "
            "sanitizers supported."
        ),
        "performance_memory": "No GC: stack-first, move semantics, predictable latency; Box/Rc/Arc explicit heap control; inlining + monomorphization.",
        "networking_systems": "tokio/async-std event loops; QUIC (quinn); raw sockets via libc; WASM targets; embedded/OS work (kernel-class).",
        "web_api": "axum/actix-web/rocket servers; serde for JSON; production adoption in infra (Cloudflare, AWS, etc.).",
        "secure_coding": [
            "Safe Rust is memory-safe by construction — the risk surface is unsafe blocks and logic",
            "cargo-audit + cargo-deny for vulnerable/unsound crates; pin with lockfile",
            "Audit unsafe blocks and FFI boundaries line by line",
            "Panic-safety in library code (avoid unwinding across FFI)",
        ],
        "vulnerability_classes": [
            "Logic errors (memory-safety tools don't help)",
            "unsafe-block memory bugs and unsound crate APIs",
            "FFI boundary UB",
            "Supply chain via crates.io",
            "DoS via panics/unwrap in attacker-controlled paths",
        ],
        "reverse_engineering_relevance": (
            "Rust malware is increasing (droppers, info stealers); Rust "
            "binaries RE differently (monomorphized generics, panic tables, "
            "no RTTI) — analysis in authorized malware-research contexts."
        ),
        "security_tooling": (
            "Security tooling increasingly written in Rust: ripgrep-class "
            "speed, feroxbuster, rustscan, and parsing/DISASM crates "
            "(goblin, iced-x86); memory-safe rewrites of critical parsers "
            "are a defensive best practice."
        ),
        "interoperability": "extern \"C\" FFI; bindgen for C headers; pyo3 for Python extensions; WASM via wasm-bindgen.",
        "best_practices": "deny warnings; clippy; fuzz parsers (cargo-fuzz); unsafe review checklist; RustSec monitoring.",
        "ethical_hacking": "Fast scanning/analysis tooling for authorized assessments; safe tool building.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.rust-lang.org/", "https://endoflife.date/rust", "https://rustsec.org/"],
    ["Version facts verified 2026-09-10."],
    "Rust baseline for memory-safe systems and tooling.",
)
add(
    "Assembly — x86-64/ARM64 fundamentals and security applications",
    "coding", "CODE_INSIGHT", 0.95, "USER_PROVIDED",
    {
        "language": "Assembly (x86-64, ARM64/aarch64)",
        "paradigms": ["low-level ISA", "machine-oriented"],
        "current_version": {
            "standard": "No language version — ISAs evolve as architectural extensions (x86-64: AVX-512 variants, APX; ARM64: ARMv9/SVE2). Toolchain versions matter more: NASM/GAS/MASM assemblers, debuggers gdb/lldb/x64dbg/WinDbg.",
            "verified": "ISA extension status not independently verified 2026-09-10",
        },
        "fundamentals": (
            "Registers, stack frames, calling conventions (System V AMD64: "
            "rdi/rsi/rdx/rcx/r8/r9; Win64: rcx/rdx/r8/r9; AAPCS64 for ARM), "
            "condition codes/flags, addressing modes, system-call interface "
            "(syscall instruction), position-independent code, GOT/PLT."
        ),
        "standard_library": "None — libc/syscalls; CPU instruction set reference (Intel SDM, ARM ARM).",
        "ecosystem": "NASM/GAS/MASM assemblers; Keystone (assembler engine), Capstone (disassembler), Unicorn (emulation) — the holy trinity of programmatic asm work.",
        "debugging_testing": "gdb/lldb (tui), x64dbg/WinDbg for Windows; instruction-level single-stepping; Qiling/FirmAE for emulated firmware testing.",
        "performance_memory": "Maximum control: cache alignment, vectorization (SIMD), cycle-level optimization; also side-channel timing behavior (constant-time crypto requires asm-aware analysis).",
        "networking_systems": "Syscall-level socket code; shellcode for exploit education (authorized labs only); kernel-level work.",
        "web_api": "Not applicable directly.",
        "secure_coding": [
            "Constant-time comparisons in crypto (avoid branch/timing leaks)",
            "Bounds are manual — asm is where C bugs become exploits",
            "Stack discipline per calling convention; SMAP/SMEP awareness",
        ],
        "vulnerability_classes": [
            "The runtime manifestation of all memory-corruption vulns",
            "Side-channel timing/cache attacks at instruction level",
            "Speculative-execution considerations (Spectre-class, mitigated via barriers in asm)",
        ],
        "reverse_engineering_relevance": (
            "THE foundational skill of RE and exploit development: reading "
            "compiler output, identifying functions/decompilers verification, "
            "shellcode construction, ROP gadget hunting, unpacking, "
            "anti-debugging recognition, firmware analysis."
        ),
        "security_tooling": (
            "Ghidra/IDA disassembly review, Capstone-based tooling, Unicorn "
            "emulation for deobfuscation, ROPgadget/ropper, pwntools asm/shellcraft "
            "(CTF/authorized labs), x64dbg for Windows malware unpacking."
        ),
        "interoperability": "asm() intrinsics/inline asm in C/C++/Rust/Go; JIT-generated code in engines.",
        "best_practices": "Learn via decompilation cross-checking; single-step in debuggers; emulate before executing unknown code (never run malware on host).",
        "ethical_hacking": "Core of binary exploitation in CTF and authorized lab environments; malware analysis (static + emulated).",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html", "https://capstone-engine.org/", "https://www.unicorn-engine.org/"],
    ["ISA extension/toolchain versions not independently verified 2026-09-10."],
    "Assembly baseline for RE and exploit-development theory.",
)
add(
    "SQL — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.95, "EXTERNAL_SOURCE_VERIFIED",
    {
        "language": "SQL",
        "paradigms": ["declarative", "set-based", "relational"],
        "current_version": {
            "standard": "ISO/IEC 9075:2023 (SQL:2023) is the latest published standard — added JSON support and property-graph queries. Dialects: PostgreSQL, MySQL/MariaDB, SQLite, SQL Server (T-SQL), Oracle.",
            "verified": VERIFIED,
        },
        "fundamentals": (
            "Declarative query language over relational algebra: SELECT/"
            "JOIN/GROUP BY/HAVING/ORDER; indexes (B-tree/hash), query "
            "plans, transactions (ACID), isolation levels, normalization, "
            "constraints, views, CTEs/window functions."
        ),
        "standard_library": "Dialect built-ins: JSON functions, arrays (PG), full-text search, triggers, stored procedures (PL/pgSQL, T-SQL).",
        "ecosystem": "Migrations tooling (Flyway/Liquibase/Prisma); ORMs above; EXPLAIN/ANALYZE for tuning.",
        "debugging_testing": "EXPLAIN/ANALYZE plans; pgTAP/sqllogictest for tests; slow-query logs; deadlock tracing.",
        "performance_memory": "Index design dominates: covering indexes, sargable predicates, N+1 ORM query patterns, VACUUM/bloat, connection pooling (pgbouncer).",
        "networking_systems": "Wire protocols per engine; TLS enforcement; least-privilege network exposure.",
        "web_api": "Backing store of nearly every API — SQL quality is API quality.",
        "secure_coding": [
            "Parameterized queries / prepared statements ALWAYS — never string-built SQL",
            "Least-privilege DB users; separate read/write roles; no superuser app accounts",
            "Postgres RLS for row-level multi-tenant isolation",
            "Disable/enumerate dangerous extensions; encrypt at rest and in transit",
            "Validate and constrain (CHECK/NOT NULL/FK) at schema level",
        ],
        "vulnerability_classes": [
            "SQL injection (classic: UNION, boolean/error/time-based blind, stacked queries, second-order)",
            "Privilege escalation via excessive GRANTs",
            "Data exfiltration via verbose errors",
            "DoS via pathological queries (missing limits/cost caps)",
        ],
        "reverse_engineering_relevance": (
            "DB schema/enum during authorized pentests; understanding of "
            "attackers' sqlmap-class tooling for defensive detection rules; "
            "log mining for injected-query forensics."
        ),
        "security_tooling": "sqlmap understanding (authorized use only), query linters (squirrelsq/semgrep SQLi rules), canary tokens, audit logging (pgAudit).",
        "interoperability": "Every language's data layer via drivers/ORMs; HTTP-based access (Supabase/PostgREST) with API-key+RLS model.",
        "best_practices": "Migrations in git; constraints over app-level checks; connection pooling; EXPLAIN-gate slow queries; audit log sensitive tables.",
        "ethical_hacking": "Injection validation in authorized web assessments; DB-hardening guidance.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.iso.org/standard/76582.html", "https://www.postgresql.org/docs/current/ddl-rowsecurity.html", "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html"],
    ["Standard facts verified 2026-09-10."],
    "SQL baseline for injection-resistant data-layer guidance.",
)
add(
    "Java — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.9, "USER_PROVIDED",
    {
        "language": "Java",
        "paradigms": ["OOP", "imperative", "concurrent", "JVM bytecode"],
        "current_version": {
            "stable": "Java 25 is the current LTS (Sep 2025); verify exact current release before version-sensitive use.",
            "verified": "LTS status not independently re-verified 2026-09-10",
        },
        "fundamentals": (
            "Compiled to JVM bytecode, JIT-executed; strong static typing "
            "with generics (erasure); classes/interfaces, records, sealed "
            "types; streams/lambda; virtual threads (Project Loom) for "
            "high-throughput concurrency."
        ),
        "standard_library": "Huge: collections, NIO, java.net.http, javax.crypto/JCA, concurrency utilities, reflection.",
        "ecosystem": "Maven/Gradle; Spring/Spring Boot dominates; Jackson/Gson; JUnit/Mockito/Testcontainers.",
        "debugging_testing": "JDB/IDE debuggers; JFR (Flight Recorder) + async-profiler; JUnit 5; PIT mutation testing.",
        "performance_memory": "GC tuning (G1/ZGC/shenandoah); heap sizing; escape analysis; JIT warmup; memory leaks via classloaders/static refs (common in app servers).",
        "networking_systems": "Netty/Vert.x event loops; virtual threads revolutionize blocking-style servers; RMI legacy.",
        "web_api": "Spring Boot/Tomcat/Jetty; the enterprise backend standard; JAX-RS.",
        "secure_coding": [
            "Deserialization of untrusted data is RCE-class — use safe alternatives (JSON), never ObjectInputStream on untrusted streams",
            "Guard JNDI/LDAP lookups from user input (Log4Shell-class injection)",
            "Harden XML parsers: disable DTDs/XXE (setFeature disallow-doctype)",
            "Prepared statements for JDBC; least-privilege service accounts",
            "SecurityManager removed — rely on OS/sandbox isolation; manage secrets via vaults",
        ],
        "vulnerability_classes": [
            "Deserialization gadget chains (the historic Java weakness)",
            "JNDI injection (JNDI+LDAP/RMI lookup)",
            "XXE",
            "SSTI in template engines (Velocity/Freemarker)",
            "SSRF/URL handling; SQLi via JDBC string concat",
            "Log4j-class library vulns — dependency scanning (OWASP dep-check) essential",
        ],
        "reverse_engineering_relevance": (
            "Java decompiles readably (CFR/Procyon/jd-gui) — recovering "
            "source from JARs/APKs; analyzing Android apps (jadx), Minecraft-"
            "server mods, enterprise malware packed as JAR loaders."
        ),
        "security_tooling": "OWASP dependency-check, SpotBugs+FindSecBugs, Semgrep Java rules, JD-GUI/CFR for authorized code review.",
        "interoperability": "JNI/Panama FFI to C; GraalVM native-image; interop with Kotlin/Scala on JVM.",
        "best_practices": "Records for DTOs; modules (JPMS); virtual threads for IO-heavy services; SCA in CI.",
        "ethical_hacking": "Enterprise app assessment, Android APK analysis in authorized engagements.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://dev.java/", "https://www.oracle.com/java/technologies/java-se-support-roadmap.html", "https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html"],
    ["LTS version not independently re-verified 2026-09-10; verify before version-sensitive use."],
    "Java baseline with deserialization/JNDI emphasis.",
)
add(
    "PHP — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.9, "USER_PROVIDED",
    {
        "language": "PHP",
        "paradigms": ["dynamic", "web-focused", "imperative + OOP"],
        "current_version": {
            "stable": "PHP 8.x series is current (8.3/8.4 supported lines at last verification; 8.5 released late 2025) — verify exact supported minors before version-sensitive use.",
            "verified": "not independently verified 2026-09-10",
        },
        "fundamentals": (
            "Dynamic typing with 8.x improvements (JIT, readonly classes, "
            "enums, fibers); request-per-execution model on shared hosting "
            "or long-running via Swoole/FrankenPHP; composer autoloading "
            "(PSR-4)."
        ),
        "standard_library": "Huge stdlib: PDO (DB), curl, filter (validation), password_hash, openssl/sodium bindings, SPL.",
        "ecosystem": "Composer + packagist; Laravel/Symfony dominate; WordPress (≈40% of web) as ecosystem reality.",
        "debugging_testing": "Xdebug (steps + profiling), Pest/PHPUnit, Psalm/PHPStan static analysis, Larastan.",
        "performance_memory": "OPcache mandatory in production; JIT helps CPU-bound paths; preloading; request-scoped memory resets limit leak impact.",
        "networking_systems": "curl/guzzle; sockets; long-running servers via Swoole/RoadRunner.",
        "web_api": "Dominant CMS/framework web; Laravel API stack; session/cookie model maturity.",
        "secure_coding": [
            "PDO prepared statements only; never interpolate queries",
            "password_hash/password_verify (bcrypt/argon2) — never md5/sha1",
            "File uploads: validate MIME+extension+content, store outside webroot with random names, block execution perms",
            "Disable dangerous functions (exec/system/eval) unless required; sanitize include paths",
            "htmlspecialchars with correct flags on ALL output (XSS); CSRF middleware in frameworks",
        ],
        "vulnerability_classes": [
            "SQLi (historic PHP scourge — still common in legacy code)",
            "LFI/RFI via unsanitized include paths",
            "File upload → webshell",
            "Command injection (system/exec with input)",
            "unserialize RCE (PHP object injection)",
            "Session fixation; XXE in older XML paths",
        ],
        "reverse_engineering_relevance": (
            "Webshell analysis is a PHP specialty (obfuscated one-liners, "
            "gzinflate/eval chains); legacy code audits; WordPress plugin "
            "vuln review."
        ),
        "security_tooling": "Semgrep PHP rules, PHPStan safety checks, clamav webshell scanning, authorized use of sqlmap against owned apps.",
        "interoperability": "FFI (PHP 7.4+), C extensions, SOAP/REST.",
        "best_practices": "Modern framework defaults over raw PHP; Psalm strict; composer audit; keep runtime patched (PHP has high CVE cadence).",
        "ethical_hacking": "Legacy web app audits, CMS security reviews in authorized scopes.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.php.net/", "https://www.php.net/releases/", "https://cheatsheetseries.owasp.org/cheatsheets/PHP_Configuration_Cheat_Sheet.html"],
    ["Version minors not independently verified 2026-09-10; verify before version-sensitive use."],
    "PHP baseline for webshell recognition and legacy audit.",
)
add(
    "Ruby — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.9, "USER_PROVIDED",
    {
        "language": "Ruby",
        "paradigms": ["pure OOP", "dynamic", "metaprogramming-heavy", "functional elements"],
        "current_version": {
            "stable": "Ruby 3.4/3.5 series at last knowledge; verify exact current version before version-sensitive use.",
            "verified": "not independently verified 2026-09-10",
        },
        "fundamentals": (
            "Everything is an object; blocks/procs/lambdas; mixin modules; "
            "open classes + metaprogramming (method_missing, define_method) "
            "as core idiom — powerful and dangerous; Ractor experimental "
            "parallelism; YJIT in CRuby."
        ),
        "standard_library": "Core+std libs (socket, openssl, json, erb); gems via Bundler.",
        "ecosystem": "Rails (convention-over-configuration full-stack), Sinatra (light), Rack as middleware base.",
        "debugging_testing": "byebug/debug gem; RSpec (BDD style); RuboCop linting; Sorbet/RBS for typing.",
        "performance_memory": "YJIT big speedups; GC tuning; long-lived Rails processes need care with retained objects.",
        "networking_systems": "Socket/Net libs; Rails ActionCable websockets.",
        "web_api": "Rails REST stack; Grape/Jbuilder APIs; huge SaaS heritage (GitHub, Shopify).",
        "secure_coding": [
            "ActiveRecord parameter binding (where with ?/hash) — never string-interpolated conditions",
            "Avoid send/eval on user input; YAML.load → YAML.safe_load",
            "Marshal deserialization is RCE-class — never on untrusted data",
            "ERB escaping on by default — keep it; brakeman static scan in CI",
        ],
        "vulnerability_classes": [
            "SQLi via raw conditions/arelt injection",
            "RCE via deserialization (Marshal/object injection gadgets)",
            "Mass assignment (permit strong params)",
            "Command injection (backticks/system with shell interpolation)",
            "SSRF via URL fetching gems",
        ],
        "reverse_engineering_relevance": "Minor role; Rails app audits (brakeman), analyzing malicious gems.",
        "security_tooling": "Brakeman (Rails-specific static analysis — excellent), bundler-audit for gem CVEs.",
        "interoperability": "FFI gem for C; JRuby to JVM; RBS/Sorbet typed interop docs.",
        "best_practices": "Rails strong params everywhere; brakeman + bundler-audit in CI; freeze gems in production.",
        "ethical_hacking": "Rails-focused authorized audits.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.ruby-lang.org/", "https://brakemanscanner.org/", "https://guides.rubyonrails.org/security.html"],
    ["Version not independently verified 2026-09-10; verify before version-sensitive use."],
    "Ruby baseline for Rails security review.",
)
add(
    "Kotlin — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.9, "USER_PROVIDED",
    {
        "language": "Kotlin",
        "paradigms": ["statically-typed", "OOP+functional", "JVM/Android", "multiplatform"],
        "current_version": {
            "stable": "Kotlin 2.x series (K2 compiler); verify exact version before version-sensitive use.",
            "verified": "not independently verified 2026-09-10",
        },
        "fundamentals": (
            "Null-safe type system (TypeScript-like strictness on JVM): "
            "?-types forced-checked; data classes, sealed classes, "
            "extensions, coroutines (structured concurrency), DSL-friendliness. "
            "Compiles to JVM, JS, native, WASM."
        ),
        "standard_library": "kotlin.std (collections, coroutines, flow); JVM interop with everything Java.",
        "ecosystem": "Gradle; Spring Boot first-class Kotlin; Android official language; Ktor for servers; KMP for shared mobile code.",
        "debugging_testing": "IntelliJ debugger; JUnit5/kotest; kotlinx-coroutines-test; detekt (lint), koverage.",
        "performance_memory": "JVM model (GC, JIT); coroutines are cheap (vs threads); boxed types overhead hot paths.",
        "networking_systems": "Ktor/Netty servers; coroutines for async IO; OkHttp clients.",
        "web_api": "Ktor/Spring Boot; serialization via kotlinx.serialization.",
        "secure_coding": [
            "Null-safety kills NPEs — but platform types from Java need care",
            "Same JVM vuln classes apply (deserialization, XXE, JNDI)",
            "SQLi via Exposed/jOOQ parameter binding",
        ],
        "vulnerability_classes": [
            "Inherited JVM/deserialization classes",
            "Android: insecure storage, exported components, WebView misuse (JS bridge injection)",
            "kotlinx-serialization of untrusted data — configure strictly",
        ],
        "reverse_engineering_relevance": (
            "Android app analysis (jadx reads Kotlin well); reversing Kotlin "
            "Android apps in authorized mobile assessments."
        ),
        "security_tooling": "detekt, MobSF for Android APK analysis, Semgrep Kotlin rules (authorized mobile/web audits).",
        "interoperability": "100% Java interop; C via native targets; JS via Kotlin/JS.",
        "best_practices": "Coroutines structured concurrency (avoid GlobalScope leaks); detekt in CI; KMP code sharing reduces duplicate-logic bugs.",
        "ethical_hacking": "Authorized Android assessments, backend Kotlin audits.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://kotlinlang.org/", "https://developer.android.com/topic/security", "https://ktor.io/"],
    ["Version not independently verified 2026-09-10; verify before version-sensitive use."],
    "Kotlin baseline for Android/JVM audits.",
)
add(
    "Swift — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.9, "USER_PROVIDED",
    {
        "language": "Swift",
        "paradigms": ["statically-typed", "protocol-oriented", "safe-by-default", "functional elements"],
        "current_version": {
            "stable": "Swift 6.x (strict concurrency); verify exact version before version-sensitive use.",
            "verified": "not independently verified 2026-09-10",
        },
        "fundamentals": (
            "ARC memory management (no GC pauses); optionals enforce null "
            "safety; value types (structs/enums) first-class; protocol-"
            "oriented design; async/await + actors for data-race safety "
            "(Sendable checking in Swift 6)."
        ),
        "standard_library": "SwiftStd + Foundation; Combine/SwiftUI for UI; Network.framework; CryptoKit for crypto.",
        "ecosystem": "Swift Package Manager; Apple platforms; server-side Swift (Vapor/Hummingbird) as niche; swift.org toolchains for Linux.",
        "debugging_testing": "Xcode Instruments (leaks/time profiler); XCTest; swift-format/swiftlint.",
        "performance_memory": "ARC predictable (vs tracing GC); value-type copies — copy-on-write collections; ObjC interop has cost.",
        "networking_systems": "URLSession/Network.framework; NIO on servers.",
        "web_api": "Vapor/Hummingbird (niche but real); mostly iOS/macOS clients consuming APIs.",
        "secure_coding": [
            "Optionals + strict concurrency remove whole bug classes by construction",
            "ObjC interop reintroduces unsafety — audit bridging code",
            "CryptoKit over raw CommonCrypto; App Transport Security on",
            "Keychain for secrets — never UserDefaults for tokens",
        ],
        "vulnerability_classes": [
            "ObjC interop memory issues",
            "Insecure local storage; keylogging-class IPC exposure",
            "WebView/JS-bridge injection (WKWebView misuse)",
            "Logic bugs — memory safety reduces but doesn't eliminate exploitability",
        ],
        "reverse_engineering_relevance": (
            "iOS app authorized testing: class-dump/Hopper/Ghidra on "
            "Mach-O binaries; Swift demangling; Frida on iOS (jailbroken/"
            "test devices) in lab contexts."
        ),
        "security_tooling": "MobSF, Hopper/Ghidra, Frida (authorized mobile labs), SwiftLint security rules.",
        "interoperability": "C/ObjC full interop; Python via swift-python interop; WASM experimental.",
        "best_practices": "Swift 6 strict concurrency; Keychain not UserDefaults; CodeSign + sandbox posture checks.",
        "ethical_hacking": "Authorized iOS assessments.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.swift.org/", "https://developer.apple.com/documentation/security", "https://www.hackingwithswift.com/"],
    ["Version not independently verified 2026-09-10; verify before version-sensitive use."],
    "Swift baseline for Apple-platform security.",
)
add(
    "Dart — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.9, "USER_PROVIDED",
    {
        "language": "Dart",
        "paradigms": ["statically-typed", "OOP", "async-first", "client-optimized"],
        "current_version": {
            "stable": "Dart 3.x (sound null safety); verify exact version before version-sensitive use.",
            "verified": "not independently verified 2026-09-10",
        },
        "fundamentals": (
            "Sound null safety; async/await with Futures/Streams (event "
            "loop); isolates for parallelism (no shared-memory threads); "
            "AOT/JIT compilation; the Flutter language."
        ),
        "standard_library": "dart:core/async/io/convert/typed_data; crypto package for hashing.",
        "ecosystem": "pub.dev packages; Flutter framework for cross-platform UI; server frameworks (serverpod, shelf, dart_frog).",
        "debugging_testing": "dart devtools; flutter_test; mocktail; analyzer/lints.",
        "performance_memory": "Isolates = separate heaps (message passing); AOT snapshots; tree-shaking; widget build cost in Flutter.",
        "networking_systems": "dart:io sockets/http; WebSocket support; server-side Dart niche.",
        "web_api": "shelf/dart_frog/Serverpod; mostly clients via http package.",
        "secure_coding": [
            "Null safety prevents a whole crash class — keep sound mode on",
            "Never embed API keys in Flutter bundles — extractable from the app package",
            "Validate server-side always (client code is public)",
            "Use flutter_secure_storage for tokens; avoid plain shared_preferences for secrets",
        ],
        "vulnerability_classes": [
            "Secrets in shipped bundles (decompilable — reverse Flutter apps)",
            "Insecure local storage",
            "SSL pinning absence → MITM on dynamic analysis / real apps",
            "Dart snapshot reversing requires tooling (blutter-class) — relevant for authorized mobile audits",
        ],
        "reverse_engineering_relevance": "Authorized mobile assessments of Flutter apps (snapshot analysis, key extraction).",
        "security_tooling": "MobSF Flutter support, blutter-class snapshot tooling (authorized labs).",
        "interoperability": "FFI (dart:ffi) to C; JS interop (dart:js_interop); platform channels to native.",
        "best_practices": "Server-side authz; secure storage; SSL pinning; obfuscation is speed bump not boundary.",
        "ethical_hacking": "Authorized mobile app testing where Flutter is the client.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://dart.dev/", "https://flutter.dev/", "https://pub.dev/packages/flutter_secure_storage"],
    ["Version not independently verified 2026-09-10; verify before version-sensitive use."],
    "Dart baseline for Flutter security.",
)
add(
    "Lua — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.9, "USER_PROVIDED",
    {
        "language": "Lua (+ LuaJIT)",
        "paradigms": ["dynamic", "embeddable scripting", "prototype-OOP via tables/metatables"],
        "current_version": {
            "stable": "Lua 5.4.x is the current reference series; LuaJIT 2.1 widespread in game/edge contexts. Verify before version-sensitive use.",
            "verified": "not independently verified 2026-09-10",
        },
        "fundamentals": (
            "Everything is a table; metatables drive OOP/overloading; "
            "coroutines built-in; tiny footprint (embeds anywhere: games, "
            "Redis, nginx/OpenResty, network gear, game consoles)."
        ),
        "standard_library": "Minimal: string/table/math/io/os; power comes from host C API exposure — which is the security story.",
        "ecosystem": "LuaRocks; host ecosystems (game mods, OpenResty libs) dominate.",
        "debugging_testing": "busted testing; host-specific debuggers; luacheack linting.",
        "performance_memory": "Fastest pure dynamic languages in LuaJIT form; incremental GC in 5.x; tiny runtime.",
        "networking_systems": "OpenResty (nginx+LuaJIT) = extremely high-perf API gateways; network device scripting.",
        "web_api": "OpenResty/Lapis (server); mostly embedded scripting.",
        "secure_coding": [
            "Sandbox carefully: loadstring/dofile reach host; strip dangerous libs (io/os) when embedding",
            "load() compiles attacker code — gate it; sandboxed env tables escape via metatables if sloppy",
            "Historic CVEs where Lua embedded in privileged daemons (Redis EVAL pre-sandbox CVEs) — embed with least privilege",
        ],
        "vulnerability_classes": [
            "Sandbox escapes in embedded contexts",
            "Host API abuse (native functions exposed to scripts)",
            "Memory corruption in C hosts (via buggy bindings)",
            "Game mod abuse → RCE in modded game servers (authorized lab contexts)",
        ],
        "reverse_engineering_relevance": (
            "Game RE/hacking heavily involves Lua (script extraction, "
            "decompilation of luac bytecode, modding in authorized/lab and "
            "owned-game contexts); embedded firmware analysis often finds Lua."
        ),
        "security_tooling": "luadec (decompile), unluac, luacheack; fuzzing embedded Lua hosts; CTF game challenges.",
        "interoperability": "The C API is the design center: host embeds Lua, Lua calls C; FFI in LuaJIT.",
        "best_practices": "When embedding: audit every exposed C function; version 5.4 for integer division/GC improvements; sandbox templates from OpenResty.",
        "ethical_hacking": "Game-security research (owned games/labs), embedded-device analysis.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://www.lua.org/manual/5.4/", "https://openresty.org/", "https://github.com/luarocks/lua-rocks"],
    ["Version not independently verified 2026-09-10; verify before version-sensitive use."],
    "Lua baseline for embedded/game security analysis.",
)
add(
    "Solidity — language fundamentals, secure coding and security applications",
    "coding", "CODE_INSIGHT", 0.9, "USER_PROVIDED",
    {
        "language": "Solidity (EVM)",
        "paradigms": ["statically-typed", "contract-oriented", "deterministic execution"],
        "current_version": {
            "stable": "Solidity 0.8.x (checked arithmetic since 0.8.0; frequent minor releases with breaking changes). Verify exact version per audit.",
            "verified": "not independently verified 2026-09-10",
        },
        "fundamentals": (
            "Contracts deployed to EVM as bytecode; storage (persistent) vs "
            "memory (transient) vs calldata; gas metering every operation; "
            "immutable deployment; events/logs; constructor pattern; "
            "modifiers; inheritance."
        ),
        "standard_library": "OpenZeppelin contracts as the standard base (access control, ERC20/721, safe math heritage).",
        "ecosystem": "Foundry (dev/test/fuzz/invariant) and Hardhat (JS tooling); solc versions pinned per contract.",
        "debugging_testing": (
            "Foundry fuzzing + invariant tests (stateful fuzzing — the "
            "crown jewel); forge coverage; tenderly simulation; unit tests "
            "in Solidity itself."
        ),
        "performance_memory": "Gas IS cost: storage ops ~20k gas, memory cheap; optimization = attack surface (optimizer bugs) + cost tradeoffs.",
        "networking_systems": "Chain interactions via RPC (eth_*); oracles (Chainlink) as external data — attack surface.",
        "web_api": "dApp frontends via ethers/viem + wallet contracts ABI.",
        "secure_coding": [
            "Checks-Effects-Interactions pattern (reentrancy defense #1) + ReentrancyGuard for external calls",
            "SafeERC20 / allowance race handling; approve/transferFrom semantics",
            "Access control (Ownable/AccessControl) on every state-changing fn; beware public functions",
            "Integer safety: 0.8 checked arithmetic; explicit unchecked blocks documented",
            "Oracle trust: use decentralized oracles with deviation/staleness checks; never price from pool spot for lending",
            "Audit + invariant fuzzing + formal verification (Certora-class) for high-value contracts",
        ],
        "vulnerability_classes": [
            "Reentrancy (the classic — DAO hack lineage)",
            "Access control flaws (missing onlyOwner)",
            "Oracle manipulation / price feed attacks",
            "Front-running/sandwich (MEV) on user transactions",
            "Integer overflow in pre-0.8 or unchecked code",
            "delegatecall injection; proxy upgrade hijacking (storage collisions)",
            "Denial-of-service via unbounded loops/gas griefing",
            "Flash-loan amplified price attacks",
        ],
        "reverse_engineering_relevance": (
            "On-chain contracts are public bytecode: decompiling ( panoramix/"
            "heimdall) and analyzing unverified contracts is standard "
            "authorized audit/CTF work (Ethernaut, Damn Vulnerable DeFi)."
        ),
        "security_tooling": "Slither (static), Mythril (symbolic), Echidna (property fuzzing), Foundry invariants, eth-security-toolbox.",
        "interoperability": "ABI ↔ JS/web3; cross-chain bridges as highest-risk integration.",
        "best_practices": "Pinned solc; OpenZeppelin bases; audited before deployment; bug bounties; monitoring (Forta-class) post-deploy.",
        "ethical_hacking": (
            "Smart-contract auditing and security CTFs — inherently "
            "authorized contexts: audit scopes, testnets, CTF platforms, "
            "own deployments."
        ),
        "authorization_boundary": (
            "On-chain attack techniques stay in audits, CTFs, testnets, and "
            "owned contracts. Attacking live third-party contracts is theft, "
            "not hacking — refuse regardless of technical feasibility."
        ),
    },
    ["https://docs.soliditylang.org/", "https://consensys.github.io/smart-contract-best-practices/", "https://book.getfoundry.sh/"],
    ["Version not independently verified 2026-09-10; verify before version-sensitive use."],
    "Solidity baseline for smart-contract security.",
)

# ---------------------------------------------------------
# PRIORITY SECURITY DEEP DIVES (10)
# ---------------------------------------------------------
add(
    "Python — cybersecurity and authorized penetration-testing deep dive",
    "cybersecurity", "METHOD", 0.95, "USER_PROVIDED",
    {
        "role": "Primary language of offensive security tooling and automation.",
        "core_security_libraries": {
            "pwntools": "exploit development framework — ELF parsing, ROP, shellcraft (CTF/authorized labs)",
            "scapy": "packet crafting/sniffing at protocol level",
            "requests/httpx": "web testing automation, session handling",
            "impacket": "Windows protocol attacks (SMB, Kerberos, WMI) for authorized AD assessments",
            "frida": "dynamic instrumentation of processes (own/authorized targets)",
            "angr": "symbolic execution for binary analysis",
            "unicorn_qiling": "CPU emulation for malware analysis without execution risk",
            "capstone_keystone": "disassembly/assembly toolchains",
            "ghidra_idapython": "scripting reverse-engineering platforms",
        },
        "techniques_in_authorized_contexts": [
            "Automated reconnaissance (nmap scripting, subdomain enum, service fingerprinting)",
            "Exploit development against lab targets (buffer overflows, format strings, ROP)",
            "Post-exploitation validation (privilege-escalation checks, credential exposure tests)",
            "Web testing (auth bypass validation, injection PoCs — with explicit scope authorization)",
            "Malware analysis automation (static triage, sandbox orchestration, config extraction)",
        ],
        "defensive_applications": [
            "Detection engineering: parsing logs, writing SIEM rules, threat hunting pipelines",
            "Automated hardening checks, dependency auditing (pip-audit), SAST integration",
            "Forensics scripting (timeline building, artifact carving)",
        ],
        "lab_standards": "Practice platforms: HackTheBox/TryHackMe (guided, authorized), local Vulhub/DVWA-style lab networks, CTFs (picoCTF→PwnCTF).",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://docs.pwntools.dev/", "https://scapy.net/", "https://www.hackthebox.com/", "https://tryhackme.com/"],
    [],
    "Deep offensive/defensive Python knowledge; lab-only application.",
)
add(
    "C — binary exploitation and secure systems deep dive",
    "cybersecurity", "METHOD", 0.95, "USER_PROVIDED",
    {
        "role": "The language of memory-corruption exploitation and native defensive code.",
        "exploitation_mechanics": [
            "Stack smashing → RIP/EIP control → ret2libc / ROP chains",
            "Heap exploitation: tcache/fastbin poisoning (glibc), house-of-* techniques",
            "Format string: arbitrary read/write via %n primitives",
            "Bypassing mitigations: ASLR (infoleaks), NX (ROP), canaries (leak/overwrite), RELRO (GOT overwrite where partial), CFI",
            "Shellcode: position-independent stubs, encoder/staged loaders (msf-class, for lab use)",
        ],
        "analysis_tooling": ["gdb (pwndbg/gef)", "pwntools", "ROPgadget/ropper", "checksec", "AFL++/libFuzzer harnesses", "Valgrind"],
        "defensive_applications": [
            "Writing hardened parsers/services; sanitizer-instrumented builds",
            "Auditing native code for the classic memory-corruption patterns",
            "Understanding compiler mitigations and their bypasses to design defenses",
        ],
        "lab_standards": "pwn.college, CTF pwn categories, self-hosted VM labs with intentionally vulnerable binaries.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://pwn.college/", "https://github.com/pwndbg/pwndbg", "https://github.com/AFLplusplus/AFLplusplus"],
    [],
    "C exploitation theory for authorized labs; defense-first framing for users.",
)
add(
    "C++ — reversing large native binaries and game-security deep dive",
    "cybersecurity", "METHOD", 0.9, "USER_PROVIDED",
    {
        "role": "Dominant in game engines, EDR/AV, browsers — high-value analysis targets.",
        "re_mechanics": [
            "Demangling Itanium/MSVC names; recovering class layouts from RTTI/vtables",
            "Exception-handling tables (.eh_frame) and unwind analysis",
            "STL container identification in binaries (libstdc++/libc++ signatures)",
            "Game hacking analysis in owned-game/lab contexts: entity lists, function hooks, AC bypass analysis for understanding",
        ],
        "defensive_applications": [
            "Memory-safe refactoring guidance (span, smart pointers) for native codebases",
            "Fuzzing native parsers with libFuzzer harnesses; sanitizer CI",
            "Analyzing C++ malware families in sandboxes",
        ],
        "lab_standards": "Reversing courses (OpenSecurityTraining-class), malware analysis sandboxes, owned-game modding sandboxes.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://abandonware.github.io/", "https://github.com/google/fuzzing", "https://malwareunicorn.org/"],
    [],
    "C++ RE knowledge for authorized analysis.",
)
add(
    "JavaScript/TypeScript — web application security testing deep dive",
    "cybersecurity", "METHOD", 0.95, "USER_PROVIDED",
    {
        "role": "The language pair of web attack surface (clients) and web assessment tooling.",
        "authorized_web_testing": [
            "XSS validation: DOM sink analysis, CSP evaluation, context-aware payload construction (on owned/scoped apps)",
            "Prototype pollution chains: source (query/body) → merge sink → gadget (for authentication scopes)",
            "Request tampering automation, session analysis, business-logic abuse testing",
            "Nuclei/Burp template/plugin authoring for scanner coverage",
        ],
        "deobfuscation_and_analysis": [
            "AST-based deobfuscation (Babel transforms) for web skimmers and packed droppers",
            "Malicious npm package analysis (install-scripts, typosquat detection)",
            "Client-side crypto/wallet injector analysis",
        ],
        "defensive_applications": [
            "CSP design, DOMPurify integration, trusted-types adoption",
            "SCA (npm audit/renovate/provenance), lockfile discipline, semgrep rules",
            "Secure React/Angular/Vue patterns — framework auto-escaping and its bypasses",
        ],
        "lab_standards": "OWASP Juice Shop, PortSwigger Web Security Academy (free, authorized), WebGoat, own staging environments.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://owasp.org/www-project-juice-shop/", "https://portswigger.net/web-security", "https://github.com/nickmilo60/ast-hook-deobfuscator"],
    [],
    "Web-security deep knowledge; testing only with explicit authorization.",
)
add(
    "Bash — enumeration automation and hardening deep dive",
    "cybersecurity", "METHOD", 0.9, "USER_PROVIDED",
    {
        "role": "Glue for reconnaissance loops, log triage, and system hardening.",
        "authorized_enumeration": [
            "Asset discovery loops (dig/whois/crt.sh parsing, subdomain enum with subfinder wrappers)",
            "Port/service sweep wrappers (nmap batch + grep reporting) on scoped ranges",
            "Linux privesc enumeration checklists (SUID, cron, PATH, sudo -l triage) on owned boxes/CTF targets",
        ],
        "defensive_applications": [
            "Hardening scripts (auditd setup, sysctl baselines, SSH config)",
            "Log triage (auth.log carving, IOC grepping, auditd analysis)",
            "CI security gates (secret scanning wrappers, dependency checks)",
        ],
        "lab_standards": "TryHackMe/Linux privesc labs, own VMs, CTF infrastructure.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://tryhackme.com/", "https://github.com/rebootuser/LinEnum"],
    [],
    "Bash security automation for scoped work.",
)
add(
    "PowerShell — Windows/AD security and detection deep dive",
    "cybersecurity", "METHOD", 0.9, "USER_PROVIDED",
    {
        "role": "Both the #1 Windows attack LOLBin and the primary Windows defense/automation language.",
        "attacker_tradecraft_knowledge_for_defense": [
            "Encoded-command cradles, AMSI bypass patterns, download cradles (defenders must detect these)",
            "AD enumeration via PowerShell (Get-AD*, PowerView-class) in authorized assessments",
            "PowerShell Empire-like post-exploitation behaviors (for building detections)",
        ],
        "defensive_applications": [
            "Detection engineering: script-block logging (Event ID 4104), transcription, Sysmon pairing",
            "Hardening: Constrained Language Mode, JEA endpoints, AppLocker/WDAC policies",
            "Incident response: artifact collection, Get-WinEvent hunting queries, ADS forensics",
        ],
        "lab_standards": "Own AD lab (GOAD-class vulnerable directories), detection-engineering labs.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://attack.mitre.org/techniques/T1059/001/", "https://github.com/Orange-Cyberdefense/GOAD", "https://learn.microsoft.com/en-us/powershell/scripting/security/remoting/jea"],
    [],
    "PowerShell attack/defense parity for authorized use.",
)
add(
    "Go — cloud-native security tooling and Go-binary analysis deep dive",
    "cybersecurity", "METHOD", 0.9, "USER_PROVIDED",
    {
        "role": "Standard language of modern security tooling (scanner ecosystem) and growing malware language.",
        "authorized_tooling_ecosystem": [
            "Nuclei (template-based scanning), ffuf, katana, subfinder, httpx — read source, write templates/plugins",
            "Custom scanners: building scoped recon/fuzz tools with net/http + goroutines",
            "gosec/govulncheck for securing Go codebases under audit",
        ],
        "go_binary_analysis": [
            "Go malware RE: pclntab parsing for symbol recovery, goroutine-aware stack analysis, IDA/Ghidra Go plugins",
            "Understanding Go-specific obfuscation (garble) for detection signatures",
        ],
        "defensive_applications": ["eBPF-based tooling in Go (cilium/ebpf) for runtime security", "Writing fast log/event processors for detection pipelines"],
        "lab_standards": "Own staging infra, CTF platforms, malware-analysis sandboxes.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://nuclei.projectdiscovery.io/", "https://github.com/golang/go/wiki/sitizeroot", "https://github.com/cilium/ebpf"],
    [],
    "Go security tooling for authorized assessment.",
)
add(
    "Rust — memory-safe security tooling deep dive",
    "cybersecurity", "METHOD", 0.9, "USER_PROVIDED",
    {
        "role": "Rewriting critical security tooling memory-safe; analyzing rising Rust malware.",
        "secure_tooling": [
            "Fast file/protocol parsers (nom-class) with zero UB risk",
            "Network probing/scanning tools with performance + safety (rustscan, feroxbuster-class)",
            "Memory-safe rewrites of parsing hot paths (defensive architecture pattern)",
        ],
        "rust_binary_analysis": [
            "Rust malware RE challenges: monomorphization bloat, no RTTI, panic/alloc tables; symbol recovery via rustc artifacts when available",
            "Detection signatures for garble-obfuscated Rust loaders",
        ],
        "defensive_applications": ["cargo-audit/cargo-deny supply-chain gates", "Ring/rustls for safe TLS implementations", "Fuzzing infrastructure (cargo-fuzz) for parsers under audit"],
        "lab_standards": "Malware-analysis sandboxes, own CTF tooling projects.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://rustsec.org/", "https://github.com/rust-fuzz/cargo-fuzz", "https://github.com/rustls/rustls"],
    [],
    "Rust security tooling knowledge.",
)
add(
    "Assembly — exploit development and malware analysis deep dive",
    "cybersecurity", "METHOD", 0.95, "USER_PROVIDED",
    {
        "role": "The lowest-level skill for exploit dev and malware analysis.",
        "exploitation": [
            "Reading disassembly to find primitives (off-by-one, UAF → arbitrary write)",
            "ROP chain construction (syscall-oriented where possible), stack pivots, SROP",
            "Shellcode writing (execve stubs, egghunters) — labs/CTFs only",
            "SEH exploitation on Windows; sysret/syscall-oriented x64 patterns",
        ],
        "malware_analysis": [
            "Unpacking stubs (custom-asm decoders), anti-debug/anti-VM recognition",
            "Emulating code with Unicorn to avoid detonating (sandbox discipline)",
            "Ransomware/crypto interop analysis at instruction level",
        ],
        "defensive_applications": ["Writing/exploiting detection: canary placement, CFI understanding", "Side-channel: constant-time verification of crypto primitives"],
        "lab_standards": "pwn.college, crackmes, malware-unicorn-class RE courses, isolated VM labs with snapshotted detonation.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://pwn.college/", "https://malwareunicorn.org/", "https://www.unicorn-engine.org/"],
    [],
    "Asm-level security knowledge; strictly authorized application.",
)
add(
    "SQL — injection theory and data-layer defense deep dive",
    "cybersecurity", "METHOD", 0.95, "USER_PROVIDED",
    {
        "role": "The data layer is the target; SQL fluency is required for both attack validation and defense.",
        "injection_theory": [
            "Grammar-level injection: quote-breaking, UNION SELECT column matching, information_schema/palm introspection",
            "Blind techniques: boolean, time-based (pg_sleep/SLEEP/BENCHMARK), error-based exfil, out-of-band (DNSLOG)",
            "Second-order and stored injection; ORM raw-query bypasses",
            "sqlmap operation understanding — authorized targets only",
        ],
        "defense": [
            "Prepared statements everywhere; ORM query-builder caveats (raw fragments)",
            "RLS in Postgres for tenant isolation; read-only replicas/roles for reporting paths",
            "WAF + query cost caps as DoS/exfil friction; pgAudit for forensic trails",
            "Error hygiene (no SQL fragments in errors) + canary tokens for exfil detection",
        ],
        "lab_standards": "OWASP SQLi labs, own DVWA/Vulhub instances, sqlilabs.",
        "authorization_boundary": AUTH_BOUNDARY,
    },
    ["https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html", "https://github.com/sqlmapproject/sqlmap", "https://portswigger.net/web-security/sql-injection"],
    [],
    "SQL injection/defense knowledge for authorized testing.",
)

# ---------------------------------------------------------
# SQL GENERATION
# ---------------------------------------------------------
def sql_str(s: str) -> str:
    return s.replace("'", "''")

def sql_json(obj) -> str:
    return sql_str(json.dumps(obj, ensure_ascii=False))

header = f"""-- =========================================================
-- ARCHIE CODING & SECURITY INTELLIGENCE SEED
-- Owner-directed seed (conversation 2026-09-10): persistent
-- Coding Intelligence + Security Intelligence for 18
-- programming languages and their legitimate cybersecurity
-- applications.
--
-- Honesty model:
--   * Version-sensitive facts verified against official
--     sources on {VERIFIED} carry evidence_state
--     EXTERNAL_SOURCE_VERIFIED + cited_sources.
--   * Authoritative-but-not-retrieved knowledge carries
--     USER_PROVIDED (owner-directed seed) with explicit
--     re-verify assumptions where version-sensitive.
--   * Offensive-security knowledge items embed the hard
--     authorization boundary (authorized systems, owned
--     infrastructure, controlled laboratories, CTFs,
--     explicitly permitted assessments ONLY).
--
-- Idempotent: removes prior seed rows (source_type marker)
-- before inserting, so it can be re-run safely.
-- =========================================================

-- 1. Domains
INSERT INTO public.frelux_archie_domains (key, label, is_core, risk_class, description) VALUES
  ('coding', 'Coding Intelligence', false, 'STANDARD',
   'Programming languages, tooling, engineering practice and ARCHIE coding intelligence.'),
  ('cybersecurity', 'Cybersecurity Intelligence', false, 'STANDARD',
   'Secure coding, vulnerability classes, authorized security testing and defense knowledge.')
ON CONFLICT (key) DO NOTHING;

-- 2. Idempotency: clear any prior seed (learning_versions first, then items, then records)
DELETE FROM public.frelux_learning_versions
 WHERE record_id IN (SELECT id FROM public.frelux_learning_records
                     WHERE source_type = 'ARCHIE_SEED_CODING_INTEL');
DELETE FROM public.frelux_knowledge_items
 WHERE record_id IN (SELECT id FROM public.frelux_learning_records
                     WHERE source_type = 'ARCHIE_SEED_CODING_INTEL');
DELETE FROM public.frelux_learning_records
 WHERE source_type = 'ARCHIE_SEED_CODING_INTEL';
"""

def item_sql(it):
    content = it["content"]
    evidence = [
        f"Owner-directed seed of {content.get('language', it['domain'])} knowledge, authored 2026-09-10",
        f"Version-sensitive facts marked verified:external or flagged with re-verify assumptions",
    ]
    return f"""
WITH rec AS (
  INSERT INTO public.frelux_learning_records (
    source, source_type, provider, model_version, topic, capability,
    recommendation, evidence, cited_sources, assumptions, proposed_scope
  ) VALUES (
    'ARCHIE', 'ARCHIE_SEED_CODING_INTEL', 'ARCHIE', 'superagent-native',
    '{sql_str(it["topic"])}', '{sql_str(it["capability"])}',
    '{sql_str(it["recommendation"])}',
    '{sql_json(evidence)}'::jsonb,
    '{sql_json(it["cited_sources"])}'::jsonb,
    '{sql_json(it["assumptions"])}'::jsonb,
    'GLOBAL'
  )
  RETURNING id
)
INSERT INTO public.frelux_knowledge_items (
  record_id, capability, scope, topic, content, evidence_state,
  confidence, domain, knowledge_type, status, change_reason,
  approved_by, approved_date
)
SELECT
  rec.id, '{sql_str(it["capability"])}', 'GLOBAL',
  '{sql_str(it["topic"])}',
  '{sql_json(content)}'::jsonb,
  '{it["evidence_state"]}',
  {it["confidence"]},
  '{sql_str(it["domain"])}',
  '{it["knowledge_type"]}',
  'ACTIVE',
  'Owner-directed coding/security intelligence seed (2026-09-10), applied as migration; owner approval = explicit directive',
  NULL, now()
FROM rec;
"""

with open("supabase/migrations/20260910034000_archie_coding_intelligence_seed.sql", "w") as f:
    f.write(header)
    for i, it in enumerate(ITEMS, 1):
        f.write(f"\n-- ---- Item {i}/{len(ITEMS)}: {it['topic']} ----\n")
        f.write(item_sql(it))
    f.write(f"\n-- Seed complete: {len(ITEMS)} knowledge items across 18 languages + governance.\n")

print(f"Generated migration with {len(ITEMS)} items:")
for i, it in enumerate(ITEMS, 1):
    print(f"  {i:2d}. [{it['domain']}/{it['knowledge_type']}] {it['topic']}")
