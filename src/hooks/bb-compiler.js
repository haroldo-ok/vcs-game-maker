'use strict';

// Compiles batari Basic source through the real bB 1.9 toolchain (preprocess
// -> 2600basic -> postprocess -> dasm), running the same WASI-target .wasm
// binaries the user's local install uses, via an in-browser WASI shim -
// bundled at public/bb19/ (see that directory's own layout, mirrored exactly
// from the real bB 1.9 distribution zip).
//
// This replaces the old "batari-basic" npm package, which turned out to be a
// frozen, old snapshot of the compiler (confirmed byte-identical across every
// published npm version) missing features as basic as ";" comments. Every
// output of this module was verified byte-for-byte identical to the same
// source compiled by the real local wasmtime-run toolchain before this
// replaced the npm package.
import {WASI, File, Directory, OpenFile, PreopenDirectory} from '@bjorn3/browser_wasi_shim';

const wasmCache = {};
const fetchWasm = async (path) => {
  if (wasmCache[path]) return wasmCache[path];
  const buf = await fetch(path).then((r) => r.arrayBuffer());
  wasmCache[path] = await WebAssembly.compile(buf);
  return wasmCache[path];
};

// Builds a nested Directory tree from a flat {"a/b/c.asm": content} map -
// paths containing "/" need real intermediate Directory inodes for
// path_open to walk them the way 2600basic.wasm/dasm.wasm expect.
const buildTree = (files) => {
  const root = new Map();
  Object.entries(files).forEach(([relPath, content]) => {
    const parts = relPath.split('/');
    let level = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let sub = level.get(parts[i]);
      if (!sub) {
        sub = new Directory(new Map());
        level.set(parts[i], sub);
      }
      level = sub.contents;
    }
    level.set(parts[parts.length - 1], new File(new TextEncoder().encode(content)));
  });
  return root;
};

// Runs a WASI "command" module to completion. `preopens` maps a preopen name
// (e.g. "." or "/bbinc") to a flat {relativePath: contentString} map.
// `log`, if given, is called once with the equivalent CLI invocation right
// before it runs - lets the caller (hooks/rom.js's buildRom()) surface the
// real batari Basic toolchain commands live in the error console, the same
// way running the actual CLI locally would show them.
// Returns {exitCode, stdout, stderr, dirs, rawFiles, elapsedMs} - `dirs`
// mirrors every preopen's final text contents (for chaining into the next
// stage, matching how the real CLI pipeline shares one physical directory
// across all four tool invocations), `rawFiles` gives the same content as
// raw bytes (needed for main.bin, which isn't valid UTF-8), `elapsedMs` is
// how long the wasm module itself took to run (excludes fetchWasm - cached
// after the first call anyway, see wasmCache above).
const runWasi = async (wasmPath, args, stdinText, preopens, log) => {
  // The shim passes `args` straight through as argv with no synthesized
  // argv[0] - these are clang/wasi-sdk C binaries expecting a real program
  // name in argv[0] (argument parsing starts at argv[1]), so omitting it
  // silently shifts every flag out of place (e.g. "-i" lands in the
  // program-name slot and is never seen as a flag at all).
  const argv = ['program', ...(args || [])];
  const commandName = wasmPath.split('/').pop().replace(/\.wasm$/, '');
  if (log) log(`$ ${[commandName, ...(args || [])].join(' ')}`.trim());
  const mod = await fetchWasm(wasmPath);
  const stdoutBytes = [];
  const stderrBytes = [];

  const dirObjs = {};
  const fds = [
    new OpenFile(new File(new TextEncoder().encode(stdinText || ''))),
    {
      fd_write: (data) => {
        stdoutBytes.push(...data);
        return {ret: 0, nwritten: data.length};
      },
      fd_fdstat_get: () => ({ret: 0, fdstat: null}),
    },
    {
      fd_write: (data) => {
        stderrBytes.push(...data);
        return {ret: 0, nwritten: data.length};
      },
      fd_fdstat_get: () => ({ret: 0, fdstat: null}),
    },
  ];

  Object.entries(preopens || {}).forEach(([name, files]) => {
    const contents = buildTree(files);
    dirObjs[name] = new Directory(contents);
    fds.push(new PreopenDirectory(name, contents));
  });

  const wasi = new WASI(argv, [], fds);
  const inst = await WebAssembly.instantiate(mod, {wasi_snapshot_preview1: wasi.wasiImport});
  let exitCode = 0;
  const startedAt = performance.now();
  try {
    exitCode = wasi.start(inst);
  } catch (e) {
    exitCode = (e && e.code !== undefined) ? e.code : -1;
  }
  const elapsedMs = performance.now() - startedAt;
  const stdout = new TextDecoder().decode(new Uint8Array(stdoutBytes));
  const stderr = new TextDecoder().decode(new Uint8Array(stderrBytes));

  const dirs = {};
  const rawFiles = {};
  Object.entries(dirObjs).forEach(([name, dir]) => {
    dirs[name] = {};
    const collect = (d, prefix) => {
      d.contents.forEach((inode, entryName) => {
        const path = prefix ? prefix + '/' + entryName : entryName;
        if (inode.data) {
          dirs[name][path] = new TextDecoder().decode(inode.data);
          rawFiles[name + '/' + path] = inode.data;
        } else if (inode.contents) {
          collect(inode, path);
        }
      });
    };
    collect(dir, '');
  });

  return {exitCode, stdout, stderr, dirs, rawFiles, elapsedMs};
};

// Matches the real toolchain's own "(N) message" diagnostic format (used by
// preprocess.wasm and 2600basic.wasm), same as the old npm compiler wrapper.
const parseParenErrors = (text) => {
  const re = /[(](\d+)[)]:?\s*(.+)/;
  const errors = [];
  (text || '').split('\n').forEach((line) => {
    const m = re.exec(line);
    if (m) errors.push({line: parseInt(m[1]), msg: m[2]});
  });
  return errors;
};

// Matches DASM's own "file (N): kind: message" diagnostic format.
const parseDasmErrors = (text) => {
  const re = /[/]*([^( ]+)\s*[(](\d+)[)]\s*:\s*(.+?):\s*(.*)/;
  const errors = [];
  (text || '').split('\n').forEach((line) => {
    const m = re.exec(line);
    if (m) errors.push({line: parseInt(m[2]), path: m[1], msg: m[4]});
  });
  return errors;
};

// joinedOverride lets a caller that's already built its own (better-
// annotated) multi-line summary - see assemble()'s main.asm context lines -
// use that verbatim instead of the plain "Line N: msg" default.
const prepareException = (mainMessage, errors, joinedOverride) => {
  const joined = joinedOverride !== undefined ? joinedOverride : errors
      .map((err) => err.msg ? `Line ${err.line}: ${err.msg}` : JSON.stringify(err))
      .join('\n');
  const err = new Error(mainMessage + (joined ? '\n' + joined : ''));
  err.errors = errors;
  return err;
};

export const preprocessBatariBasic = async (code, log) => {
  const r = await runWasi('bb19/preprocess.wasm', [], code, {}, log);
  const errors = parseParenErrors(r.stderr);
  if (errors.length || r.exitCode !== 0) {
    throw prepareException('Errors while preprocessing.', errors.length ? errors : [{line: 0, msg: r.stderr}]);
  }
  if (log) log(`Preprocessing took ${Math.round(r.elapsedMs)}ms.`);
  return r.stdout;
};

let includesManifestPromise = null;
const getIncludesManifest = () => {
  if (!includesManifestPromise) {
    includesManifestPromise = fetch('bb19/includes-manifest.json').then((r) => r.json());
  }
  return includesManifestPromise;
};

// `siblingFiles` are placed in the same directory as the compiled source
// throughout every stage below - the same relationship real files have on
// disk next to a .bas file - so a "inline text12a.asm" style directive (or
// the extended score_graphics.asm swap) resolves the same way it would for a
// real local compile.
const compile = async (preprocessedCode, siblingFiles, log) => {
  const includes = await getIncludesManifest();
  const r = await runWasi('bb19/2600basic.wasm', ['-i', '/bbinc'], preprocessedCode, {
    '.': {...(siblingFiles || {})},
    '/bbinc': includes,
  }, log);
  const errors = parseParenErrors(r.stderr);
  if (errors.length || r.exitCode !== 0) {
    throw prepareException('Errors while compiling.', errors.length ? errors : [{line: 0, msg: r.stderr}]);
  }
  if (log) log(`2600basic took ${Math.round(r.elapsedMs)}ms.`);
  return {bBAsm: r.stdout, workDir: r.dirs['.'], elapsedMs: r.elapsedMs};
};

const postprocess = async (bBAsmContent, workDir, log) => {
  const includes = await getIncludesManifest();
  // 2600basic.sh writes 2600basic.wasm's stdout to a "bB.asm" *file* rather
  // than piping it - postprocess.wasm then opens "bB.asm" by name from ".",
  // the same way it opens every other include, rather than reading stdin.
  const r = await runWasi('bb19/postprocess.wasm', ['-i', '/bbinc'], '', {
    '.': {...workDir, 'bB.asm': bBAsmContent},
    '/bbinc': includes,
  }, log);
  const errors = parseParenErrors(r.stderr);
  if (errors.length || r.exitCode !== 0) {
    throw prepareException('Errors while generating assembly.', errors.length ? errors : [{line: 0, msg: r.stderr}]);
  }
  if (log) log(`postprocess took ${Math.round(r.elapsedMs)}ms.`);
  return {mainAsm: r.stdout, workDir: r.dirs['.'], elapsedMs: r.elapsedMs};
};

const assemble = async (mainAsmContent, workDir, log) => {
  const includes = await getIncludesManifest();
  const r = await runWasi(
      'bb19/dasm.wasm',
      ['main.asm', '-I.', '-I/bbinc/includes', '-f3', '-p20', '-lmain.lst', '-smain.sym', '-omain.bin'],
      '',
      {
        '.': {...workDir, 'main.asm': mainAsmContent},
        '/bbinc': includes,
      },
      log,
  );
  const output = r.rawFiles['./main.bin'];
  const symText = r.dirs['.']['main.sym'];
  // Parsed before the output/symText check below, not after: DASM can fail
  // to produce a binary/symbol table for reasons that have nothing to do
  // with a segment overflow (a real syntax/label error, for instance), and
  // r.stdout still names the actual problem in that case. Silently
  // relabeling every such failure as "maybe segment overflow?" was masking
  // that - and worse, feeding it straight into rom.js's isOverflowError(),
  // which would then "fix" a completely unrelated error by relocating code
  // that was never the actual problem.
  const errors = parseDasmErrors(r.stdout);
  if (errors.length) {
    // DASM's own "Line N" refers to main.asm - the fully macro-expanded
    // assembly DASM actually saw, NOT the bBasic source shown elsewhere in
    // the app (hooks/rom.js's showError annotates against that SOURCE
    // instead, so its line numbers never line up here - confirmed directly:
    // that mismatch was surfacing as a bare "undefined" where the source
    // line should have been, since the bBasic source is far shorter than
    // main.asm and the lookup just fell off the end of it). Annotated here,
    // against main.asm itself (which this function already has in hand),
    // so the real offending line - and a few lines of context around it,
    // since a single line rarely explains a bank/segment-tracking error on
    // its own - travels with the error instead of being silently lost.
    const asmLines = mainAsmContent.split('\n');
    // A generous window before the error (not just a few lines) - an
    // "Origin Reverse-indexed" failure is frequently reported several
    // "bank N"/ECHO-table entries after whatever content actually caused
    // it (DASM's own running PC tracking doesn't go wrong until it reaches
    // the NEXT origin-setting directive, not at the true overflow point
    // itself), so seeing only a handful of lines right at the reported one
    // routinely shows nothing but the compiler's own fixed boilerplate.
    const annotated = errors.map((err) => {
      const header = `Line ${err.line}: ${err.msg}`;
      if (!err.line || err.line < 1 || err.line > asmLines.length) return header;
      const start = Math.max(0, err.line - 40);
      const end = Math.min(asmLines.length, err.line + 5);
      const context = asmLines.slice(start, end)
          .map((text, i) => `${start + i + 1 === err.line ? '>' : ' '} ${start + i + 1}: ${text}`)
          .join('\n');
      return `${header}\n${context}`;
    }).join('\n\n');
    throw prepareException('Errors while assembling.', errors, annotated);
  }
  if (!output || !symText) {
    // Matches the old npm wrapper's own fallback message, which
    // hooks/rom.js's isOverflowError() specifically looks for to trigger its
    // automatic event/graphics relocation retry. Only reached now when DASM
    // failed to produce output AND left no parseable error of its own -
    // genuinely the "ran out of room, no specific line to blame" case.
    throw prepareException('Errors while assembling.', [{line: 0, msg: 'No symbol table generated, maybe segment overflow?'}]);
  }
  const symbolmap = {};
  symText.split('\n').forEach((line) => {
    const toks = line.trim().split(/\s+/);
    if (toks.length >= 2 && !toks[0].startsWith('-')) symbolmap[toks[0]] = parseInt(toks[1], 16);
  });
  if (log) log(`Assembling took ${Math.round(r.elapsedMs)}ms.`);
  return {output, symbolmap};
};

/**
 * Compiles bBasic source (already run through preprocessBatariBasic) down to
 * a single combined assembly file, without assembling it yet - the caller
 * gets a chance to patch the assembly text itself (see hooks/rom.js's
 * Superchip pfcolors pointer fix) before handing it to assembleBatariBasic.
 * `siblingFiles` is a flat {filename: content} map of any extra files that
 * need to sit next to the source throughout compilation (currently the Text
 * Minikernel's text12a.asm/text12b.asm and, when active, its extended
 * score_graphics.asm).
 * @param {string} preprocessedCode
 * @param {!Object<string, string>} siblingFiles
 * @param {function(string)=} log Called with each underlying tool's own CLI
 *   invocation, and this stage's total elapsed time once both tools finish.
 * @return {!Promise<{mainAsm: string, workDir: !Object<string, string>}>}
 */
export const compileBatariBasicToAsm = async (preprocessedCode, siblingFiles, log) => {
  const compiled = await compile(preprocessedCode, siblingFiles, log);
  const result = await postprocess(compiled.bBAsm, compiled.workDir, log);
  if (log) log(`Compiling took ${Math.round(compiled.elapsedMs + result.elapsedMs)}ms.`);
  return result;
};

/**
 * Assembles the combined asm text from compileBatariBasicToAsm into a ROM
 * binary.
 * @param {string} mainAsm
 * @param {!Object<string, string>} workDir
 * @param {function(string)=} log Called with the underlying tool's own CLI
 *   invocation, and this stage's elapsed time once it finishes.
 * @return {!Promise<{output: !Uint8Array, symbolmap: !Object<string, number>}>}
 */
export const assembleBatariBasic = (mainAsm, workDir, log) => assemble(mainAsm, workDir, log);
