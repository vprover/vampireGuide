export async function runVampire(problemText, args, io = {}) {
  const createVampire = (await import("./vampire.js")).default;
  const { onStdout, onStderr, requestInput } = io;

  const stdout = [];
  const stderr = [];
  let resolveDone;
  let finished = false;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const finish = (code) => {
    if (finished) return;
    finished = true;
    resolveDone({ stdout: stdout.join("\n"), stderr: stderr.join("\n"), code });
  };

  const Module = {
    noInitialRun: true,
    print: (s) => {
      const msg = String(s);
      stdout.push(msg);
      onStdout?.(msg);
    },
    printErr: (s) => {
      const msg = String(s);
      stderr.push(msg);
      onStderr?.(msg);
    },
    vampireReadline: requestInput
      ? (prompt) => Promise.resolve(requestInput(String(prompt ?? "")))
      : undefined,
    onExit: (code) => finish(code),
    onAbort: (what) => {
      const msg = String(what ?? "abort");
      stderr.push(msg);
      onStderr?.(msg);
      finish(-1);
    }
  };

  try {
    const mod = await createVampire(Module);

    try { mod.FS.mkdir('/work'); } catch {}
    mod.FS.writeFile('/work/input.p', new TextEncoder().encode(String(problemText ?? "")));

    const argv = parseArgs(String(args ?? ""));
    if (!argv.some(arg => arg.endsWith('.p') || arg.startsWith('/'))) {
      argv.push("/work/input.p");
    }

    const runner = mod.Asyncify?.handleAsync
      ? mod.Asyncify.handleAsync(() => mod.callMain(argv))
      : mod.callMain(argv);

    const ret = await runner;
    finish(typeof ret === 'number' ? ret : 0);
  } catch (err) {
    if (err && err.name === 'ExitStatus' && typeof err.status === 'number') {
      finish(err.status);
    } else {
      const msg = err?.message || String(err);
      stderr.push("FATAL: " + msg);
      onStderr?.("FATAL: " + msg);
      finish(-1);
    }
  }

  return done;
}

export function parseArgs(str) {
  const argv = [];
  let i=0, cur='', q=null;
  while (i < str.length) {
    const ch = str[i++];
    if (q) {
      if (ch === q) q = null;
      else if (ch === '\\' && i < str.length) cur += str[i++];
      else cur += ch;
    } else {
      if (ch === '"' || ch === "'") q = ch;
      else if (/\s/.test(ch)) { if (cur) { argv.push(cur); cur=''; } }
      else cur += ch;
    }
  }
  if (cur) argv.push(cur);

  return argv;
}


export function shellQuote(argv) {
  return argv.map(a =>
    /^[A-Za-z0-9@%_+=:,./-]+$/.test(a) ? a : "'" + a.replace(/'/g,"'\\''") + "'"
  ).join(' ');
}
