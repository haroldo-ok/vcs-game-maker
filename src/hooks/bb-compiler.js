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
// Returns {exitCode, stdout, stderr, dirs, rawFiles} - `dirs` mirrors every
// preopen's final text contents (for chaining into the next stage, matching
// how the real CLI pipeline shares one physical directory across all four
// tool invocations), `rawFiles` gives the same content as raw bytes (needed
// for main.bin, which isn't valid UTF-8).
const runWasi = async (wasmPath, args, stdinText, preopens) => {
  // The shim passes `args` straight through as argv with no synthesized
  // argv[0] - these are clang/wasi-sdk C binaries expecting a real program
  // name in argv[0] (argument parsing starts at argv[1]), so omitting it
  // silently shifts every flag out of place (e.g. "-i" lands in the
  // program-name slot and is never seen as a flag at all).
  const argv = ['program', ...(args || [])];
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
  try {
    exitCode = wasi.start(inst);
  } catch (e) {
    exitCode = (e && e.code !== undefined) ? e.code : -1;
  }
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

  return {exitCode, stdout, stderr, dirs, rawFiles};
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

const prepareException = (mainMessage, errors) => {
  const joined = errors
      .map((err) => err.msg ? `Line ${err.line}: ${err.msg}` : JSON.stringify(err))
      .join('\n');
  const err = new Error(mainMessage + (joined ? '\n' + joined : ''));
  err.errors = errors;
  return err;
};

export const preprocessBatariBasic = async (code) => {
  const r = await runWasi('bb19/preprocess.wasm', [], code, {});
  const errors = parseParenErrors(r.stderr);
  if (errors.length || r.exitCode !== 0) {
    throw prepareException('Errors while preprocessing.', errors.length ? errors : [{line: 0, msg: r.stderr}]);
  }
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
const compile = async (preprocessedCode, siblingFiles) => {
  const includes = await getIncludesManifest();
  const r = await runWasi('bb19/2600basic.wasm', ['-i', '/bbinc'], preprocessedCode, {
    '.': {...(siblingFiles || {})},
    '/bbinc': includes,
  });
  const errors = parseParenErrors(r.stderr);
  if (errors.length || r.exitCode !== 0) {
    throw prepareException('Errors while compiling.', errors.length ? errors : [{line: 0, msg: r.stderr}]);
  }
  return {bBAsm: r.stdout, workDir: r.dirs['.']};
};

const postprocess = async (bBAsmContent, workDir) => {
  const includes = await getIncludesManifest();
  // 2600basic.sh writes 2600basic.wasm's stdout to a "bB.asm" *file* rather
  // than piping it - postprocess.wasm then opens "bB.asm" by name from ".",
  // the same way it opens every other include, rather than reading stdin.
  const r = await runWasi('bb19/postprocess.wasm', ['-i', '/bbinc'], '', {
    '.': {...workDir, 'bB.asm': bBAsmContent},
    '/bbinc': includes,
  });
  const errors = parseParenErrors(r.stderr);
  if (errors.length || r.exitCode !== 0) {
    throw prepareException('Errors while generating assembly.', errors.length ? errors : [{line: 0, msg: r.stderr}]);
  }
  return {mainAsm: r.stdout, workDir: r.dirs['.']};
};

const assemble = async (mainAsmContent, workDir) => {
  const includes = await getIncludesManifest();
  const r = await runWasi(
      'bb19/dasm.wasm',
      ['main.asm', '-I.', '-I/bbinc/includes', '-f3', '-p20', '-lmain.lst', '-smain.sym', '-omain.bin'],
      '',
      {
        '.': {...workDir, 'main.asm': mainAsmContent},
        '/bbinc': includes,
      },
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
    throw prepareException('Errors while assembling.', errors);
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
 * @return {!Promise<{mainAsm: string, workDir: !Object<string, string>}>}
 */
export const compileBatariBasicToAsm = async (preprocessedCode, siblingFiles) => {
  const compiled = await compile(preprocessedCode, siblingFiles);
  return postprocess(compiled.bBAsm, compiled.workDir);
};

/**
 * Assembles the combined asm text from compileBatariBasicToAsm into a ROM
 * binary.
 * @param {string} mainAsm
 * @param {!Object<string, string>} workDir
 * @return {!Promise<{output: !Uint8Array, symbolmap: !Object<string, number>}>}
 */
export const assembleBatariBasic = (mainAsm, workDir) => assemble(mainAsm, workDir);
