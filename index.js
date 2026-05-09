const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

/**
 * KONFIGURASI DATABASE POSTGRESQL
 * Karena berada di project yang sama, gunakan nama service sebagai hostname.
 * Pastikan DATABASE_CONNECTION_URI di Easypanel mengikuti format:
 * postgres://postgres:password@evolution-api-db:5432/postgres
 */
const connectionString = process.env.DATABASE_CONNECTION_URI;

console.log('--- Mencoba Koneksi Database (Internal Network) ---');
if (connectionString) {
    const maskedUri = connectionString.replace(/:([^:@]+)@/, ':****@');
    console.log('Menghubungkan ke:', maskedUri);
} else {
    console.error('❌ ERROR: DATABASE_CONNECTION_URI tidak ditemukan!');
}

const pool = new Pool({
    connectionString: connectionString,
    // Menambahkan timeout agar tidak menggantung jika hostname salah
    connectionTimeoutMillis: 5000, 
});

// Verifikasi koneksi saat startup
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ KONEKSI DATABASE GAGAL:', err.message);
        console.error('Tips: Pastikan nama service database di URI sudah benar.');
    } else {
        console.log('✅ KONEKSI DATABASE BERHASIL');
        release();
    }
});

/**
 * KONFIGURASI EVOLUTION API
 */
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://easy-evo.nganjuk.net';
const MASTER_KEY = process.env.MASTER_KEY || 'nganjuk123';
const PORT = process.env.PORT || 3030;

/**
 * INISIALISASI TABEL MEMBER
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
        console.log('✅ Skema tabel database telah diverifikasi.');
    } catch (err) {
        console.error('❌ Gagal memeriksa/membuat tabel:', err.message);
    }
};
initDb();

/**
 * ENDPOINT: Register Member
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
        console.error('Detail Error:', error.message);
        
        res.status(error.response?.status || 500).json({
            error: 'Gagal memproses pendaftaran',
            message: error.message,
            details: error.response?.data || 'Cek koneksi database atau Evolution API'
        });
    }
});

/**
 * ENDPOINT: Ambil Semua Member
 */
app.get('/members', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM members ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data member: ' + err.message });
    }
});

/**
 * Health Check untuk Easypanel
 */
app.get('/health', (req, res) => res.send('Manager Service Online'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Manager Service berjalan di port ${PORT}`);
});
