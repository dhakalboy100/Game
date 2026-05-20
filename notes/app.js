import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm@0.2.83";

const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

const SYSTEM_PROMPT = `You are a progress note formatter for direct-care professionals working in residential and specialty services.

Your job: take (1) a list of GOALS the user provides and (2) a free-form NARRATIVE of a shift, and rewrite the narrative as a structured progress note organized under those goal headings.

Rules:
- Use the goal headings EXACTLY as the user provided them, in the same order, each followed by a colon on its own line.
- Under each heading, write a clear paragraph in third-person past tense, professional tone, complete sentences.
- Combine and reorder narrative fragments into flowing prose. Fix grammar. Do not invent details.
- Do NOT add events, observations, or interpretation that are not present in the narrative.
- Do NOT add identifying information the user did not provide. If the user used a name, you may use it. Otherwise refer to the person as "the individual" or by pronoun.
- If a goal has no relevant content, write under it: "No notable activity related to this goal during this shift."
- Output ONLY the formatted note. No preamble, no commentary, no markdown bullets, no asterisks.`;

const EXAMPLE_USER = `GOALS:
Residential Goal #1: Community access
Residential Goal #2: Choice-making
Specialty Services Goal #1: Transition support

NARRATIVE:
Today we went to the mall he wanted a burger so we went to the food court walked around the mall a couple times had a cheeseburger then he said he wanted to go to the park so we drove to a park walked around for a little bit. Leaving the mall he had a hard time kept saying it was too hot and windy I reminded him the car has AC and we can listen to music after some prompting he got in the car. When we got home he wanted to listen to one more song before going inside while parked I let him finish the song he kept requesting another so I let him listen since he seemed agitated about going in after two songs and verbal prompting he was able to go inside.`;

const EXAMPLE_ASSISTANT = `Residential Goal #1:
The individual chose to go to the Mall of New Hampshire because he wanted a burger. We walked around the mall a couple of times and then went to the food court, where he had a cheeseburger. Afterwards, he asked to go to a nearby park, so we drove there and walked around for a little bit.

Residential Goal #2:
The individual expressed what he wanted throughout the day. He chose to go to the mall, get a cheeseburger, go to the park, and later asked to go home and listen to music in the car.

Specialty Services Goal #1:
The individual had some difficulty transitioning from the mall to the car and kept saying it was too hot and windy outside. I reminded him that the car had AC and that we could listen to music. After prompting, he got into the car. When we got home, he wanted to listen to one more song before going inside. After listening to two songs and verbal prompting, he was able to transition into the house.`;

const el = (id) => document.getElementById(id);
const statusEl = el("status");
const statusTextEl = el("status-text");
const progressEl = el("progress-bar");
const formatBtn = el("format-btn");
const copyBtn = el("copy-btn");
const goalsEl = el("goals");
const narrativeEl = el("narrative");
const outputEl = el("output");

let engine = null;
let busy = false;

function setStatus(kind, text) {
  statusEl.className = `status status-${kind}`;
  statusTextEl.textContent = text;
}

function setProgress(fraction) {
  progressEl.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
}

async function init() {
  if (!navigator.gpu) {
    setStatus("error",
      "WebGPU not available on this browser. On iPhone, use Safari with iOS 18.2 or newer. On Android, use Chrome on a phone from ~2022 or newer.");
    setProgress(0);
    return;
  }

  setStatus("loading", "Downloading model (first time only — ~700 MB)…");

  try {
    engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (report) => {
        const pct = typeof report.progress === "number" ? report.progress : 0;
        setProgress(pct);
        const label = report.text || "Loading…";
        setStatus("loading", label);
      },
    });
    setStatus("ready", "Ready. Model is cached on your device.");
    setProgress(1);
    formatBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus("error", `Failed to load model: ${err.message || err}`);
  }
}

async function formatNote() {
  if (busy || !engine) return;
  const goals = goalsEl.value.trim();
  const narrative = narrativeEl.value.trim();
  if (!goals) {
    goalsEl.focus();
    return;
  }
  if (!narrative) {
    narrativeEl.focus();
    return;
  }

  busy = true;
  formatBtn.disabled = true;
  copyBtn.disabled = true;
  outputEl.value = "";
  setStatus("loading", "Formatting…");

  const userTurn = `GOALS:\n${goals}\n\nNARRATIVE:\n${narrative}`;

  try {
    const stream = await engine.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: EXAMPLE_USER },
        { role: "assistant", content: EXAMPLE_ASSISTANT },
        { role: "user", content: userTurn },
      ],
      temperature: 0.3,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (delta) {
        outputEl.value += delta;
        outputEl.scrollTop = outputEl.scrollHeight;
      }
    }

    setStatus("ready", "Done.");
    copyBtn.disabled = outputEl.value.length === 0;
  } catch (err) {
    console.error(err);
    setStatus("error", `Error: ${err.message || err}`);
  } finally {
    busy = false;
    formatBtn.disabled = false;
  }
}

async function copyOutput() {
  if (!outputEl.value) return;
  try {
    await navigator.clipboard.writeText(outputEl.value);
    const original = copyBtn.textContent;
    copyBtn.textContent = "Copied";
    setTimeout(() => (copyBtn.textContent = original), 1200);
  } catch {
    outputEl.select();
    document.execCommand("copy");
  }
}

function clearAll() {
  goalsEl.value = "";
  narrativeEl.value = "";
  outputEl.value = "";
  copyBtn.disabled = true;
  goalsEl.focus();
}

async function resetCache() {
  if (!confirm("Delete the cached model? You'll have to download it again next time.")) return;
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (window.indexedDB) {
      const dbs = await indexedDB.databases?.();
      if (dbs) {
        await Promise.all(
          dbs.map((db) => new Promise((res) => {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = req.onerror = req.onblocked = res;
          })),
        );
      }
    }
    location.reload();
  } catch (err) {
    alert(`Could not clear cache: ${err.message || err}`);
  }
}

formatBtn.addEventListener("click", formatNote);
copyBtn.addEventListener("click", copyOutput);
el("clear-btn").addEventListener("click", clearAll);
el("reset-cache-btn").addEventListener("click", resetCache);

init();
