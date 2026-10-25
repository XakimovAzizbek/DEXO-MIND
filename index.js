let markovModel = null;
const messagesEl = null;

// ==========================================
// MARKOV ZANJIRINI YARATISH
// ==========================================
// Har bir so'zdan keyin qaysi so'z kelishini sanaymiz
function buildMarkovChain(text) {
    // So'zlarga ajratamiz
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    
    const chain = {}; // { "salom": { "qalaysan?": 2, "do'stim": 1 } }
    
    for (let i = 0; i < words.length - 1; i++) {
        const current = words[i];
        const next = words[i + 1];
        
        if (!chain[current]) chain[current] = {};
        if (!chain[current][next]) chain[current][next] = 0;
        chain[current][next]++;
    }
    
    return chain;
}

// ==========================================
// MATN GENERATSIYASI
// ==========================================
function generateText(chain, startWord, length = 15) {
    startWord = startWord.toLowerCase().trim();
    
    // Boshlang'ich so'z modelda bormi?
    let current = startWord;
    if (!chain[current]) {
        // Agar yo'q bo'lsa, eng yaqin so'zni topamiz
        const keys = Object.keys(chain);
        const found = keys.find(k => k.startsWith(startWord) || startWord.startsWith(k));
        if (found) current = found;
        else return "Kechirasiz, bu so'zni bilmayman.";
    }
    
    let result = [current];
    
    for (let i = 0; i < length; i++) {
        const nextWords = chain[current];
        if (!nextWords) break;
        
        // Ehtimollik bo'yicha keyingi so'zni tanlash
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
    
    return result.join(' ');
}

// ==========================================
// UI HODISALARI
// ==========================================
const trainBtn = document.getElementById('train-btn');
const exportBtn = document.getElementById('export-btn');
const lossDisplay = document.getElementById('loss-display');
const trainText = document.getElementById('train-text');

trainBtn.addEventListener('click', () => {
    const text = trainText.value.trim();
    if (text.length < 20) return alert("Kamida 20 ta belgi kiriting!");
    
    lossDisplay.textContent = "Model yaratilmoqda...";
    
    setTimeout(() => {
        markovModel = buildMarkovChain(text);
        
        const wordCount = Object.keys(markovModel).length;
        const totalWords = text.split(/\s+/).length;
        
        lossDisplay.textContent = `Tayyor! ${wordCount} ta noyob so'z, ${totalWords} ta umumiy so'z o'rganildi.`;
        exportBtn.disabled = false;
    }, 50);
});

// ==========================================
// MODELNI SAQLASH
// ==========================================
exportBtn.addEventListener('click', () => {
    if (!markovModel) return alert("Model yaratilmagan!");
    
    const jsonString = JSON.stringify({ chain: markovModel });
    
    try {
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = "model.json";
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
        
        alert("Model saqlandi! Endi uni chat.html bilan birga joylashtiring.");
    } catch (e) {
        alert("Saqlashda xatolik: " + e.message);
    }
});