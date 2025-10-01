export async function runVampire(problemText, args) {
  const createVampire = (await import("./vampire.js")).default;
  let stdout = [];
  let stderr = [];
  let resolvePromise;
  const promise = new Promise(resolve => {
    resolvePromise = resolve;
  });

  const Module = {
    noInitialRun: true,
    stdin() { return null; }, // never prompt for stdin
    print:  s => stdout.push(String(s)),
    printErr: s => stderr.push(String(s)),
    onRuntimeInitialized() {},
    onExit: (code) => {
      resolvePromise({ stdout: stdout.join("\n"), stderr: stderr.join("\n"), code });
    }
  };

  try {
    const mod = await createVampire(Module);
    window.mod = mod;    
    mod.FS.mkdir('/work'); // idempotent
    mod.FS.writeFile('/work/input.p', new TextEncoder().encode(problemText));

    let argv = parseArgs(args || '');
    argv.push("/work/input.p");
    
    mod.callMain(argv);
  } catch (err) {
    return { stdout: '', stderr: "FATAL: " + (err && err.message || err), code: -1 };
  }

  return promise;
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
