/* =========================================================
   DEXO MIND — index.js (Groq API + rasm/fayl yuborish)
   =========================================================

   BU YERGA O'Z API KALITINGIZNI QO'YING:
   https://console.groq.com/keys dan oling (gsk_ bilan boshlanadi).

   MUHIM XAVFSIZLIK ESLATMASI:
   Kalit shu faylda OCHIQ turadi. Bu loyihani GitHub kabi OMMAVIY
   joyga yuklamang — aks holda kalitingizni har kim ko'rib, undan
   foydalanishi mumkin. Faqat shaxsiy/lokal foydalanish uchun mos.
   ========================================================= */

const GROQ_API_KEY = "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";

// Oddiy matn suhbat uchun — tez va tekin tarifda saxiy
const GROQ_TEXT_MODEL = "llama-3.1-8b-instant";

// Rasm yuborilganda shu modelga o'tamiz — chunki u rasmni "ko'ra oladi" (vision)
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Groq bo'yicha rasm hajmi cheklovi: bitta so'rovda 4MB dan oshmasligi kerak
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/* =========================================================
   RASM YARATISH (Pollinations.AI orqali) — kalit kerak emas,
   ro'yxatdan o'tish ham kerak emas, butunlay bepul.

   Xabarda "rasm" so'zi + chizish/yaratish ma'nosidagi fe'l birga
   kelsa (ikki nuqta bo'lsa ham, bo'lmasa ham), Groq'ga emas, shu
   manzilga so'rov yuboriladi. Masalan: "rasm chiz: ...", "rasm
   yasab ber", "qani rasm" (oxirgisida tavsif bo'lmasa, foydalanuvchidan
   so'raladi).
   ========================================================= */
const IMAGE_GEN_URL = "https://image.pollinations.ai/prompt/";

// Ikki nuqta bilan keladigan aniq qoliplar — tavsif shulardan keyin keladi
const IMAGE_COLON_TRIGGERS = ["rasm chiz:", "rasm yarat:", "rasm chizib ber:", "rasm yasab ber:"];

// Ikki nuqtasiz, erkin so'rovlarni aniqlash uchun: "rasm" so'zi + fe'l ildizi
const IMAGE_WORD = /\brasm(ni|ga|lar)?\b/i;
const IMAGE_VERB = /\b(chiz|yasa|yarat)/i;

// Qisqa, fe'lsiz so'rovlar — masalan "qani rasm", "rasm bormi" —
// bularda "rasm" so'zi bilan birga kelib, rasm so'rayotganini bildiradigan
// qo'shimcha so'zlar bo'ladi
const IMAGE_SHORT_REQUEST = /\b(qani|bormi|korsat|ko'rsat)\b.*\brasm\w*\b|\brasm\w*\b.*\b(qani|bormi|korsat|ko'rsat)\b/i;

const chatWindow = document.getElementById("chat-window");
const inputForm = document.getElementById("input-form");
const userInput = document.getElementById("user-input");
const statusLine = document.getElementById("status-line");
const sendBtn = document.getElementById("send-btn");

const imageInput = document.getElementById("image-input");
const fileInput = document.getElementById("file-input");
const imageBtn = document.getElementById("image-btn");
const fileBtn = document.getElementById("file-btn");
const attachmentPreview = document.getElementById("attachment-preview");

// Suhbat tarixi — OpenAI/Groq formatida: { role, content }
let conversationHistory = [];
let isReady = false;

// Hozir biriktirilgan fayl (faqat bittasi bir vaqtda — rasm YOKI matn fayl)
let pendingAttachment = null; // { type: "image"|"file", name, dataUrl?, text? }

/* ---------- Ishga tushirishda boshlang'ich sozlash ---------- */
function initChat() {
  conversationHistory.push({
    role: "system",
    content: "Sen DEXO MIND ismli foydali AI yordamchisan.",
  });

  isReady = true;
  statusLine.textContent = "tayyor — savolingizni yozing";
}

/* ---------- Xabarni chat oynasiga chiqarish ---------- */
function addMessage(text, role, extraNode) {
  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;
  if (text) bubble.appendChild(document.createTextNode(text));
  if (extraNode) bubble.appendChild(extraNode);
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

function addImageMessage(text, src, role) {
  const img = document.createElement("img");
  img.src = src;
  img.className = "msg-image";
  img.loading = "lazy";
  return addMessage(text, role || "user", img);
}

function addFileMessage(text, fileName) {
  const chip = document.createElement("div");
  chip.className = "msg-filechip";
  chip.textContent = `📄 ${fileName}`;
  return addMessage(text, "user", chip);
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

/* ---------- Xabar rasm yaratish so'rovi ekanligini tekshirish ----------
   1) Avval aniq qoliplarni tekshiramiz: "rasm chiz: ..." — tavsif
      ikki nuqtadan keyin keladi.
   2) Topilmasa, erkin holatni tekshiramiz: xabarda "rasm" so'zi VA
      chizish/yaratish ma'nosidagi fe'l birga uchrasa (masalan "rasm
      yasab ber", "qani rasm chiz", "dexo mind uchun rasm yasab ber"),
      shu holda butun xabar rasm so'rovi deb hisoblanadi. Tavsif sifatida:
      - agar xabarda boshqa mazmunli so'zlar bo'lsa (masalan "dexo mind
        uchun"), o'sha qism tavsif sifatida ishlatiladi;
      - aks holda (faqat "rasm chiz" kabi qisqa buyruq bo'lsa), tavsif
        bo'sh qaytariladi va foydalanuvchidan so'raladi.
   Natija: rasm so'rovi bo'lmasa null, bo'lsa tavsif matni (bo'sh ham
   bo'lishi mumkin).
*/
function extractImagePrompt(userText) {
  const lower = userText.toLowerCase().trim();

  // 1) Aniq "trigger:" qoliplari
  for (const trigger of IMAGE_COLON_TRIGGERS) {
    if (lower.startsWith(trigger)) {
      return userText.slice(trigger.length).trim();
    }
  }

  // 2) Erkin holat: "rasm" so'zi + chizish/yaratish fe'li ikkisi ham bo'lsa
  if (IMAGE_WORD.test(lower) && IMAGE_VERB.test(lower)) {
    // Buyruq so'zlarini xabardan olib tashlab, qolganini tavsif deb olamiz
    const cleaned = userText
      .replace(/\b(qani|menga|iltimos|ozim uchun|o'zim uchun)\b/gi, "")
      .replace(/\brasm(ni|ga|lar)?\b/gi, "")
      .replace(/\b(chizib ber|chiz|yasab ber|yasa|yarat(ib ber)?)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleaned;
  }

  // 3) Qisqa, fe'lsiz so'rov: "qani rasm", "rasm bormi" va h.k.
  if (IMAGE_SHORT_REQUEST.test(lower)) {
    return ""; // tavsif yo'q — foydalanuvchidan so'raladi
  }

  return null;
}

/* ---------- Pollinations.AI orqali rasm yaratish ----------
   Kalit kerak emas — shunchaki tavsifni URL'ga qo'shib, shu manzildan
   rasmni to'g'ridan-to'g'ri <img> sifatida ko'rsatamiz.
*/
function buildImageUrl(prompt) {
  const seed = Math.floor(Math.random() * 1000000); // har safar boshqa natija chiqishi uchun
  return `${IMAGE_GEN_URL}${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true`;
}

/* ---------- Fayl/rasmni base64 Data URL ko'rinishida o'qish ---------- */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/* ---------- Biriktirilgan fayl preview chipini chizish ---------- */
function renderAttachmentPreview() {
  attachmentPreview.innerHTML = "";

  if (!pendingAttachment) {
    attachmentPreview.classList.remove("active");
    return;
  }

  attachmentPreview.classList.add("active");

  const chip = document.createElement("div");
  chip.className = "attachment-chip";

  if (pendingAttachment.type === "image") {
    const img = document.createElement("img");
    img.src = pendingAttachment.dataUrl;
    chip.appendChild(img);
  }

  const name = document.createElement("span");
  name.className = "chip-name";
  name.textContent = pendingAttachment.name;
  chip.appendChild(name);

  const remove = document.createElement("span");
  remove.className = "chip-remove";
  remove.textContent = "✕";
  remove.addEventListener("click", () => {
    pendingAttachment = null;
    renderAttachmentPreview();
  });
  chip.appendChild(remove);

  attachmentPreview.appendChild(chip);
}

/* ---------- Rasm tanlanganda ---------- */
imageBtn.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  imageInput.value = ""; // keyingi safar xuddi shu faylni qayta tanlasa ham "change" otsin
  if (!file) return;

  if (file.size > MAX_IMAGE_BYTES) {
    addMessage("Bu rasm juda katta (4MB dan oshmasligi kerak).", "system");
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  pendingAttachment = { type: "image", name: file.name, dataUrl };
  renderAttachmentPreview();
});

/* ---------- Matn fayl tanlanganda ---------- */
fileBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;

  const text = await readFileAsText(file);
  pendingAttachment = { type: "file", name: file.name, text };
  renderAttachmentPreview();
});

/* ---------- Groq API'ga so'rov yuborish (matn yoki rasm bilan) ---------- */
async function askGroq(userText, attachment) {
  let model = GROQ_TEXT_MODEL;
  let userMessageForHistory;
  let userMessageForApi;

  if (attachment && attachment.type === "image") {
    model = GROQ_VISION_MODEL;
    const promptText = userText || "Bu rasmda nima borligini tasvirlab ber.";
    userMessageForApi = {
      role: "user",
      content: [
        { type: "text", text: promptText },
        { type: "image_url", image_url: { url: attachment.dataUrl } },
      ],
    };
    // Tarixga soddalashtirilgan shaklda saqlaymiz (rasmni qayta-qayta yubormaslik uchun)
    userMessageForHistory = { role: "user", content: `[rasm yuborildi: ${attachment.name}] ${promptText}` };
  } else if (attachment && attachment.type === "file") {
    const combinedText =
      (userText ? userText + "\n\n" : "") +
      `--- Biriktirilgan fayl: ${attachment.name} ---\n${attachment.text}`;
    userMessageForApi = { role: "user", content: combinedText };
    userMessageForHistory = userMessageForApi;
  } else {
    userMessageForApi = { role: "user", content: userText };
    userMessageForHistory = userMessageForApi;
  }

  // So'rovga: tarixning oldingi qismi (oddiy matn holida) + yangi xabar (rasm bo'lsa to'liq holida)
  const messagesToSend = [...conversationHistory, userMessageForApi];

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: messagesToSend,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API xato (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim() || "Kechirasiz, javob ololmadim.";

  // Tarixga soddalashtirilgan foydalanuvchi xabari + AI javobini qo'shamiz
  conversationHistory.push(userMessageForHistory);
  conversationHistory.push({ role: "assistant", content: reply });

  return reply;
}

/* ---------- Forma yuborilganda ---------- */
inputForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  const attachment = pendingAttachment;

  if (!text && !attachment) return;

  // ---- 1) Rasm YARATISH so'rovimi? (Pollinations.AI, kalit kerak emas) ----
  const imagePrompt = !attachment ? extractImagePrompt(text) : null;
  if (imagePrompt !== null) {
    if (!imagePrompt) {
      addMessage("Rasm tavsifini ham yozing, masalan: \"rasm chiz: qor bosgan tog'lar\"", "system");
      return;
    }

    addMessage(text, "user");
    userInput.value = "";

    const typingBubble = showTypingIndicator();
    const imageUrl = buildImageUrl(imagePrompt);

    // Rasm yuklanguncha kutamiz, shundan keyin "yozayapti" indikatorini almashtiramiz
    const preload = new Image();
    preload.onload = () => {
      typingBubble.remove();
      addImageMessage(`Mana: "${imagePrompt}"`, imageUrl, "ai");
    };
    preload.onerror = () => {
      typingBubble.remove();
      addMessage("Rasmni yarata olmadim, birozdan keyin qayta urinib ko'ring.", "system");
    };
    preload.src = imageUrl;

    return; // Groq'ga umuman murojaat qilinmaydi
  }

  // ---- 2) Oddiy matn/rasm-ko'rish/fayl so'rovi — Groq orqali ----
  if (GROQ_API_KEY === "BU_YERGA_OZ_KALITINGIZNI_QOYING") {
    addMessage(
      "API kalit hali kiritilmagan. index.js faylining yuqorisida GROQ_API_KEY ni o'zgartiring.",
      "system"
    );
    return;
  }

  // Xabarni ekranga chiqarish
  if (attachment && attachment.type === "image") {
    addImageMessage(text, attachment.dataUrl, "user");
  } else if (attachment && attachment.type === "file") {
    addFileMessage(text, attachment.name);
  } else {
    addMessage(text, "user");
  }

  userInput.value = "";
  pendingAttachment = null;
  renderAttachmentPreview();

  if (!isReady) {
    addMessage("Hali tayyorlanmoqda, biroz kuting...", "system");
    return;
  }

  const typingBubble = showTypingIndicator();

  try {
    const reply = await askGroq(text, attachment);
    typingBubble.remove();
    addMessage(reply, "ai");
  } catch (err) {
    typingBubble.remove();
    console.error(err);
    addMessage("Xatolik yuz berdi: " + err.message, "system");
  }
});

/* ---------- Ishga tushirish ---------- */
initChat();