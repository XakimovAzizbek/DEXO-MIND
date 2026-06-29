/* =========================================================
   DEXO MIND — index.js
   =========================================================
   SIZ SHU YERGA O'QITISH FAYLLARINI QO'SHASIZ.
   Har bir faylni "oqitishN.html" deb nomlang va shu ro'yxatga
   qo'shing. Fayllar soni CHEKSIZ — xohlagancha qo'shing.
   ========================================================= */

const TRAINING_FILES = [
  "oqitish1.html",
  "oqitish2.html",
  "oqitish3.html",
  // "oqitish3.html",
  // ... shu tarzda davom ettiring
];

/* =========================================================
   oqitishN.html FAYLLARNI QANDAY YOZISH KERAK:

   user: salom
   user: assalomu alaykum
   ai: Assalomu alaykum! Nima xizmat?

   user: isming nima
   ai: Mening ismim DEXO MIND.

   - Bitta "ai:" javobidan oldin bir nechta "user:" qatori
     bo'lishi mumkin — ularning barchasi shu bitta javobga ulanadi.
   - Bir xil "user:" trigger (masalan "salom") bir nechta faylda
     qaytarilsa, BARCHA javoblar saqlanadi va AI har safar ulardan
     TASODIFIY birini tanlab javob beradi — shu sabab javoblar
     bir-birini o'chirib yubormaydi.
   - Qatorlar orasida bo'sh joy qoldirishingiz mumkin, muhim emas.
   - "user:salom" yoki "user: salom" — ikkisi ham ishlaydi.
   ========================================================= */

const chatWindow = document.getElementById("chat-window");
const inputForm = document.getElementById("input-form");
const userInput = document.getElementById("user-input");
const statusLine = document.getElementById("status-line");
const sendBtn = document.getElementById("send-btn");

// Bilim bazasi: { trigger -> [javob1, javob2, ...] }
// MUHIM: har bir trigger uchun RO'YXAT saqlanadi, bitta string emas.
// Shunday qilib bir nechta faylda bir xil savol (masalan "salom")
// takrorlansa, eski javob YANGISI bilan ALMASHTIRILMAYDI —
// ikkisi ham saqlanib qoladi va navbat bilan ishlatiladi.
let knowledgeBase = {};
let isReady = false;

/* ---------- Yordamchi: matnni tozalash (solishtirish uchun) ---------- */
function normalize(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"()«»]/g, "")
    .replace(/\s+/g, " ");
}

/* ---------- Trigger uchun javob qo'shish (overwrite emas, push) ---------- */
function addAnswer(trigger, answer) {
  if (!knowledgeBase[trigger]) {
    knowledgeBase[trigger] = [];
  }
  if (!knowledgeBase[trigger].includes(answer)) {
    knowledgeBase[trigger].push(answer);
  }
}

/* ---------- Bitta oqitish faylini parse qilish ----------
   Format:
     user: ...
     user: ...
     ai: ...
   Bir nechta ketma-ket "user:" qatorlari bitta keyingi "ai:" ga ulanadi.
*/
function parseTrainingText(rawText) {
  const lines = rawText.split(/\r?\n/);
  let pendingTriggers = [];

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const userMatch = line.match(/^user\s*:\s*(.+)$/i);
    const aiMatch = line.match(/^ai\s*:\s*(.+)$/i);

    if (userMatch) {
      pendingTriggers.push(normalize(userMatch[1]));
    } else if (aiMatch && pendingTriggers.length > 0) {
      const answer = aiMatch[1].trim();
      for (const trigger of pendingTriggers) {
        addAnswer(trigger, answer);
      }
      pendingTriggers = [];
    }
    // user: dan oldin kelgan ai: yoki tushunarsiz qator e'tiborga olinmaydi
  }
}

/* ---------- .html o'qitish faylidan toza matnni olish ----------
   Fayl ichida HTML teglar bo'lsa ham, faqat matnni ajratib olamiz.
*/
function extractTextFromHtml(htmlString) {
  const doc = new DOMParser().parseFromString(htmlString, "text/html");
  return doc.body ? doc.body.textContent : htmlString;
}

/* ---------- Barcha oqitish fayllarini yuklash ---------- */
async function loadAllTrainingFiles() {
  let loadedCount = 0;
  let failedFiles = [];

  for (const fileName of TRAINING_FILES) {
    try {
      const response = await fetch(fileName, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status);
      const html = await response.text();
      const text = extractTextFromHtml(html);
      parseTrainingText(text);
      loadedCount++;
    } catch (err) {
      failedFiles.push(fileName);
      console.warn(`"${fileName}" yuklanmadi:`, err);
    }
  }

  isReady = true;
  const triggerCount = Object.keys(knowledgeBase).length;
  const answerCount = Object.values(knowledgeBase).reduce((sum, arr) => sum + arr.length, 0);

  if (failedFiles.length > 0) {
    statusLine.textContent = `${loadedCount} fayl yuklandi, ${failedFiles.length} ta xato (konsolni tekshiring)`;
  } else {
    statusLine.textContent = `tayyor — ${triggerCount} savol, ${answerCount} javob ulandi`;
  }
}

/* ---------- Xabarni chat oynasiga chiqarish ---------- */
function addMessage(text, role) {
  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;
  bubble.textContent = text;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

/* ---------- "AI yozayapti..." indikatorini ko'rsatish ---------- */
function showTypingIndicator() {
  const wrap = document.createElement("div");
  wrap.className = "msg ai typing";
  wrap.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return wrap;
}

/* ---------- Javob topish mantiqi ----------
   Trigger uchun bir nechta javob bo'lsa, ulardan TASODIFIY biri tanlanadi.
*/
function findAnswer(userText) {
  const cleaned = normalize(userText);

  // 1) Aniq mos kelish
  if (knowledgeBase[cleaned] && knowledgeBase[cleaned].length > 0) {
    return pickRandom(knowledgeBase[cleaned]);
  }

  // 2) Qisman mos kelish (trigger so'rovning ichida bo'lsa)
  //    Eng uzun (eng aniq) trigger'ni tanlaymiz, tasodifiy emas.
  let bestTrigger = null;
  for (const trigger in knowledgeBase) {
    if (cleaned.includes(trigger) || trigger.includes(cleaned)) {
      if (!bestTrigger || trigger.length > bestTrigger.length) {
        bestTrigger = trigger;
      }
    }
  }
  if (bestTrigger) {
    return pickRandom(knowledgeBase[bestTrigger]);
  }

  return "Buni hali o'rganmaganman. Menga boshqa savol berib koring";
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ---------- Forma yuborilganda ---------- */
inputForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  userInput.value = "";
  sendBtn.classList.add("pulse");
  setTimeout(() => sendBtn.classList.remove("pulse"), 250);

  if (!isReady) {
    addMessage("Hali bilimlar yuklanmoqda, biroz kuting...", "system");
    return;
  }

  const typingBubble = showTypingIndicator();
  const reply = findAnswer(text);

  const delay = 400 + Math.random() * 400;
  setTimeout(() => {
    typingBubble.remove();
    addMessage(reply, "ai");
  }, delay);
});

/* ---------- Ishga tushirish ---------- */
loadAllTrainingFiles();