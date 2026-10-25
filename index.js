import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

// --- Transformers.js Sozlamalari ---
env.allowLocalModels = false;
env.useBrowserCache = true; // Keshni yoqish (qayta yuklanmasligi uchun)

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
let chatHistory = []; // Suhbat tarixini saqlash uchun

// --- Yangi Model ---
// Qwen1.5-0.5B-Chat - haqiqiy suhbat uchun o'qitilgan model
const MODEL_ID = "Xenova/Qwen1.5-0.5B-Chat";

// --- Modelni Yuklash ---
async function initModel() {
    try {
        statusDot.className = 'status-dot loading';
        statusText.textContent = 'Model yuklanmoqda... (0%)';

        // text-generation pipeline ishlatamiz
        generator = await pipeline('text-generation', MODEL_ID, {
            progress_callback: (data) => {
                if (data.status === 'progress') {
                    const percent = Math.round((data.loaded / data.total) * 100);
                    statusText.textContent = `Yuklanmoqda: ${percent}%`;
                }
            }
        });

        statusDot.className = 'status-dot ready';
        statusText.textContent = 'Model tayyor';
        sendBtn.disabled = false;
    } catch (error) {
        console.error("Model yuklashda xato:", error);
        statusDot.className = 'status-dot';
        statusText.textContent = 'Model yuklanmadi';
        alert("Model yuklanmadi. Internet aloqasini tekshiring yoki xotirani bo'shating.");
    }
}

// --- Internetdan Qidirish (Wikipedia API) ---
async function searchWeb(query) {
    try {
        // Wikipedia API orqali qidirish (CORS muammosi yo'q)
        const wikiUrl = `https://uz.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
        const response = await fetch(wikiUrl);
        const data = await response.json();
        
        if (data.query && data.query.search.length > 0) {
            // Eng yaxshi 3 ta natijani olamiz va HTML teglaridan tozalaymiz
            const results = data.query.search.slice(0, 3).map(item => 
                `${item.title}: ${item.snippet.replace(/<[^>]*>/g, '')}`
            );
            return results.join('\n\n');
        }
        return null;
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

    let usedSearch = false;
    let contextInfo = "";

    // 1. Qidiruv (agar yoqilgan bo'lsa)
    if (searchMode) {
        const searchResults = await searchWeb(text);
        if (searchResults) {
            contextInfo = `Quyidagi ma'lumotlardan foydalanib javob ber:\n${searchResults}\n\n`;
            usedSearch = true;
        }
    }

    // 2. Suhbat tarixini shakllantirish
    // Qwen modeli o'zining maxsus formatida gaplashishni yaxshi ko'radi
    let prompt = "";
    
    if (thinkMode) {
        prompt += "Sen chuqur fikrlaydigan yordamchisan. Avval o'ylab ko'r, keyin javob ber.\n";
    }
    
    prompt += contextInfo;
    prompt += `Savol: ${text}\nJavob:`;

    try {
        // 3. Modeldan javob olish
        const output = await generator(prompt, {
            max_new_tokens: 300,
            temperature: 0.7,
            do_sample: true,
            repetition_penalty: 1.2 // Bir xil gapni takrorlashni oldini oladi
        });

        removeTypingIndicator();
        
        // Model qaytargan matnni tozalash (promptning o'zini olib tashlash)
        let responseText = output[0].generated_text;
        if (responseText.includes("Javob:")) {
            responseText = responseText.split("Javob:")[1].trim();
        } else {
            responseText = responseText.replace(prompt, '').trim();
        }
        
        // Agar model bo'sh joy qaytarsa
        if (!responseText) responseText = "Kechirasiz, tushunmadim. Boshqacha so'rab ko'ring.";

        addMessage('assistant', responseText, { think: thinkMode, search: usedSearch });
        
    } catch (error) {
        removeTypingIndicator();
        addMessage('assistant', `Xatolik: ${error.message}`);
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