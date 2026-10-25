// ==========================================
// 1. NEYRON TARMOQ KLASSI (Inference uchun)
// ==========================================
class NeuralNet {
    constructor(vocabSize, contextSize, hiddenSize) {
        this.vocabSize = vocabSize;
        this.contextSize = contextSize;
        this.inputSize = vocabSize * contextSize;
        this.hiddenSize = hiddenSize;
        this.outSize = vocabSize;
    }

    loadWeights(data) {
        this.W1 = new Float32Array(data.W1);
        this.b1 = new Float32Array(data.b1);
        this.W2 = new Float32Array(data.W2);
        this.b2 = new Float32Array(data.b2);
    }

    forward(x) {
        const h = new Float32Array(this.hiddenSize);
        for (let i = 0; i < this.hiddenSize; i++) {
            let sum = this.b1[i];
            for (let j = 0; j < this.inputSize; j++) sum += this.W1[i * this.inputSize + j] * x[j];
            h[i] = sum > 0 ? sum : 0; // ReLU
        }
        const y = new Float32Array(this.outSize);
        for (let i = 0; i < this.outSize; i++) {
            let sum = this.b2[i];
            for (let j = 0; j < this.hiddenSize; j++) sum += this.W2[i * this.hiddenSize + j] * h[j];
            y[i] = sum;
        }
        // Softmax
        let max = -Infinity;
        for (let v of y) if (v > max) max = v;
        let sum = 0;
        const probs = new Float32Array(this.outSize);
        for (let i = 0; i < this.outSize; i++) { probs[i] = Math.exp(y[i] - max); sum += probs[i]; }
        for (let i = 0; i < this.outSize; i++) probs[i] /= sum;
        return { h, probs };
    }

    generate(contextIndices, length, temp = 0.7) {
        let currentContext = [...contextIndices];
        let result = [];
        for (let step = 0; step < length; step++) {
            const x = new Float32Array(this.inputSize);
            for (let i = 0; i < this.contextSize; i++) x[i * this.vocabSize + currentContext[i]] = 1;
            const { probs } = this.forward(x);

            // Temperature (harorat) — tasodifiylikni boshqaradi
            let sum = 0;
            const tempProbs = new Float32Array(this.outSize);
            for (let i = 0; i < this.outSize; i++) {
                tempProbs[i] = Math.pow(probs[i], 1 / temp);
                sum += tempProbs[i];
            }
            for (let i = 0; i < this.outSize; i++) tempProbs[i] /= sum;

            let r = Math.random(), cumulative = 0, chosen = 0;
            for (let i = 0; i < this.outSize; i++) {
                cumulative += tempProbs[i];
                if (r <= cumulative) { chosen = i; break; }
            }
            result.push(chosen);
            currentContext.shift();
            currentContext.push(chosen);
        }
        return result;
    }
}

// ==========================================
// 2. HOLAT VA DOM
// ==========================================
let vocab = [];
let charToIdx = {}, idxToChar = {};
let model = null;
const contextSize = 10;   // O'qitish versiyasi bilan bir xil bo'lishi SHART
const hiddenSize  = 128;  // O'qitish versiyasi bilan bir xil bo'lishi SHART

const loadingScreen = document.getElementById('loading-screen');
const errorScreen   = document.getElementById('error-screen');
const chatSection   = document.getElementById('chat-section');
const statusDot     = document.getElementById('status-dot');
const statusText    = document.getElementById('status-text');
const messagesEl    = document.getElementById('messages');
const userInput     = document.getElementById('user-input');
const sendBtn       = document.getElementById('send-btn');
const suggestionsEl = document.getElementById('suggestions');

// ==========================================
// 3. MODELNI YUKLASH
// ==========================================
async function loadModel() {
    statusDot.className = 'status-dot loading';
    statusText.textContent = 'Yuklanmoqda...';

    try {
        const response = await fetch('model.json');
        if (!response.ok) throw new Error("model.json topilmadi");

        const data = await response.json();

        // Lug'atni tiklash
        vocab = [...data.vocabText];
        charToIdx = {}; idxToChar = {};
        vocab.forEach((c, i) => { charToIdx[c] = i; idxToChar[i] = c; });

        // Modelni yaratish va vaznlarni yuklash
        model = new NeuralNet(vocab.length, contextSize, hiddenSize);
        model.loadWeights(data);

        // Muvaffaqiyatli yuklandi
        statusDot.className = 'status-dot ready';
        statusText.textContent = 'Tayyor';

        loadingScreen.style.display = 'none';
        chatSection.style.display = 'flex';
        sendBtn.disabled = false;

        // Kutib olish xabari
        addMessage('assistant', "Salom! Men sizning shaxsiy AI'ngizman. Menga savol bering.");
    } catch (err) {
        console.error("Model yuklashda xato:", err);
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Xatolik';
        loadingScreen.style.display = 'none';
        errorScreen.style.display = 'flex';
    }
}

// ==========================================
// 4. XABAR QO'SHISH
// ==========================================
function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="message-avatar">${role === 'user' ? '👤' : '🤖'}</div>
        <div class="message-content"></div>
    `;
    // XSS dan himoya qilish
    div.querySelector('.message-content').textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
}

function showTyping() {
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
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
    document.getElementById('typing-indicator')?.remove();
}

// ==========================================
// 5. JAVOB GENERATSIYA QILISH
// ==========================================
function generateResponse(userText) {
    let prompt = userText.toLowerCase();

    // Kontekst uchun oxirgi 10 ta harfni olamiz
    // Agar matn qisqa bo'lsa, bo'sh joy bilan to'ldiramiz
    if (prompt.length < contextSize) {
        prompt = prompt.padStart(contextSize, ' ');
    }

    const context = [];
    for (let i = 0; i < contextSize; i++) {
        const char = prompt[prompt.length - contextSize + i];
        // Lug'atda bo'lmagan harflar uchun 0 indeksini ishlatamiz
        context.push(charToIdx[char] !== undefined ? charToIdx[char] : 0);
    }

    // 80 ta harf generatsiya qilamiz
    const genIndices = model.generate(context, 80, 0.6);
    let response = genIndices.map(i => idxToChar[i]).join('');

    // Prompt takrorlanishini olib tashlaymiz
    if (response.startsWith(prompt)) {
        response = response.substring(prompt.length).trim();
    }

    return response || "...";
}

// ==========================================
// 6. YUBORISH
// ==========================================
function handleSend() {
    const text = userInput.value.trim();
    if (!text || !model) return;

    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;

    addMessage('user', text);
    showTyping();

    // UI qotib qolmasligi uchun setTimeout
    setTimeout(() => {
        try {
            const reply = generateResponse(text);
            removeTyping();
            addMessage('assistant', reply);
        } catch (err) {
            removeTyping();
            addMessage('assistant', `Xatolik: ${err.message}`);
        } finally {
            sendBtn.disabled = false;
            userInput.focus();
        }
    }, 50);
}

// ==========================================
// 7. HODISALAR
// ==========================================
sendBtn.addEventListener('click', handleSend);

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
});

// Tavsiya tugmalari
document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        userInput.value = chip.dataset.text;
        userInput.focus();
    });
});

// ==========================================
// 8. BOSHLASH
// ==========================================
loadModel();