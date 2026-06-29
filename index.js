/* =========================================================
   DEXO MIND — index.js
   =========================================================
   SIZ SHU YERGA O'QITISH FAYLLARINI QO'SHASIZ.
   Har bir faylni "oqitishN.html" deb nomlang va shu ro'yxatga
   qo'shing. Fayllar soni CHEKSIZ — xohlagancha qo'shing.
   ========================================================= */

const TRAINING_FILES = [
  "oqitish1.html",
  "oqitish2.html"
  // "oqitish2.html",
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
   - Qatorlar orasida bo'sh joy qoldirishingiz mumkin, muhim emas.
   - "user:salom" yoki "user: salom" — ikkisi ham ishlaydi.
   ========================================================= */

const chatWindow = document.getElementById("chat-window");
const inputForm = document.getElementById("input-form");
const userInput = document.getElementById("user-input");
const statusLine = document.getElementById("status-line");
const sendBtn = document.getElementById("send-btn");

// Bilim bazasi: { trigger -> javob }
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
        knowledgeBase[trigger] = answer;
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

  if (failedFiles.length > 0) {
    statusLine.textContent = `${loadedCount} fayl yuklandi, ${failedFiles.length} ta xato (konsolni tekshiring)`;
  } else {
    statusLine.textContent = `tayyor — ${triggerCount} ta bilim ulandi`;
  }
}

/* ---------- Xabarni chat oynasiga chiqarish ---------- */
function addMessage(text, role) {
  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;
  bubble.textContent = text;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* ---------- Javob topish mantiqi ---------- */
function findAnswer(userText) {
  const cleaned = normalize(userText);

  // 1) Aniq mos kelish
  if (knowledgeBase[cleaned]) {
    return knowledgeBase[cleaned];
  }

  // 2) Qisman mos kelish (trigger so'rovning ichida bo'lsa)
  for (const trigger in knowledgeBase) {
    if (cleaned.includes(trigger) || trigger.includes(cleaned)) {
      return knowledgeBase[trigger];
    }
  }

  return "Buni hali o'rganmaganman. Menga oqitish faylida shu savolga javob qo'shib ber 🙂";
}

/* ---------- Forma yuborilganda ---------- */
inputForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  userInput.value = "";

  if (!isReady) {
    addMessage("Hali bilimlar yuklanmoqda, biroz kuting...", "system");
    return;
  }

  const reply = findAnswer(text);
  setTimeout(() => addMessage(reply, "ai"), 150);
});

/* ---------- Ishga tushirish ---------- */
loadAllTrainingFiles();