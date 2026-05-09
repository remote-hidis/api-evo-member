const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

/**
 * KONFIGURASI ENVIRONMENT
 * Di Easypanel, pastikan Anda mengisi variabel ini di tab Environment
 */
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://easy-evo.nganjuk.net';
const MASTER_KEY = process.env.MASTER_KEY || 'nganjuk123';
const PORT = process.env.PORT || 3030;

/**
 * ENDPOINT: Create Member
 * Gunakan ini untuk mendaftarkan member baru
 */
app.post('/register-member', async (req, res) => {
    const { name, customToken } = req.body;

    if (!name || !customToken) {
        return res.status(400).json({ error: 'Nama dan customToken wajib diisi' });
    }

    try {
        const response = await axios.post(`${EVOLUTION_URL}/instance/create`, {
            instanceName: name,
            token: customToken,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS"
        }, {
            headers: { 'apikey': MASTER_KEY }
        });

        res.status(201).json({
            status: 'Success',
            message: `Instance untuk ${name} berhasil dibuat`,
            data: response.data,
            instructions: {
                apiKey: customToken,
                endpoint: `${EVOLUTION_URL}/instance/connectionState/${name}`
            }
        });
    } catch (error) {
        console.error('Error creating instance:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Gagal membuat instance di Evolution API',
            details: error.response?.data || error.message
        });
    }
});

app.get('/health', (req, res) => res.send('Manager Service Online'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Manager Service berjalan di port ${PORT}`);
});

/* DOCKERFILE (Copy bagian ini jika ingin menggunakan Docker build):
---
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
---
*/
