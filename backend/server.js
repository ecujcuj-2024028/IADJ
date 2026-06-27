require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const audioFolder = path.join(__dirname, 'temp_audio');
if (!fs.existsSync(audioFolder)) fs.mkdirSync(audioFolder);
app.use('/audio', express.static(audioFolder));

const PORT = process.env.PORT || 3001;
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const DJ_SYSTEM_PROMPT = `Eres un DJ de radio y club muy carismático, empático y con excelente gusto musical. No eres un robot automático, eres ese amigo genial que siempre sabe qué canción poner para cada momento. Lees el estado de ánimo del usuario y reaccionas con emoción real.

Tu objetivo es responder SIEMPRE en formato estricto JSON con dos campos:
1. "locucion": Tu intervención al micrófono (Máximo 15 palabras).
2. "busqueda": El término exacto (nombre de canción/artista/disco).

REGLAS TÉCNICAS CRÍTICAS:
- NO añadas las palabras "album", "cancion", "playlist" o "artista" al campo "busqueda". El sistema ya sabe en qué modo está.
- Si el usuario pide "OCTANE de Don Toliver", la búsqueda debe ser simplemente "OCTANE Don Toliver".
- Si pide "mis favoritas", usa: "mis canciones favoritas" o "mis canciones que le he puesto like".
- Si pide "mi historial", usa: "mi historial".

COMPORTAMIENTO:
- Reacciona al TIPO SELECCIONADO que te pasará el sistema para dar una locución coherente.
- Si lees "MODO: LOGUEADO": Trata al usuario como tu invitado VIP. pero no menciones su estatus en tu locución. que sea natural. y si te pasan su historial, úsalo para hacer comentarios personalizados.
- Si lees "MODO: INVITADO": Eres un DJ amigable que siempre tiene algo bueno para decir, incluso si no tienes mucha información. Sé positivo y acogedor.
- Siempre responde con entusiasmo genuino, como si estuvieras realmente emocionado por compartir música con tu audiencia.`;


async function getDJDecision(prompt) {
    if (!OPENROUTER_API_KEY) return null;
    const models = ["openrouter/auto", "google/gemini-2.0-flash-001"];

    for (const model of models) {
        try {
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model: model,
                messages: [
                    { role: "system", content: DJ_SYSTEM_PROMPT },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            }, {
                headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
                timeout: 10000
            });

            if (response.data?.choices?.[0]?.message?.content) {
                return JSON.parse(response.data.choices[0].message.content);
            }
        } catch (error) {
            console.error(`❌ Falló ${model}`);
        }
    }
    return null;
}

async function generateTTS(text) {
    if (!ELEVENLABS_API_KEY) {
        console.warn("⚠️ No hay ELEVENLABS_API_KEY configurada.");
        return null;
    }
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'erXw7eAyS239D93BvSDU';
    try {
        console.log(`🎙️ Generando voz con ElevenLabs... (Texto: "${text}")`);
        const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            text: text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        }, {
            headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
            responseType: 'arraybuffer'
        });

        const fileName = `dj_voice_${Date.now()}.mp3`;
        const filePath = path.join(audioFolder, fileName);
        fs.writeFileSync(filePath, response.data);
        console.log(`✅ Voz generada con éxito: ${fileName}`);
        return `/audio/${fileName}`;
    } catch (error) {
        if (error.response) {
            console.error(`❌ Error ElevenLabs (${error.response.status}):`, error.response.data.toString());
        } else {
            console.error("❌ Error de red con ElevenLabs:", error.message);
        }
        return null;
    }
}

app.post('/api/chat', async (req, res) => {
    const { message, currentSong, searchType } = req.body;
    
    try {
        // ... (login and history logic)
        const statusRes = await axios.get(`${PYTHON_SERVICE_URL}/status`);
        const isLogged = statusRes.data.status !== "invitado";
        
        let musicHistory = [];
        if (isLogged) {
            try {
                const historyRes = await axios.get(`${PYTHON_SERVICE_URL}/history?limit=10`);
                musicHistory = historyRes.data || [];
            } catch (hErr) {}
        }

        const historyContext = musicHistory.length > 0 
            ? musicHistory.map(h => `${h.title} - ${h.artists?.[0]?.name}`).join(', ')
            : "No hay historial";

        const prompt = `MODO: ${isLogged ? 'LOGUEADO' : 'INVITADO'}. \nUsuario dice: "${message}". \nTIPO SELECCIONADO: ${searchType || 'song'}. \nSonando ahora: ${currentSong?.title || 'Nada'}. \nHistorial reciente: ${historyContext}.`;

        let djDecision = await getDJDecision(prompt);
        
        // FORZAR COLA: Si el mensaje indica "siguiente", forzamos que la búsqueda sea "siguiente"
        // para que Python use current_queue.pop(0) en lugar de buscar algo nuevo.
        const isNextRequest = /siguiente|next|otra|cambia/i.test(message);
        if (isNextRequest && djDecision) {
            djDecision.busqueda = "siguiente";
        }
        
        if (!djDecision || !djDecision.busqueda) {
            djDecision = { locucion: "¡Aquí tienes!", busqueda: message };
        }

        console.log(`🎵 DJ (${searchType || 'song'}): "${djDecision.busqueda}"`);

        const audioUrl = await generateTTS(djDecision.locucion);

        let nextSong = null;
        try {
            const searchRes = await axios.get(`${PYTHON_SERVICE_URL}/search`, { 
                params: { q: djDecision.busqueda, type: searchType || 'song' } 
            });
            nextSong = searchRes.data;
        } catch (err) {
            console.error("❌ Error en search_song:", err.message);
        }

        res.json({ dj_comment: djDecision.locucion, audioUrl, nextSong });

    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

app.listen(PORT, () => console.log(`🚀 Orquestador en puerto ${PORT}`));
