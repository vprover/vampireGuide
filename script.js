import { runVampire, parseArgs, shellQuote } from './vampire-runner.js';

const outEl  = document.getElementById('out');
const tptpEl = document.getElementById('tptp');
const argsEl = document.getElementById('args');
const runBtn = document.getElementById('run');

const log = (s='') => { outEl.textContent += s + "\n"; };
const clear = () => { outEl.textContent = ""; };

async function runOnce() {
  clear();
  const input = tptpEl.value.trim();
  if (!input) { log("No input."); return; }

  runBtn.disabled = true;
  try {
    let argv = parseArgs(argsEl.value || '');
    argv.push("/work/input.p");
    const cli = "vampire " + shellQuote(argv);
    log("→ " + cli);
    console.log(cli);

    const { stdout, stderr } = await runVampire(input, argsEl.value);
    log(stdout);
    if (stderr) log(stderr);
  } catch (err) {
    console.error(err);
    log("FATAL: " + (err && err.message || err));
  } finally {
    runBtn.disabled = false;
  }
}
runBtn.onclick = () => runOnce();
log("Ready.");

window.runVampire = runVampire;