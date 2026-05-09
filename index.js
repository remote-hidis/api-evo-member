const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

/**
 * DATABASE CONNECTION
 * Konfigurasi koneksi ke PostgreSQL menggunakan variabel lingkungan.
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_CONNECTION_URI,
    connectionTimeoutMillis: 5000, 
});

/**
 * CONFIGURATION EVOLUTION API
 * MASTER_KEY adalah kunci Super Admin untuk mengelola semua instance.
 */
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://easy-evo.nganjuk.net';
const MASTER_KEY = process.env.MASTER_KEY || 'nganjuk123';
const PORT = process.env.PORT || 3000;

/**
 * STARTUP PROCEDURE
 * Memverifikasi koneksi database sebelum menjalankan server Express.
 */
const startServer = async () => {
    try {
        console.log('--- Startup Manager Service ---');
        const client = await pool.connect();
        console.log('✅ DATABASE: Terhubung');
        client.release();
        
        await initDb();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 MANAGER AKTIF: Port ${PORT}`);
            console.log(`🔗 TARGET EVO: ${EVOLUTION_URL}`);
            console.log(`🔑 MODE: Super Admin aktif`);
        });
    } catch (err) {
        console.error('❌ GAGAL STARTUP DATABASE:', err.message);
        process.exit(1);
    }
};

/**
 * DATABASE TABLE INIT
 * Menyiapkan tabel 'members' jika belum ada di PostgreSQL.
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
        console.log('✅ SKEMA DATABASE: Tabel members siap.');
    } catch (err) {
        console.error('❌ GAGAL INISIALISASI TABEL:', err.message);
        throw err;
    }
};

/**
 * ENDPOINT: Register Member
 * POST /register-member
 * Mendaftarkan instance baru di Evolution API dan menyimpan datanya di DB.
 */
app.post('/register-member', async (req, res) => {
    const { name, customToken } = req.body;

    if (!name || !customToken) {
        return res.status(400).json({ error: 'name dan customToken wajib diisi' });
    }

    try {
        console.log(`[ADMIN] Mendaftarkan instance: ${name}`);

        // Kirim request ke Evolution API menggunakan Master Key
        const evoResponse = await axios.post(`${EVOLUTION_URL}/instance/create`, {
            instanceName: name,
            token: customToken,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS"
        }, {
            headers: { 'apikey': MASTER_KEY }
        });

        // Simpan atau update ke PostgreSQL lokal
        await pool.query(
            `INSERT INTO members (instance_name, api_key) 
             VALUES ($1, $2) 
             ON CONFLICT (instance_name) DO UPDATE SET api_key = $2`,
            [name, customToken]
        );

        res.status(201).json({
            status: 'Success',
            message: `Member ${name} berhasil dibuat`,
            evolution: evoResponse.data
        });
    } catch (error) {
        console.error('Create Error:', error.message);
        res.status(error.response?.status || 500).json({
            error: 'Gagal mendaftarkan member',
            details: error.response?.data || error.message
        });
    }
});

/**
 * ENDPOINT: Delete Member
 * DELETE /delete-member/:name
 * Menghapus instance dari Evolution API dan record dari database.
 */
app.delete('/delete-member/:name', async (req, res) => {
    const instanceName = req.params.name;

    try {
        console.log(`[ADMIN] Menghapus instance: ${instanceName}`);

        // 1. Hapus dari Evolution API menggunakan Master Key
        const evoResponse = await axios.delete(`${EVOLUTION_URL}/instance/delete/${instanceName}`, {
            headers: { 'apikey': MASTER_KEY }
        });

        // 2. Hapus dari Database Lokal
        await pool.query('DELETE FROM members WHERE instance_name = $1', [instanceName]);

        res.json({
            status: 'Success',
            message: `Member ${instanceName} dihapus dari API dan Database`,
            evolution: evoResponse.data
        });
    } catch (error) {
        console.error('Delete Error:', error.message);
        
        // Jika di API sudah hilang, pastikan di DB lokal juga bersih
        if (error.response?.status === 404) {
            await pool.query('DELETE FROM members WHERE instance_name = $1', [instanceName]);
            return res.status(404).json({
                status: 'Cleaned',
                message: 'Data sudah tidak ada di API, record lokal telah dibersihkan.'
            });
        }

        res.status(error.response?.status || 500).json({
            error: 'Gagal menghapus member',
            details: error.response?.data || error.message
        });
    }
});

/**
 * ENDPOINT: List Members
 * GET /members
 */
app.get('/members', async (req, res) => {
    try {
        const result = await pool.query('SELECT instance_name, status, created_at FROM members ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data: ' + err.message });
    }
});

app.get('/health', (req, res) => res.send('Manager Service Online'));

// Menjalankan startup aplikasi
startServer();
