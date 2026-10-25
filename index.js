// ==========================================
// 1. NEYRON TARMOQ (Sof JavaScript)
// ==========================================
class NeuralNet {
    constructor(vocabSize, contextSize, hiddenSize) {
        this.vocabSize = vocabSize;
        this.contextSize = contextSize;
        this.inputSize = vocabSize * contextSize;
        this.hiddenSize = hiddenSize;
        this.outSize = vocabSize;
        this.initWeights();
    }
    initWeights() {
        this.W1 = new Float32Array(this.hiddenSize * this.inputSize).map(() => (Math.random() * 2 - 1) * 0.1);
        this.b1 = new Float32Array(this.hiddenSize);
        this.W2 = new Float32Array(this.outSize * this.hiddenSize).map(() => (Math.random() * 2 - 1) * 0.1);
        this.b2 = new Float32Array(this.outSize);
    }
    // Yuklash uchun
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
    train(x, targetIdx, lr) {
        const { h, probs } = this.forward(x);
        const dy = new Float32Array(probs);
        dy[targetIdx] -= 1;
        for (let i = 0; i < this.outSize; i++) {
            this.b2[i] -= lr * dy[i];
            for (let j = 0; j < this.hiddenSize; j++) this.W2[i * this.hiddenSize + j] -= lr * dy[i] * h[j];
        }
        const dh = new Float32Array(this.hiddenSize);
        for (let j = 0; j < this.hiddenSize; j++) {
            let sum = 0;
            for (let i = 0; i < this.outSize; i++) sum += dy[i] * this.W2[i * this.hiddenSize + j];
            dh[j] = h[j] > 0 ? sum : 0;
        }
        for (let i = 0; i < this.hiddenSize; i++) {
            this.b1[i] -= lr * dh[i];
            for (let j = 0; j < this.inputSize; j++) this.W1[i * this.inputSize + j] -= lr * dh[i] * x[j];
        }
        return -Math.log(probs[targetIdx] + 1e-15);
    }
    generate(contextIndices, length, temp = 0.7) {
        let currentContext = [...contextIndices];
        let result = [];
        for (let step = 0; step < length; step++) {
            const x = new Float32Array(this.inputSize);
            for (let i = 0; i < this.contextSize; i++) x[i * this.vocabSize + currentContext[i]] = 1;
            const { probs } = this.forward(x);
            
            // Temperature
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
// 2. DASTUR LOGIKASI
// ==========================================
const trainerSection = document.getElementById('trainer-section');
const chatSection = document.getElementById('chat-section');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

let vocab, charToIdx, idxToChar;
let model;
const contextSize = 10; // 10 ta harfga qarab, 11-harfni taxmin qiladi

// Matndan lug'at yaratish
function buildVocab(text) {
    vocab = [...new Set(text.split(''))];
    charToIdx = {}; idxToChar = {};
    vocab.forEach((c, i) => { charToIdx[c] = i; idxToChar[i] = c; });
}

// ==========================================
// 3. MODELNI YUKLASH (Agar boshqalar kirsa)
// ==========================================
async function loadExistingModel() {
    try {
        statusText.textContent = "Model qidirilmoqda...";
        const response = await fetch('model.json'); // Serverdagi modelni qidiradi
        if (!response.ok) throw new Error("Model topilmadi");
        
        const data = await response.json();
        buildVocab(data.vocabText);
        model = new NeuralNet(vocab.length, contextSize, 128);
        model.loadWeights(data);
        
        // Muvaffaqiyatli yuklandi -> Chatni ochamiz
        statusDot.className = 'status-dot ready';
        statusText.textContent = "Model tayyor";
        trainerSection.style.display = 'none';
        chatSection.style.display = 'flex';
        addMessage('assistant', "Salom! Men tayyor modelman. Menga savol bering.");
    } catch (error) {
        // Model topilmadi -> O'qitish oynasini ochamiz
        statusDot.className = 'status-dot';
        statusText.textContent = "Model o'qitilmagan";
        trainerSection.style.display = 'block';
        chatSection.style.display = 'none';
    }
}

// ==========================================
// 4. O'QITISH VA SAQLASH (Faqat siz uchun)
// ==========================================
document.getElementById('train-btn').addEventListener('click', () => {
    const text = document.getElementById('train-text').value.toLowerCase();
    if (text.length < 50) return alert("Kamida 50 ta harf kiriting!");
    
    buildVocab(text);
    model = new NeuralNet(vocab.length, contextSize, 128);
    
    const indices = text.split('').map(c => charToIdx[c]);
    const data = [];
    for (let i = 0; i <= indices.length - contextSize - 1; i++) {
        data.push({ context: indices.slice(i, i + contextSize), target: indices[i + contextSize] });
    }

    const trainBtn = document.getElementById('train-btn');
    const exportBtn = document.getElementById('export-btn');
    const lossDisplay = document.getElementById('loss-display');
    
    trainBtn.disabled = true;
    exportBtn.disabled = true;
    let epoch = 0;
    const totalEpochs = 5000; // O'qitish davomiyligi

    const interval = setInterval(() => {
        let loss = 0;
        for (let b = 0; b < 100; b++) {
            const item = data[Math.floor(Math.random() * data.length)];
            const x = new Float32Array(model.inputSize);
            for (let c = 0; c < contextSize; c++) x[c * vocab.length + item.context[c]] = 1;
            loss += model.train(x, item.target, 0.05); // Learning rate
        }
        epoch += 100;
        lossDisplay.textContent = `O'qitilmoqda... Epoch: ${epoch} | Xatolik: ${(loss / 100).toFixed(4)}`;

        if (epoch >= totalEpochs) {
            clearInterval(interval);
            trainBtn.disabled = false;
            exportBtn.disabled = false;
            lossDisplay.textContent = "O'qitish tugadi! Endi modelni saqlashingiz mumkin.";
        }
    }, 10);
});

// Modelni JSON qilib yuklab olish
document.getElementById('export-btn').addEventListener('click', () => {
    const modelData = {
        vocabText: vocab.join(''), // Lug'atni saqlash
        W1: Array.from(model.W1),
        b1: Array.from(model.b1),
        W2: Array.from(model.W2),
        b2: Array.from(model.b2)
    };
    
    const blob = new Blob([JSON.stringify(modelData)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "model.json";
    a.click();
    URL.revokeObjectURL(url);
});

// ==========================================
// 5. CHAT (Suhbat)
// ==========================================
const messagesEl = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="message-avatar">${role === 'user' ? '👤' : '🤖'}</div>
        <div class="message-content">${text}</div>
    `;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;
    
    userInput.value = '';
    addMessage('user', text);
    
    // Javob generatsiya qilish
    setTimeout(() => {
        let prompt = text.toLowerCase();
        if (prompt.length < contextSize) prompt = prompt.padStart(contextSize, ' ');
        
        const context = [];
        for (let i = 0; i < contextSize; i++) {
            const char = prompt[prompt.length - contextSize + i];
            context.push(charToIdx[char] !== undefined ? charToIdx[char] : 0);
        }
        
        // 40 ta harf generatsiya qilamiz
        const genIndices = model.generate(context, 40, 0.5);
        let response = genIndices.map(i => idxToChar[i]).join('');
        
        // Tozalash (agar model promptni takrorlasa)
        if (response.startsWith(prompt)) response = response.replace(prompt, '').trim();
        
        addMessage('assistant', response || "...");
    }, 50);
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

// ==========================================
// 6. ISHGA TUSHIRISH
// ==========================================
// Sahifa ochilganda modelni yuklashga urinamiz
loadExistingModel();