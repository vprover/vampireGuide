import { runVampire, parseArgs, shellQuote } from './vampire-runner.js';

const outEl  = document.getElementById('out');
const tptpEl = document.getElementById('tptp');
const argsEl = document.getElementById('args');
const runBtn = document.getElementById('run');
const defaultArgs = "--manual_cs on --show_new on";
argsEl.value = defaultArgs;

const transcript = [];
const inputQueue = [];
let pendingInput = null;
let runActive = false;
let currentInput = "";
const promptPrefix = "> ";

function renderTerminal() {
  const lines = [...transcript];
  if (runActive) {
    lines.push(promptPrefix + currentInput);
  }
  outEl.textContent = lines.join("\n");
  outEl.scrollTop = outEl.scrollHeight;
}

const log = (s='') => {
  transcript.push(String(s));
  renderTerminal();
};

const clearOutput = () => {
  transcript.length = 0;
  currentInput = "";
  renderTerminal();
};

function resetInputQueue() {
  inputQueue.length = 0;
  pendingInput = null;
  currentInput = "";
}

function deliverInput(value) {
  if (pendingInput) {
    pendingInput(value);
    pendingInput = null;
  } else {
    inputQueue.push(value);
  }
}

function submitCurrentInput() {
  if (!runActive) { return; }
  const value = currentInput;
  transcript.push(promptPrefix + value);
  currentInput = "";
  renderTerminal();
  deliverInput(value);
}

function focusTerminal() {
  if (outEl) { outEl.focus({ preventScroll: true }); }
}

function handleTyping(char) {
  if (!runActive) { return; }
  currentInput += char;
  renderTerminal();
}

outEl.addEventListener('keydown', (e) => {
  if (!runActive) { return; }
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    submitCurrentInput();
    return;
  }
  if (e.key === 'Backspace') {
    e.preventDefault();
    currentInput = currentInput.slice(0, -1);
    renderTerminal();
    return;
  }
  if (e.key.length === 1) {
    e.preventDefault();
    handleTyping(e.key);
  }
});

outEl.addEventListener('paste', (e) => {
  if (!runActive) { return; }
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text) { return; }
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines.length === 1) {
    handleTyping(lines[0]);
    return;
  }
  // Submit all but the last line immediately, keep the last line in the prompt
  handleTyping(lines[0]);
  submitCurrentInput();
  for (let i = 1; i < lines.length - 1; i++) {
    currentInput = lines[i];
    submitCurrentInput();
  }
  currentInput = lines[lines.length - 1];
  renderTerminal();
});

function requestInput(promptText) {
  if (promptText) log(promptText);
  focusTerminal();
  renderTerminal();
  return new Promise(resolve => {
    if (inputQueue.length) {
      const next = inputQueue.shift();
      resolve(next);
    } else {
      pendingInput = (val) => {
        resolve(val);
      };
    }
  });
}

async function runOnce() {
  clearOutput();
  resetInputQueue();
  renderTerminal();
  const input = tptpEl.value.trim();
  if (!input) { log("No input."); return; }

  runBtn.disabled = true;
  runActive = true;
  focusTerminal();
  renderTerminal();
  try {
    let argv = parseArgs(argsEl.value || '');
    argv.push("/work/input.p");
    const cli = "vampire " + shellQuote(argv);
    log("→ " + cli);
    console.log(cli);

    const { code } = await runVampire(input, argsEl.value, {
      onStdout: log,
      onStderr: log,
      requestInput,
    });
    log(`(exit code ${code})`);
    // Best-effort copy of full transcript to clipboard
    const finalText = transcript.join("\n");
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(finalText).then(() => {
        console.log("Copied run output to clipboard");
      }).catch((err) => {
        console.warn("Clipboard copy failed", err);
      });
    }
  } catch (err) {
    console.error("runOnce error", err);
    const detail = err && err.stack ? `${err.message}\n${err.stack}` : (err && err.message) || err;
    log("FATAL: " + detail);
  } finally {
    runActive = false;
    resetInputQueue();
    runBtn.disabled = false;
    renderTerminal();
  }
}
runBtn.onclick = () => runOnce();
log("Ready.");
renderTerminal();

window.runVampire = runVampire;

// Surface uncaught errors/rejections for debugging
window.addEventListener('error', (ev) => {
  const msg = ev?.error?.stack || ev?.message || String(ev);
  console.error("window.error", ev);
  log(`FATAL(window.error): ${msg}`);
});
window.addEventListener('unhandledrejection', (ev) => {
  const reason = ev?.reason;
  const msg = reason?.stack || reason?.message || String(reason);
  console.error("unhandledrejection", ev);
  log(`FATAL(unhandledrejection): ${msg}`);
});
