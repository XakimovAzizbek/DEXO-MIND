import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

const status = document.getElementById('status');
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const btn = document.getElementById('send-btn');

async function initAI() {
    try {
        status.textContent = 'Model yuklanmoqda... (bu vaqt oladi)';
        
        // Modelni yuklash
        const generator = await pipeline('text2text-generation', 'Xenova/flan-t5-small');
        
        status.textContent = 'DEXO MIND Online';
        
        btn.addEventListener('click', async () => {
            const text = input.value;
            if (!text) return;
            
            messages.innerHTML += `<p><b>Siz:</b> ${text}</p>`;
            input.value = '';
            
            // AI javobini olish
            const output = await generator(text);
            messages.innerHTML += `<p style="color: #00e5ff;"><b>DEXO MIND:</b> ${output[0].generated_text}</p>`;
            messages.scrollTop = messages.scrollHeight;
        });
    } catch (err) {
        console.error(err);
        status.textContent = 'Xatolik yuz berdi: ' + err.message;
    }
}

initAI();
