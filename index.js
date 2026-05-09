const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

/**
 * KONFIGURASI DATABASE POSTGRESQL
 * Pastikan variabel DATABASE_CONNECTION_URI sudah diatur di Easypanel
 * Format: postgres://user:password@host:5432/database
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_CONNECTION_URI,
});

/**
 * KONFIGURASI EVOLUTION API
 */
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://easy-evo.nganjuk.net';
const MASTER_KEY = process.env.MASTER_KEY || 'nganjuk123';
const PORT = process.env.PORT || 3030;

/**
 * INISIALISASI TABEL MEMBER
 * Menyiapkan skema database saat aplikasi pertama kali dijalankan
 */
const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS members (
                id SERIAL PRIMARY KEY,
                instance_name TEXT UNIQUE NOT NULL,
                api_key TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Database PostgreSQL berhasil terhubung dan tabel siap.');
    } catch (err) {
        console.error('❌ Gagal menginisialisasi database:', err.message);
    }
};
initDb();

/**
 * ENDPOINT: Register Member
 * Membuat instance di Evolution API dan mencatatnya ke PostgreSQL
 */
app.post('/register-member', async (req, res) => {
    const { name, customToken } = req.body;

    if (!name || !customToken) {
        return res.status(400).json({ error: 'Nama instance dan customToken wajib diisi' });
    }

    try {
        // 1. Panggil Evolution API untuk membuat instance
        const evoResponse = await axios.post(`${EVOLUTION_URL}/instance/create`, {
            instanceName: name,
            token: customToken,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS"
        }, {
            headers: { 'apikey': MASTER_KEY }
        });

        // 2. Simpan atau perbarui data member di database lokal
        await pool.query(
            `INSERT INTO members (instance_name, api_key) 
             VALUES ($1, $2) 
             ON CONFLICT (instance_name) 
             DO UPDATE SET api_key = $2`,
            [name, customToken]
        );

        res.status(201).json({
            status: 'Success',
            message: `Member ${name} berhasil didaftarkan`,
            data: evoResponse.data,
            instructions: {
                instanceName: name,
                memberApiKey: customToken,
                endpoint: `${EVOLUTION_URL}/instance/connectionState/${name}`
            }
        });
    } catch (error) {
        console.error('Error pendaftaran:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Gagal memproses pendaftaran ke Evolution API',
            details: error.response?.data || error.message
        });
    }
});

/**
 * ENDPOINT: List Members
 * Mengambil daftar seluruh member dari database
 */
app.get('/members', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM members ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data member dari database' });
    }
});

/**
 * Health Check untuk monitoring Easypanel
 */
app.get('/health', (req, res) => res.send('Manager Service Online'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Manager Service berjalan di port ${PORT}`);
});
