import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

// --- Transformers.js Muhit Sozlamalari ---
// Modelni faqat tarmoqdan (CDN) yuklash
env.allowLocalModels = false;
// Brauzer keshini majburiy yoqish (sahifa yangilanganda qayta yuklanmasligi uchun)
env.useBrowserCache = true;

// --- DOM Elementlari ---
const chatContainer = document.getElementById('chat-container');
const messagesEl = document.getElementById('messages');
const welcomeScreen = document.getElementById('welcome-screen');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const thinkBtn = document.getElementById('think-btn');
const searchBtn = document.getElementById('search-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// --- Holat ---
let generator = null;
let isLoading = false;
let thinkMode = false;
let searchMode = false;
let isFirstMessage = true;

// --- Model Identifikatori ---
// LaMini-Flan-T5-77M modeli yengil va mobil qurilmalar uchun mos
const MODEL_ID = "Xenova/LaMini-Flan-T5-77M";

// --- Modelni Yuklash ---
async function initModel() {
    try {
        statusDot.className = 'status-dot loading';
        statusText.textContent = 'Model yuklanmoqda... (0%)';

        generator = await pipeline('text2text-generation', MODEL_ID, {
            progress_callback: (data) => {
                if (data.status === 'progress') {
                    const percent = Math.round((data.loaded / data.total) * 100);
                    statusText.textContent = `Yuklanmoqda: ${percent}%`;
                } else if (data.status === 'ready') {
                    statusText.textContent = 'Model tayyor';
                }
            }
        });

        statusDot.className = 'status-dot ready';
        statusText.textContent = 'Model tayyor (Keshdan yoki tarmoqdan)';
        sendBtn.disabled = false;
    } catch (error) {
        console.error("Model yuklashda xato:", error);
        statusDot.className = 'status-dot';
        statusText.textContent = 'Model yuklanmadi';
        alert("Model yuklanmadi. Internet aloqasini tekshiring yoki brauzer keshini tozalang.");
    }
}

// --- Internetdan Qidirish (CORS proksi orqali) ---
async function searchWeb(query) {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`)}`;
    try {
        const response = await fetch(proxyUrl);
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const results = doc.querySelectorAll('.result__body');

        let extracted = [];
        results.forEach((result, index) => {
            if (index >= 3) return; // Mobil uchun 3 ta natija yetarli
            const title = result.querySelector('.result__title')?.innerText || '';
            const snippet = result.querySelector('.result__snippet')?.innerText || '';
            if (title || snippet) {
                extracted.push(`${title}: ${snippet}`);
            }
        });

        return extracted.length > 0 ? extracted.join('\n\n') : null;
    } catch (error) {
        console.error("Qidiruv xatosi:", error);
        return null;
    }
}

// --- Xabar Qo'shish ---
function addMessage(role, content, meta = {}) {
    if (isFirstMessage) {
        welcomeScreen.style.display = 'none';
        isFirstMessage = false;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';
    if (meta.think) metaDiv.innerHTML += '<span class="badge think">🧠 Think</span>';
    if (meta.search) metaDiv.innerHTML += '<span class="badge search">🔍 Search</span>';

    messageDiv.appendChild(avatar);
    const wrapper = document.createElement('div');
    wrapper.style.flex = '1';
    wrapper.appendChild(contentDiv);
    if (meta.think || meta.search) wrapper.appendChild(metaDiv);
    messageDiv.appendChild(wrapper);

    messagesEl.appendChild(messageDiv);
    scrollToBottom();
    return contentDiv;
}

// --- Pastga Aylantirish ---
function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// --- Yozayotgan Ko'rsatkichi ---
function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.id = 'typing-indicator';
    div.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    messagesEl.appendChild(div);
    scrollToBottom();
}

function removeTypingIndicator() {
    document.getElementById('typing-indicator')?.remove();
}

// --- Asosiy Yuborish Funksiyasi ---
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isLoading || !generator) return;

    isLoading = true;
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;

    addMessage('user', text);
    showTypingIndicator();

    let contextText = '';
    let usedSearch = false;

    // Agar Search rejimi yoqilgan bo'lsa
    if (searchMode) {
        try {
            const searchResults = await searchWeb(text);
            if (searchResults) {
                contextText = `Quyidagi ma'lumotlardan foydalanib savolga javob ber:\n${searchResults}\n\nSavol: ${text}\nJavob:`;
                usedSearch = true;
            } else {
                contextText = `Savol: ${text}\nJavob:`;
            }
        } catch (e) {
            console.error("Qidiruvda xato:", e);
            contextText = `Savol: ${text}\nJavob:`;
        }
    } else {
        contextText = `Savol: ${text}\nJavob:`;
    }

    // Think rejimi uchun prompt
    let finalPrompt = contextText;
    if (thinkMode) {
        finalPrompt = `Sen chuqur fikrlaydigan AI yordamchisisan. Savolga javob berishdan oldin bosqichma-bosqich o'ylab ko'r. O'ylash jarayonini yoz, so'ngra yakuniy javobni ber.\n\n${contextText}`;
    }

    try {
        // Transformers.js orqali generatsiya qilish
        const output = await generator(finalPrompt, {
            max_new_tokens: 256, // Mobil qurilmalar uchun token cheklovi
            temperature: 0.7,
            do_sample: true
        });

        removeTypingIndicator();
        
        // T5 modeli ba'zan promptni ham qaytaradi, uni tozalaymiz
        let responseText = output[0].generated_text;
        if (responseText.startsWith(finalPrompt)) {
            responseText = responseText.replace(finalPrompt, '').trim();
        }
        
        addMessage('assistant', responseText || "Kechirasiz, javob generatsiya qila olmadim.", { think: thinkMode, search: usedSearch });
    } catch (error) {
        removeTypingIndicator();
        addMessage('assistant', `Xatolik yuz berdi: ${error.message}`);
    } finally {
        isLoading = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
}

// --- Hodisalar ---
sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
});

thinkBtn.addEventListener('click', () => {
    thinkMode = !thinkMode;
    thinkBtn.classList.toggle('active', thinkMode);
});

searchBtn.addEventListener('click', () => {
    searchMode = !searchMode;
    searchBtn.classList.toggle('active', searchMode);
});

document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        userInput.value = chip.dataset.prompt;
        userInput.focus();
    });
});

// --- Boshlash ---
sendBtn.disabled = true;
initModel();