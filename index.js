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
   IXTIYORIY: oqitish*.txt fayllaringizni AI'ning "shaxsiyati"
   yoki qo'shimcha bilimi sifatida ishlatish mumkin.
   ========================================================= */
const KNOWLEDGE_FILES = [
  "oqitish1.txt",
  "oqitish2.txt",
  "oqitish3.txt",
];

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
let systemKnowledge = "";
let isReady = false;

// Hozir biriktirilgan fayl (faqat bittasi bir vaqtda — rasm YOKI matn fayl)
let pendingAttachment = null; // { type: "image"|"file", name, dataUrl?, text? }

/* ---------- oqitish*.txt fayllarini yuklab, bitta matnga birlashtirish ---------- */
async function loadKnowledgeFiles() {
  let combined = "";
  let loadedCount = 0;

  for (const fileName of KNOWLEDGE_FILES) {
    try {
      const response = await fetch(fileName, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status);
      const text = await response.text();
      combined += text + "\n\n";
      loadedCount++;
    } catch (err) {
      console.warn(`"${fileName}" yuklanmadi:`, err);
    }
  }

  systemKnowledge = combined.trim();

  const systemPrompt = systemKnowledge
    ? "Sen DEXO MIND ismli AI yordamchisan. Quyidagi ma'lumotlar sening bilim bazang, kerak bo'lganda shulardan foydalan, lekin umumiy savollarga ham erkin javob ber:\n\n" + systemKnowledge
    : "Sen DEXO MIND ismli foydali AI yordamchisan.";

  conversationHistory.push({ role: "system", content: systemPrompt });

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

function addImageMessage(text, dataUrl) {
  const img = document.createElement("img");
  img.src = dataUrl;
  img.className = "msg-image";
  return addMessage(text, "user", img);
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

  if (GROQ_API_KEY === "BU_YERGA_OZ_KALITINGIZNI_QOYING") {
    addMessage(
      "API kalit hali kiritilmagan. index.js faylining yuqorisida GROQ_API_KEY ni o'zgartiring.",
      "system"
    );
    return;
  }

  // Xabarni ekranga chiqarish
  if (attachment && attachment.type === "image") {
    addImageMessage(text, attachment.dataUrl);
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
loadKnowledgeFiles();