'use strict';

// Compiles batari Basic source through the real bB 1.9 toolchain (preprocess
// -> 2600basic -> postprocess -> dasm), running the same WASI-target .wasm
// binaries the user's local install uses, via an in-browser WASI shim -
// bundled at public/bb19/ (see that directory's  layout, mirrored exactly
// from the real bB 1.9 distribution zip).
//
// This replaces the old "batari-basic" npm package, which turned out to be a
// frozen, old snapshot of the compiler (confirmed byte-identical across every
// published npm version) missing features as basic as ";" comments. Every
// output of this module was verified byte-for-byte identical to the same
// source compiled by the real local wasmtime-run toolchain before this
// replaced the npm package.
import {WASI, File, Directory, OpenFile, PreopenDirectory} from '@bjorn3/browser_wasi_shim';

import {adaptFor64k} from '../utils/bank64-returns';

const wasmCache = {};
const fetchWasm = async (path) => {
  if (wasmCache[path]) return wasmCache[path];
  const buf = await fetch(path).then((r) => r.arrayBuffer());
  wasmCache[path] = await WebAssembly.compile(buf);
  return wasmCache[path];
};

// Encodes a "byte string" (one JS char code 0-255 per original file byte -
// how includes-manifest.json's content, and every real file on disk read
// via a byte-preserving codec, represents itself once loaded into memory)
// back into the exact original bytes. NOT the same as `TextEncoder`, which
// assumes `content` is real Unicode text and UTF-8-encodes it - lossy for
// anything that isn't valid UTF-8, which binary includes like DPCplus.arm
// or custom2.bin (arbitrary ARM machine code) generally aren't. Every
// include this app ships is either plain ASCII (where the two encoders
// agree byte-for-byte) or one of these binary files, so this is safe
// everywhere `buildTree` uses it.
const toBytes = (content) => {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i) & 0xFF;
  return bytes;
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
    level.set(parts[parts.length - 1], new File(toBytes(content)));
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
  // (Chunks, not one array of numbers: a program's output can be megabytes, which as numbers in an array takes eight times that.)
  const stdoutBytes = [];
  const stderrBytes = [];

  const dirObjs = {};
  const fds = [
    new OpenFile(new File(new TextEncoder().encode(stdinText || ''))),
    {
      fd_write: (data) => {
        stdoutBytes.push(Uint8Array.from(data));
        return {ret: 0, nwritten: data.length};
      },
      fd_fdstat_get: () => ({ret: 0, fdstat: null}),
    },
    {
      fd_write: (data) => {
        stderrBytes.push(Uint8Array.from(data));
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
  const joinChunks = (chunks) => {
    const joined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let at = 0;
    chunks.forEach((chunk) => {
      joined.set(chunk, at);
      at += chunk.length;
    });
    return joined;
  };
  const stdout = new TextDecoder().decode(joinChunks(stdoutBytes));
  const stderr = new TextDecoder().decode(joinChunks(stderrBytes));

  const dirs = {};
  const rawFiles = {};
  Object.entries(dirObjs).forEach(([name, dir]) => {
    dirs[name] = {};
    const collect = (d, prefix) => {
      d.contents.forEach((inode, entryName) => {
        const path = prefix ? prefix + '/' + entryName : entryName;
        if (inode.data) {
          // A file the caller put there and the tool left alone goes back as it came (a byte string): decoding it as text would
          // lose the bytes that are not valid UTF-8, which for a binary file like the DPC+ coprocessor program (custom2.bin) changes
          // it, and the next tool in the chain gets the damaged copy.
          const original = preopens && preopens[name] ? preopens[name][path] : undefined;
          const unchanged = typeof original === 'string' && original.length === inode.data.length &&
            inode.data.every((byte, i) => (original.charCodeAt(i) & 0xFF) === byte);
          dirs[name][path] = unchanged ? original : new TextDecoder().decode(inode.data);
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

// Matches the real toolchain's "(N) message" diagnostic format (used by
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

// Matches DASM's "file (N): kind: message" diagnostic format.
const parseDasmErrors = (text) => {
  const re = /[/]*([^( ]+)\s*[(](\d+)[)]\s*:\s*(.+?):\s*(.*)/;
  const errors = [];
  (text || '').split('\n').forEach((line) => {
    const m = re.exec(line);
    if (m) errors.push({line: parseInt(m[2]), path: m[1], msg: m[4]});
  });
  return errors;
};

// joinedOverride lets a caller that's already built its (better-
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

// The PXE kernel's newer compiler, preprocessor and postprocessor (from the PXE batari Basic fork; they know the PXE statements and symbols
// of its includes, and reject some code the other kernels' generator makes, so the other kernels keep the stock ones). Chosen by the
// `set kernel PXE` line when the code is preprocessed, the first stage.
let pxeToolchain = false;
// A DPC+ ROM gets a shorter way to jump to another bank when no register has to survive (see cheapBankJumps in rom.js), and the room in
// every bank for it: 4 more bytes of the bank switching code that sits at the same place in every bank.
let dpcPlusBankJump = false;
export const BANK_GOTO_LABEL = 'BS_goto';
const withBankGoto = (text) => text
    .replace(';size=32', ';size=36')
    .replace(/(\r?\n)( if \(\(\* & \$1FFF\) > )/, (all, eol, rest) =>
      `${eol}${BANK_GOTO_LABEL}${eol} lda bankswitch_hotspot-1,x${eol} rts${eol}${rest}`);
const toolchainPath = (name) => `bb19/${pxeToolchain ? 'pxe/' : ''}${name}.wasm`;

export const preprocessBatariBasic = async (code, log) => {
  pxeToolchain = /^\s*set\s+kernel\s+PXE/mi.test(code);
  dpcPlusBankJump = /^\s*set\s+kernel\s+DPC\+/mi.test(code);
  // A 64k ROM needs its gosubs and returns rewritten for bankswitching (see utils/bank64-returns.js).
  const r = await runWasi(toolchainPath('preprocess'), [], adaptFor64k(code), {}, log);
  const errors = parseParenErrors(r.stderr);
  if (errors.length || r.exitCode !== 0) {
    throw prepareException('Errors while preprocessing.', errors.length ? errors : [{line: 0, msg: r.stderr}]);
  }
  if (log) log(`Preprocessing took ${Math.round(r.elapsedMs)}ms.`);
  return r.stdout;
};

let includesManifestPromise = null;
const getIncludesManifest = async () => {
  if (!includesManifestPromise) {
    includesManifestPromise = fetch('bb19/includes-manifest.json').then((r) => r.json());
  }
  const includes = await includesManifestPromise;
  const banksw = includes['includes/banksw.asm'];
  return dpcPlusBankJump && banksw ? {...includes, 'includes/banksw.asm': withBankGoto(banksw)} : includes;
};

// Every name the assembly files of the kernels use (the include files, and the Text Minikernel's files, which are pasted in): a variable named there is read or
// written by hand-written assembly that the generator's analysis of the code it makes does not see (the score kernel's minikernel reads scorebkcolor, for one).
const KERNEL_TEXT_FILES = ['bb19/text-minikernel/text12a.asm', 'bb19/text-minikernel/text12b.asm', 'bb19/text-minikernel/text12DPCplus.asm'];
let includeIdentifiersPromise = null;
export const getIncludeIdentifiers = () => {
  if (!includeIdentifiersPromise) {
    includeIdentifiersPromise = Promise.all([getIncludesManifest(),
      ...KERNEL_TEXT_FILES.map((file) => fetch(file).then((r) => (r.ok ? r.text() : '')).catch(() => ''))]).then(([includes, ...texts]) => {
      const names = new Set();
      const add = (text) => {
        for (const m of String(text).matchAll(/[A-Za-z_]\w*/g)) names.add(m[0]);
      };
      Object.entries(includes).forEach(([file, text]) => {
        if (/\.(asm|h|inc)(\.|$)/i.test(file)) add(text);
      });
      texts.forEach(add);
      return names;
    });
  }
  return includeIdentifiersPromise;
};

// `siblingFiles` are placed in the same directory as the compiled source
// throughout every stage below - the same relationship real files have on
// disk next to a .bas file - so a "inline text12a.asm" style directive (or
// the extended score_graphics.asm swap) resolves the same way it would for a
// real local compile.
const compile = async (preprocessedCode, siblingFiles, log) => {
  const includes = await getIncludesManifest();
  const r = await runWasi(toolchainPath('2600basic'), ['-i', '/bbinc'], preprocessedCode, {
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
  const r = await runWasi(toolchainPath('postprocess'), ['-i', '/bbinc'], '', {
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

// Shared with the success path below and with the error-path diagnostic
// capture (see assemble()'s  comment on partialOutput/partialSymbolmap) -
// factored out so both places parse DASM's  symbol table text identically
// rather than risking the two drifting apart.
const parseSymbolmap = (symText) => {
  const symbolmap = {};
  (symText || '').split('\n').forEach((line) => {
    const toks = line.trim().split(/\s+/);
    if (toks.length >= 2 && !toks[0].startsWith('-')) symbolmap[toks[0]] = parseInt(toks[1], 16);
  });
  return symbolmap;
};

// The assembly with every bank given separate room in the output file (the origin of a bank in the file is moved up by 64 KB for each 4 KB
// before it; the addresses the program sees do not change), so that a bank that is too full is measured instead of stopping the assembly at
// the first one that runs into the next. The result is only read for its "bytes of ROM space left in bank N" lines and its symbol table.
const spreadBanksInFile = (asm) => asm.replace(/^(\s*)(ORG)(\s+)\$([0-9A-Fa-f]+)/gim, (match, indent, word, gap, hex) => {
  const value = parseInt(hex, 16);
  // (The origins near the end of a bank page, where the bank switching code and the vectors go, are put 32 KB further on: the code of a bank that is over
  // runs far past its 4 KB.)
  const tail = (value & 0xFFF) >= 0xF00 ? 0x8000 : 0;
  return `${indent}${word}${gap}$${(value + (value >> 12) * 0x10000 + tail).toString(16)}`;
});

// Assembles the spread version of a program that did not fit and returns what it measured (null when that did not assemble either):
// {stdout, symbolmap}: the room left in every bank (below zero for a bank that is over) and the address of every label.
const measureBanks = async (mainAsmContent, workDir, includes, log) => {
  try {
    const r = await runWasi(
        'bb19/dasm.wasm',
        ['main.asm', '-I.', '-I/bbinc/includes', '-f3', '-p20', '-smain.sym', '-omain.bin'],
        '',
        {'.': {...workDir, 'main.asm': spreadBanksInFile(mainAsmContent)}, '/bbinc': includes},
        null,
    );
    const symText = r.dirs['.']['main.sym'];
    const failed = parseDasmErrors(r.stdout);
    if (failed.length || !symText || !/bytes of ROM space left in bank/.test(r.stdout)) {
      const lines = spreadBanksInFile(mainAsmContent).split(String.fromCharCode(10));
      if (log) {
        log(`Measuring every bank did not work: ${failed.length ? `${failed[0].msg} (line ${failed[0].line}: ${lines.slice(Math.max(0, failed[0].line - 12), failed[0].line).join(' / ')})` :
          !symText ? 'no symbol table' : 'no room reported'}.`);
      }
      return null;
    }
    if (log) log(`Measuring every bank took ${Math.round(r.elapsedMs)}ms.`);
    return {stdout: r.stdout, symbolmap: parseSymbolmap(symText)};
  } catch (e) {
    if (log) log(`Measuring every bank did not work: ${e.message}`);
    return null;
  }
};

// The compiler makes "if <condition> then goto <label>" a branch over a jmp: "Bxx .skipLn", ".condpartm", "jmp <label>", ".skipLn" (5 bytes; 5 cycles
// when it goes to the label, 3 when it does not). Where the label is in branch range, one branch with the opposite condition to the label does the same
// (2 bytes; 3 cycles when it goes to the label, 2 when it does not). The addresses come from the symbol table of an assembly; the range is checked with a
// margin (taking jmps out only brings labels closer, but an align or a page padding between could move them apart), and the program is assembled again:
// when that does not work, the first one is kept. A ".condpartm" that anything else goes to (the second test of an "or") is left as it is.
const OPPOSITE_BRANCH = {BEQ: 'BNE', BNE: 'BEQ', BCC: 'BCS', BCS: 'BCC', BMI: 'BPL', BPL: 'BMI', BVC: 'BVS', BVS: 'BVC'};
const BRANCH_RANGE_MARGIN = 100;
export const shortenBranchesOverJumps = (asm, symbolmap) => {
  const lines = asm.split('\n');
  // The address of a label: a global one by its name, a local one (".name") by the scoped name DASM lists ("0.name"), when only one scope has it.
  const scoped = {};
  Object.keys(symbolmap).forEach((key) => {
    const m = /^\d+\.(.+)$/.exec(key);
    if (m) scoped[m[1]] = scoped[m[1]] === undefined ? symbolmap[key] : null;
  });
  const addressOf = (label) => (label.startsWith('.') ? scoped[label.slice(1)] : symbolmap[label]);
  const branch = /^\s+(BEQ|BNE|BCC|BCS|BMI|BPL|BVC|BVS)\s+\.(skipL\w+)\s*$/i;
  const references = (name) => (asm.match(new RegExp(`\\.${name}\\b`, 'g')) || []).length;
  let count = 0;
  for (let i = 0; i + 3 < lines.length; i++) {
    const b = branch.exec(lines[i]);
    if (!b) continue;
    const condpart = /^\.(condpart\d+)\s*$/.exec(lines[i + 1]);
    const jump = /^\s+jmp\s+(\S+)\s*$/i.exec(lines[i + 2] || '');
    if (!condpart || !jump) continue;
    let k = i + 3;
    while (k < lines.length && lines[k].trim() === '') k++;
    if (k >= lines.length || lines[k].trim() !== `.${b[2]}`) continue;
    if (references(condpart[1]) !== 1) continue;
    const from = addressOf(`.${condpart[1]}`);
    const to = addressOf(jump[1]);
    if (typeof from !== 'number' || typeof to !== 'number') continue;
    // (The new branch ends where .condpartm is now.)
    if (Math.abs(to - from) > BRANCH_RANGE_MARGIN) continue;
    lines[i] = `\t${OPPOSITE_BRANCH[b[1].toUpperCase()]} ${jump[1]}`;
    lines[i + 2] = '';
    count++;
  }
  return {asm: lines.join('\n'), count};
};

// Two more things the compiler's code for statements does that can go (only its code: the compiler writes its instructions with a tab, in capitals, and
// nothing else in the program does, so the kernels and the asm blocks, where the cycles may be counted, are left alone):
// - "LDA x", "CMP #0" before BEQ, BNE, BMI or BPL: the load has set the zero and negative flags the same way (the compare also sets the carry, which those
//   branches do not look at, and the compiler sets the carry itself before an add or a subtract): 2 bytes, 2 cycles.
// - "LDA v", "STA y", "LDA v": the second load gives A and the flags they have already: 2 bytes, 2 or 3 cycles. For a number always; for a byte only when it is
//   in the RAM of the console ($80 to $FF), never a register of the chips or the cartridge (on DPC+ "rand" is a fetcher that gives the next number when read).
// Lines between that are not instructions (blank lines, the compiler's line comments, its ".L" labels of statements, which nothing goes to) are passed over.
const isPassedOver = (line) => line.trim() === '' || /^\s*;/.test(line) || /^\.L\d+ ;;line \d+;;/.test(line) || /^\.\s*$/.test(line);
export const trimCompiledCode = (asm, symbolmap) => {
  const lines = asm.split('\n');
  const next = (i) => {
    let k = i + 1; while (k < lines.length && isPassedOver(lines[k])) k++; return k;
  };
  const inRam = (operand) => /^#/.test(operand) || (/^\w+$/.test(operand) && typeof symbolmap[operand] === 'number' && symbolmap[operand] >= 0x80 && symbolmap[operand] <= 0xFF);
  let compares = 0;
  let loads = 0;
  for (let i = 0; i < lines.length; i++) {
    const load = /^\tLDA (\S+)\s*$/.exec(lines[i]);
    if (!load) continue;
    const j = next(i);
    if (j >= lines.length) break;
    if (/^\tCMP #0\s*$/.test(lines[j]) && /^\s+(BEQ|BNE|BMI|BPL)\s/i.test(lines[next(j)] || '')) {
      lines[j] = '';
      compares++;
      continue;
    }
    // (Over any number of stores: a number put in several bytes is loaded once.)
    if (/^\tSTA \S+\s*$/.test(lines[j]) && inRam(load[1])) {
      const again = new RegExp(`^\\tLDA ${load[1].replace(/[$#^.*+?()[\]{}|\\]/g, (c) => `\\${c}`)}\\s*$`);
      let k = next(j);
      while (k < lines.length) {
        if (/^\tSTA \S+\s*$/.test(lines[k])) k = next(k);
        else if (again.test(lines[k])) {
          lines[k] = '';
          loads++;
          k = next(k);
        } else break;
      }
    }
  }
  return {asm: lines.join('\n'), compares, loads};
};

// (A program that is too big for a bank is shortened too, with the addresses of the measuring assembly, which gives every bank its room: the bytes it saves can
// make it fit without moving anything to another bank.)
// DPC+: the variables in the display memory and the flag bytes there are read and written through data fetcher 6 (the generator's asm, two-space
// indented): the pointer is set (low byte, high byte), DF6DATA read or DF6WRITE written, and a read is kept in temp5 or temp6. Followed line by line
// (with the addresses of an assembly), the pointer and what the two scratch bytes hold are known between labels:
// - a read of a byte that the scratch byte it goes to holds already (read before, not written since) is "lda tempN" instead: the same A and flags,
//   3 cycles instead of 19;
// - the high byte of the pointer is not set again when the pointer has it already (6 cycles), when A is loaded next anyway.
// Anything else that could change them (a label something goes to, a call, a jump, a return, an assembler line it does not know) makes them unknown.
const SCRATCH_BYTES = ['temp5', 'temp6'];
const FETCHER_LINE = /^  \S/;
export const trimDisplayMemoryAccess = (asm, symbolmap) => {
  if (typeof symbolmap.DF6LOW !== 'number' || typeof symbolmap.DF6DATA !== 'number') return {asm, reads: 0, highs: 0, flags: 0};
  const lines = asm.split('\n');
  const valueOf = (expression) => {
    const text = expression.trim();
    let m = /^#<\(([A-Za-z_]\w*)\+(\d+)\)$/.exec(text);
    if (m && typeof symbolmap[m[1]] === 'number') return (symbolmap[m[1]] + +m[2]) & 0xFF;
    m = /^#\(>\(([A-Za-z_]\w*)\+(\d+)\)\)\s*&\s*\$0F$/i.exec(text);
    if (m && typeof symbolmap[m[1]] === 'number') return ((symbolmap[m[1]] + +m[2]) >> 8) & 0x0F;
    m = /^#(\$[0-9a-f]+|%[01]+|\d+)$/i.exec(text);
    if (m) return m[1][0] === '$' ? parseInt(m[1].slice(1), 16) & 0xFF : m[1][0] === '%' ? parseInt(m[1].slice(1), 2) & 0xFF : +m[1] & 0xFF;
    return null;
  };
  let lo = null;
  let hi = null;
  let reg = {a: null, x: null, y: null};
  // what A holds when it is a byte of the display memory (its address), and what each scratch byte holds
  let aHolds = null;
  let holds = {temp5: null, temp6: null};
  const forget = () => {
    lo = null; hi = null; reg = {a: null, x: null, y: null}; aHolds = null; holds = {temp5: null, temp6: null};
  };
  const address = () => (lo !== null && hi !== null ? (hi << 8) | lo : null);
  const step = () => {
    if (lo === null) return;
    lo = (lo + 1) & 0xFF;
    if (lo === 0) hi = hi === null ? null : (hi + 1) & 0x0F;
  };
  const instructionOf = (line) => {
    const text = line.replace(/;.*$/, '').trim();
    const [op, ...rest] = text.split(/\s+/);
    return {op: (op || '').toLowerCase(), operand: rest.join(' ')};
  };
  // The next line that is an instruction (passing over blank lines and the compiler's statement labels and comments).
  const passedOver = (line) => line.trim() === '' || /^\s*;/.test(line) || /^\.L\d+ ;;line \d+;;/.test(line) || /^\.\s*$/.test(line);
  const nextInstruction = (i) => {
    let k = i + 1; while (k < lines.length && passedOver(lines[k])) k++; return k;
  };
  // After a read the pointer is on the next byte, and code after it may read that one without setting the pointer (adjacent bytes are read that way): a read is
  // only left out when, from the line after it, the pointer is set before fetcher 6 is read or written (or a label or a call comes first, after which
  // nothing counts on it).
  const setsPointerFirst = (from) => {
    for (let k = from + 1; k < lines.length; k++) {
      if (passedOver(lines[k])) continue;
      if (/^\S/.test(lines[k])) return true;
      const {op, operand} = instructionOf(lines[k]);
      if (/^DF6(DATA|WRITE)$/.test(operand)) return false;
      if (/^st[axy]$/.test(op) && operand === 'DF6LOW') return true;
      if (/^(jsr|jmp|rts|rti)$/.test(op)) return true;
    }
    return true;
  };
  let reads = 0;
  let highs = 0;
  let flags = 0;
  // A store to the display memory keeps the flags around its pointer setting ("php" ... "plp", with only pha/pla, the pointer and the write between): only the
  // zero and negative flags change in between (the loads and pla; the carry and the overflow flag are not touched). Left out when the next instruction sets
  // those two without reading them (a load, a transfer, a compare, a calculation): 7 cycles and 2 bytes. Not before a label, a branch, a jump or a return.
  const SETS_NZ = /^(lda|ldx|ldy|pla|tax|tay|txa|tya|tsx|and|ora|eor|adc|sbc|cmp|cpx|cpy|inx|iny|dex|dey)$/;
  for (let i = 0; i < lines.length; i++) {
    if (!FETCHER_LINE.test(lines[i]) || instructionOf(lines[i]).op !== 'php') continue;
    let k = nextInstruction(i);
    let ok = true;
    while (k < lines.length && FETCHER_LINE.test(lines[k])) {
      const {op, operand} = instructionOf(lines[k]);
      if (op === 'plp') break;
      const allowed = op === 'pha' || op === 'pla' || (op === 'lda' && /^#/.test(operand)) ||
        (/^st[axy]$/.test(op) && /^DF6(LOW|HI|WRITE)$/.test(operand)) || (/^ld[xy]$/.test(op) && /^#/.test(operand));
      if (!allowed) {
        ok = false;
        break;
      }
      k = nextInstruction(k);
    }
    if (!ok || k >= lines.length || instructionOf(lines[k]).op !== 'plp') continue;
    const after = nextInstruction(k);
    if (after >= lines.length || /^\S/.test(lines[after]) || !SETS_NZ.test(instructionOf(lines[after]).op)) continue;
    lines[i] = '';
    lines[k] = '';
    flags++;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (passedOver(line)) continue;
    if (/^\S/.test(line)) {
      forget();
      continue;
    }
    const {op, operand} = instructionOf(line);
    const target = operand.replace(/\s+/g, '');
    // A read block of the generator: pointer low, pointer high, lda DF6DATA, sta tempN.
    if (FETCHER_LINE.test(line) && op === 'lda' && /^#<\(/.test(operand)) {
      const k1 = nextInstruction(i); const k2 = nextInstruction(k1); const k3 = nextInstruction(k2); const k4 = nextInstruction(k3); const k5 = nextInstruction(k4);
      const i1 = instructionOf(lines[k1] || ''); const i2 = instructionOf(lines[k2] || ''); const i3 = instructionOf(lines[k3] || '');
      const i4 = instructionOf(lines[k4] || ''); const i5 = instructionOf(lines[k5] || '');
      const want = (valueOf(operand) !== null && i2.op === 'lda' && valueOf(i2.operand) !== null) ? (valueOf(i2.operand) << 8) | valueOf(operand) : null;
      if (want !== null && [k1, k2, k3, k4, k5].every((k) => FETCHER_LINE.test(lines[k] || '')) &&
          i1.op === 'sta' && i1.operand === 'DF6LOW' && i3.op === 'sta' && i3.operand === 'DF6HI' && i4.op === 'lda' && i4.operand === 'DF6DATA' &&
          i5.op === 'sta' && SCRATCH_BYTES.includes(i5.operand) && holds[i5.operand] === want && setsPointerFirst(k5)) {
        lines[i] = `  lda ${i5.operand}`;
        [k1, k2, k3, k4, k5].forEach((k) => {
          lines[k] = '';
        });
        reads++;
        reg.a = null;
        aHolds = want;
        i = k5;
        continue;
      }
    }
    // The high byte of the pointer set to what it is already, with A loaded again next: left out.
    if (FETCHER_LINE.test(line) && op === 'lda' && /^#\(>\(/.test(operand)) {
      const k1 = nextInstruction(i); const k2 = nextInstruction(k1);
      const i1 = instructionOf(lines[k1] || ''); const i2 = instructionOf(lines[k2] || '');
      const value = valueOf(operand);
      if (value !== null && hi === value && FETCHER_LINE.test(lines[k1] || '') && i1.op === 'sta' && i1.operand === 'DF6HI' &&
          (i2.op === 'lda' || i2.op === 'pla') && !/,\s*a\b/i.test(i2.operand)) {
        lines[i] = '';
        lines[k1] = '';
        highs++;
        i = k1;
        continue;
      }
    }
    // Following the code.
    const regOf = {lda: 'a', ldx: 'x', ldy: 'y'};
    const storeOf = {sta: 'a', stx: 'x', sty: 'y'};
    if (regOf[op]) {
      reg[regOf[op]] = /^#/.test(operand) ? valueOf(operand) : null;
      if (op === 'lda') aHolds = operand === 'DF6DATA' ? address() : (SCRATCH_BYTES.includes(operand) ? holds[operand] : null);
      if (operand === 'DF6DATA') step();
      continue;
    }
    if (storeOf[op]) {
      const value = reg[storeOf[op]];
      if (operand === 'DF6LOW') lo = value;
      else if (operand === 'DF6HI') hi = value;
      else if (operand === 'DF6WRITE') {
        const at = address();
        SCRATCH_BYTES.forEach((name) => {
          if (holds[name] !== null && (at === null || holds[name] === at)) holds[name] = null;
        });
        step();
      } else if (SCRATCH_BYTES.includes(target)) holds[target] = op === 'sta' ? aHolds : null;
      else if (/^DF\d/.test(operand)) forget();
      continue;
    }
    if (/^(inc|dec|asl|lsr|rol|ror)$/.test(op)) {
      if (!operand || /^a$/i.test(operand)) {
        reg.a = null; aHolds = null;
      } else if (SCRATCH_BYTES.includes(target)) holds[target] = null;
      else if (/^DF\d/.test(operand)) forget();
      continue;
    }
    if (/^(adc|sbc|and|ora|eor|pla|txa|tya)$/.test(op)) {
      reg.a = null; aHolds = null;
      if (/^DF6DATA$/.test(operand)) step();
      continue;
    }
    if (/^(tax|tsx|inx|dex)$/.test(op)) {
      reg.x = null; continue;
    }
    if (/^(tay|iny|dey)$/.test(op)) {
      reg.y = null; continue;
    }
    if (/^(cmp|cpx|cpy|bit|clc|sec|cld|sed|cli|sei|clv|nop|pha|php|plp|txs|bcc|bcs|beq|bne|bmi|bpl|bvc|bvs)$/.test(op)) {
      if (/^DF6DATA$/.test(operand)) step();
      continue;
    }
    // (a jsr, jmp, rts, a macro or an assembler line)
    forget();
  }
  return {asm: lines.join('\n'), reads, highs, flags};
};

// The shorter code (shortenBranchesOverJumps and trimCompiledCode, with the addresses of an assembly) and a line for the log; null when nothing changes.
const shorterCode = (asm, symbolmap) => {
  const fetched = trimDisplayMemoryAccess(asm, symbolmap);
  const trimmed = trimCompiledCode(fetched.asm, symbolmap);
  const short = shortenBranchesOverJumps(trimmed.asm, symbolmap);
  const bytes = short.count * 3 + trimmed.compares * 2 + trimmed.loads * 2 + fetched.reads * 13 + fetched.highs * 5 + fetched.flags * 2;
  if (!bytes) return null;
  const parts = [short.count ? `${short.count} "if ... then goto" tests are one branch instead of a branch and a jump` : '',
    trimmed.compares ? `${trimmed.compares} compares with 0 after a load are left out` : '',
    trimmed.loads ? `${trimmed.loads} loads of a value A already holds are left out` : '',
    fetched.reads ? `${fetched.reads} reads of the display memory take the byte already read` : '',
    fetched.highs ? `${fetched.highs} high bytes of the display memory pointer are not set again` : '',
    fetched.flags ? `${fetched.flags} stores to the display memory do not keep flags nothing reads` : ''].filter(Boolean);
  return {asm: short.asm, note: `${parts.join('; ')} (${bytes} bytes less)`};
};

const assemble = async (mainAsmContent, workDir, log) => {
  let first;
  try {
    first = await assembleOnce(mainAsmContent, workDir, log);
  } catch (e) {
    const measured = e.measured && e.measured.symbolmap;
    const shorter = measured ? shorterCode(mainAsmContent, measured) : null;
    if (!shorter) throw e;
    try {
      const fitted = await assembleOnce(shorter.asm, workDir, null);
      if (log) log(`${shorter.note}, which made the program fit.`);
      return fitted;
    } catch (e2) {
      throw e;
    }
  }
  const shorter = shorterCode(mainAsmContent, first.symbolmap);
  if (!shorter) return first;
  try {
    const second = await assembleOnce(shorter.asm, workDir, null);
    if (log) log(`${shorter.note}.`);
    return second;
  } catch (e) {
    if (log) log(`The shorter code did not assemble (${e.message}); the program is kept as it was.`);
    return first;
  }
};

const assembleOnce = async (mainAsmContent, workDir, log) => {
  const includes = await getIncludesManifest();
  const r = await runWasi(
      'bb19/dasm.wasm',
      ['main.asm', '-I.', '-I/bbinc/includes', '-f3', '-p20', '-smain.sym', '-omain.bin'],
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
  // DASM writes main.bin/main.sym to the WASI filesystem as it goes, not
  // only on a clean exit - runWasi's  rawFiles/dirs capture is
  // unconditional (see its  comment), so whatever partial output/symbol
  // table DASM managed to produce before hitting a segment overflow is
  // already sitting right here, even though the two throws below used to
  // discard it. Attached to both thrown exceptions (as best-effort,
  // possibly-undefined properties - DASM may not have written a symbol
  // table at all for some failures, e.g. a genuine syntax error before pass
  // 2 ever starts) purely as diagnostic capture: hooks/rom.js's overflow
  // handling doesn't read these yet, this is step one of confirming
  // whether DASM's  partial symbol table is even usable (specifically,
  // whether "scoretable" - the same symbol utils/rom-capacity.js's
  // computeRomCapacity keys off of - exists and is trustworthy in an
  // overflowed bank) before building anything that acts on it.
  const partialOutput = output;
  const partialSymbolmap = symText ? parseSymbolmap(symText) : undefined;
  if (errors.length) {
    // DASM's "Line N" refers to main.asm - the fully macro-expanded
    // assembly DASM actually saw, NOT the bBasic source shown elsewhere in
    // the app (hooks/rom.js's showError annotates against that SOURCE
    // instead, so its line numbers never line up here - confirmed directly:
    // that mismatch was surfacing as a bare "undefined" where the source
    // line should have been, since the bBasic source is far shorter than
    // main.asm and the lookup just fell off the end of it). Annotated here,
    // against main.asm itself (which this function already has in hand),
    // so the real offending line - and a few lines of context around it,
    // since a single line rarely explains a bank/segment-tracking error by
    // itself - so it travels with the error instead of being silently lost.
    const asmLines = mainAsmContent.split('\n');
    // A generous window before the error (not just a few lines) - an
    // "Origin Reverse-indexed" failure is frequently reported several
    // "bank N"/ECHO-table entries after whatever content actually caused
    // it (DASM's  running PC tracking doesn't go wrong until it reaches
    // the NEXT origin-setting directive, not at the true overflow point
    // itself), so seeing only a handful of lines right at the reported one
    // routinely shows nothing but the compiler's  fixed boilerplate.
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
    const err = prepareException('Errors while assembling.', errors, annotated);
    err.partialOutput = partialOutput;
    err.partialSymbolmap = partialSymbolmap;
    // DASM's stdout (r.stdout) still holds every `echo` a bBasic kernel
    // emitted before the fatal error - including the per-bank "bytes of ROM
    // space left" self-report the bankswitch footer/DPC+ score-table code
    // prints via ECHO1 (see std_kernel.asm/score_graphics.asm) - a much more
    // direct "is bank 1 itself over capacity" signal than re-deriving it from
    // a partial symbol table. hooks/rom.js's isOverflowError retry loop reads
    // this to tell "bank 1's own fixed content doesn't fit" apart from "some
    // OTHER bank is too full", which look identical in the thrown error
    // message alone.
    err.dasmStdout = r.stdout;
    if (errors.some((item) => /origin reverse-indexed|segment overflow/i.test(item.msg))) err.measured = await measureBanks(mainAsmContent, workDir, includes, log);
    throw err;
  }
  if (!output || !symText) {
    // Matches the old npm wrapper's  fallback message, which
    // hooks/rom.js's isOverflowError() specifically looks for to trigger its
    // automatic event/graphics relocation retry. Only reached now when DASM
    // failed to produce output AND left no parseable error -
    // genuinely the "ran out of room, no specific line to blame" case.
    const err = prepareException('Errors while assembling.',
        [{line: 0, msg: 'No symbol table generated, maybe segment overflow?'}]);
    err.partialOutput = partialOutput;
    err.partialSymbolmap = partialSymbolmap;
    err.dasmStdout = r.stdout;
    err.measured = await measureBanks(mainAsmContent, workDir, includes, log);
    throw err;
  }
  const symbolmap = parseSymbolmap(symText);
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
 * @param {function(string)=} log Called with each underlying tool's  CLI
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
 * @param {function(string)=} log Called with the underlying tool's  CLI
 *   invocation, and this stage's elapsed time once it finishes.
 * @return {!Promise<{output: !Uint8Array, symbolmap: !Object<string, number>}>}
 */
export const assembleBatariBasic = (mainAsm, workDir, log) => assemble(mainAsm, workDir, log);
