let chain = null;

// ==========================================
// MODELNI YUKLASH
// ==========================================
async function loadModel() {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    
    try {
        const response = await fetch('model.json');
        if (!response.ok) throw new Error("Model topilmadi");
        
        const data = await response.json();
        chain = data.chain;
        
        statusDot.className = 'status-dot ready';
        statusText.textContent = 'Tayyor';
        
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('chat-section').style.display = 'flex';
        document.getElementById('send-btn').disabled = false;
        
        addMessage('assistant', "Salom! Men sizning AI'ngizman. Menga savol bering.");
    } catch (err) {
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Xatolik';
        alert("model.json topilmadi!");
    }
}

// ==========================================
// MATN GENERATSIYASI
// ==========================================
function generateResponse(userText) {
    const words = userText.toLowerCase().trim().split(/\s+/);
    const startWord = words[words.length - 1]; // oxirgi so'zni olamiz
    
    if (!chain[startWord]) {
        // Modelda bu so'z yo'q - eng yaqinini topamiz
        const keys = Object.keys(chain);
        const found = keys.find(k => k.includes(startWord) || startWord.includes(k));
        if (found) return generateFrom(found, 12);
        
        // Hech narsa topilmasa, tasodifiy javob
        return "Bu haqda hali bilmayman.";
    }
    
    return generateFrom(startWord, 12);
}

function generateFrom(startWord, length) {
    let current = startWord;
    let result = [];
    
    for (let i = 0; i < length; i++) {
        const nextWords = chain[current];
        if (!nextWords) break;
        
        const total = Object.values(nextWords).reduce((a, b) => a + b, 0);
        let rand = Math.random() * total;
        let chosen = null;
        
        for (const [word, count] of Object.entries(nextWords)) {
            rand -= count;
            if (rand <= 0) { chosen = word; break; }
        }
        
        if (!chosen) break;
        result.push(chosen);
        current = chosen;
    }
    
    return result.length > 0 ? result.join(' ') : "...";
}

// ==========================================
// XABAR QO'SHISH
// ==========================================
function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="message-avatar">${role === 'user' ? '👤' : '🤖'}</div>
        <div class="message-content"></div>
    `;
    div.querySelector('.message-content').textContent = text;
    document.getElementById('messages').appendChild(div);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
}

// ==========================================
// HODISALAR
// ==========================================
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

function handleSend() {
    const text = userInput.value.trim();
    if (!text || !chain) return;
    
    userInput.value = '';
    addMessage('user', text);
    
    setTimeout(() => {
        const reply = generateResponse(text);
        addMessage('assistant', reply);
    }, 100);
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

// ==========================================
// BOSHLASH
// ==========================================
loadModel();