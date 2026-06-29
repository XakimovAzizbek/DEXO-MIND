const messages = document.getElementById('messages');
const input = document.getElementById('input');
const btn = document.getElementById('send-btn');
const status = document.getElementById('status');

// Hugging Face tokeningizni shu yerga qo'ying
const HF_TOKEN = "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"; 
// Model manzili
const API_URL = "https://api-inference.huggingface.co/models/google/gemma-2-2b-it";

async function runAI(prompt) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ inputs: prompt })
        });
        
        const result = await response.json();
        
        // Hugging Face javob formatini tekshirish
        if (result && result[0] && result[0].generated_text) {
            return result[0].generated_text;
        } else {
            return "Kechirasiz, model javob qaytarmadi.";
        }
    } catch (error) {
        console.error(error);
        return "Xatolik yuz berdi: Internet yoki Tokenni tekshiring.";
    }
}

status.textContent = 'DEXO MIND Online (HuggingFace Powered)';

btn.addEventListener('click', async () => {
    const text = input.value;
    if (!text) return;
    
    messages.innerHTML += `<p><b>Siz:</b> ${text}</p>`;
    input.value = '';
    status.textContent = 'DEXO MIND o\'ylamoqda...';

    const aiResponse = await runAI(text);
    
    messages.innerHTML += `<p style="color: #00e5ff;"><b>DEXO MIND:</b> ${aiResponse}</p>`;
    status.textContent = 'DEXO MIND Online';
    messages.scrollTop = messages.scrollHeight;
});
