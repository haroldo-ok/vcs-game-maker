// TEMP PROTOTYPE - not wired into the app, only exercised via window hooks
// from the browser console while validating the bB 1.9 WASI pipeline.
'use strict';

import {WASI, File, Directory, OpenFile, PreopenDirectory} from '@bjorn3/browser_wasi_shim';

const wasmCache = {};
const fetchWasm = async (path) => {
  if (wasmCache[path]) return wasmCache[path];
  const buf = await fetch(path).then((r) => r.arrayBuffer());
  const mod = await WebAssembly.compile(buf);
  wasmCache[path] = mod;
  return mod;
};

// Runs a WASI "command" module to completion, feeding it stdin bytes and a
// map of preopened directories (name -> {relativePath: contentString}).
// Returns {exitCode, stdout, stderr, dirs} where dirs mirrors the final
// contents of every preopened directory as {relativePath: contentString}.
const runWasi = async (wasmPath, args, stdinText, preopens, options) => {
  // The shim passes `args` straight through as argv with no synthesized
  // argv[0] - since these are clang/wasi-sdk C binaries expecting a real
  // program name in argv[0] (argument parsing starts at argv[1]), omitting
  // it silently shifts every flag out of place (e.g. "-i" lands in the
  // program-name slot and is never seen as a flag at all).
  const argv = ['program', ...(args || [])];
  const mod = await fetchWasm(wasmPath);
  let stdout = '';
  let stderr = '';
  const stdoutBytes = [];
  const stderrBytes = [];

  const dirObjs = {};
  const fds = [
    new OpenFile(new File(new TextEncoder().encode(stdinText || ''))),
    {
      // stdout: capture raw bytes (not line-buffered) so partial/binary-ish
      // output isn't silently dropped.
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

  // Builds a nested Directory tree from a flat {"a/b/c.asm": content} map -
  // paths containing "/" need real intermediate Directory inodes, not just a
  // single flat Map, for path_open to walk them the way 2600basic.wasm/
  // dasm.wasm expect (e.g. "-i /bbinc" then internally opening
  // "includes/default.inc" under it).
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

  Object.entries(preopens || {}).forEach(([name, files]) => {
    const contents = buildTree(files);
    const dir = new Directory(contents);
    dirObjs[name] = dir;
    fds.push(new PreopenDirectory(name, contents));
  });

  const wasi = new WASI(argv, [], fds);
  const pathOpenLog = [];
  let wasiImport = wasi.wasiImport;
  if (options && options.trace) {
    const origPathOpen = wasi.wasiImport.path_open.bind(wasi.wasiImport);
    wasiImport = {
      ...wasi.wasiImport,
      path_open: (fdArg, dirflags, pathPtr, pathLen, ...rest) => {
        const mem = new Uint8Array(wasi.inst.exports.memory.buffer, pathPtr, pathLen);
        const pathStr = new TextDecoder().decode(mem);
        const ret = origPathOpen(fdArg, dirflags, pathPtr, pathLen, ...rest);
        pathOpenLog.push({fd: fdArg, path: pathStr, ret});
        return ret;
      },
    };
  }
  const inst = await WebAssembly.instantiate(mod, {wasi_snapshot_preview1: wasiImport});
  wasi.inst = inst;
  let exitCode = 0;
  try {
    exitCode = wasi.start(inst);
  } catch (e) {
    exitCode = (e && e.code !== undefined) ? e.code : -1;
  }
  stdout = new TextDecoder().decode(new Uint8Array(stdoutBytes));
  stderr = new TextDecoder().decode(new Uint8Array(stderrBytes));

  const flattenDir = (dir, prefix, out) => {
    dir.contents.forEach((inode, name) => {
      const path = prefix ? prefix + '/' + name : name;
      if (inode.data) out[path] = new TextDecoder().decode(inode.data);
      else if (inode.contents) flattenDir(inode, path, out);
    });
    return out;
  };
  const dirs = {};
  Object.entries(dirObjs).forEach(([name, dir]) => {
    dirs[name] = flattenDir(dir, '', {});
  });

  const rawFiles = {};
  Object.entries(dirObjs).forEach(([name, dir]) => {
    const collectRaw = (d, prefix) => {
      d.contents.forEach((inode, entryName) => {
        const path = prefix ? prefix + '/' + entryName : entryName;
        if (inode.data) rawFiles[name + '/' + path] = inode.data;
        else if (inode.contents) collectRaw(inode, path);
      });
    };
    collectRaw(dir, '');
  });

  return {exitCode, stdout, stderr, dirs, pathOpenLog, rawFiles};
};

window.__vcsWasi19Preprocess = async (code) => {
  const r = await runWasi('/bb19/preprocess.wasm', [], code, {});
  return r;
};

let includesManifestPromise = null;
const getIncludesManifest = () => {
  if (!includesManifestPromise) {
    includesManifestPromise = fetch('/bb19/includes-manifest.json').then((r) => r.json());
  }
  return includesManifestPromise;
};

window.__vcsWasi19Compile = async (preprocessedCode, siblingFiles, trace) => {
  const includes = await getIncludesManifest();
  // Mirrors the real bB 1.9 distribution's own layout exactly: a "bB" folder
  // containing 2600basic.wasm and an "includes/" subfolder (with
  // default.inc etc. inside it) - the real 2600basic.sh invokes
  // "-i $bB" where $bB is that same outer folder, preopened alongside the
  // "." working directory that holds main.bas and its sibling asm files.
  const r = await runWasi('/bb19/2600basic.wasm', ['-i', '/bbinc'], preprocessedCode, {
    '.': {...(siblingFiles || {})},
    '/bbinc': includes,
  }, {trace});
  return r;
};

window.__vcsWasi19Postprocess = async (bBAsmContent, siblingFiles, trace) => {
  const includes = await getIncludesManifest();
  // 2600basic.sh writes 2600basic.wasm's stdout to a "bB.asm" *file* rather
  // than piping it - postprocess.wasm then opens "bB.asm" by name from ".",
  // the same way it opens "default.inc", rather than reading it from stdin.
  const r = await runWasi('/bb19/postprocess.wasm', ['-i', '/bbinc'], '', {
    '.': {...(siblingFiles || {}), 'bB.asm': bBAsmContent},
    '/bbinc': includes,
  }, {trace});
  return r;
};

window.__vcsWasi19Dasm = async (mainAsmContent, siblingFiles, trace) => {
  const includes = await getIncludesManifest();
  // dasm.wasm takes the asm file by name (not stdin), with "-I." for
  // sibling includes (text12a.asm/text12b.asm) and "-I/bbinc/includes" for
  // the standard library files main.asm's own "include" directives need.
  const r = await runWasi(
      '/bb19/dasm.wasm',
      ['main.asm', '-I.', '-I/bbinc/includes', '-f3', '-p20', '-lmain.lst', '-smain.sym', '-omain.bin'],
      '',
      {
        '.': {...(siblingFiles || {}), 'main.asm': mainAsmContent},
        '/bbinc': includes,
      },
      {trace},
  );
  return r;
};

window.__vcsWasi19Test = 'loaded';
