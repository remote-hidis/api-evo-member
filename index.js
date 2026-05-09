const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path'); // Tambahkan module path
const { Pool } = require('pg');
require('dotenv').config();

/**
 * ==========================================
 * Bagian 1: DATABASE MODULE
 * ==========================================
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_CONNECTION_URI,
    connectionTimeoutMillis: 5000,
});

const db = {
    query: (text, params) => pool.query(text, params),
    init: async () => {
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
            console.log('✅ DATABASE: Tabel members siap.');
        } catch (err) {
            console.error('❌ DATABASE ERROR:', err.message);
            throw err;
        }
    }
};

/**
 * ==========================================
 * Bagian 2: EVOLUTION SERVICE
 * ==========================================
 */
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://easy-evo.nganjuk.net';
const MASTER_KEY = process.env.MASTER_KEY || 'nganjuk123';

const evolutionService = {
    createInstance: async (name, token) => {
        const response = await axios.post(`${EVOLUTION_URL}/instance/create`, {
            instanceName: name,
            token: token,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS"
        }, {
            headers: { 'apikey': MASTER_KEY }
        });
        return response.data;
    },
    
    deleteInstance: async (name) => {
        const response = await axios.delete(`${EVOLUTION_URL}/instance/delete/${name}`, {
            headers: { 'apikey': MASTER_KEY }
        });
        return response.data;
    }
};

/**
 * ==========================================
 * Bagian 3: MIDDLEWARE & SECURITY
 * ==========================================
 */
const app = express();

// Middleware dasar
app.use(cors());
app.use(express.json());

// --- SERVE STATIC FILES ---
// Ini akan membaca folder 'public' dan mencari 'index.html' secara otomatis
app.use(express.static(path.join(__dirname, 'public')));

const adminAuth = (req, res, next) => {
    const apiKey = req.headers['apikey'];
    if (apiKey === MASTER_KEY) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized: Admin API Key diperlukan' });
    }
};

/**
 * ==========================================
 * Bagian 4: API ROUTES
 * ==========================================
 */

// Login Member
app.post('/api/login-member', async (req, res) => {
    const { name, apiKey } = req.body;
    try {
        const result = await db.query(
            'SELECT instance_name, status FROM members WHERE instance_name = $1 AND api_key = $2',
            [name, apiKey]
        );
        if (result.rows.length > 0) {
            res.json({ status: 'Success', message: 'Login berhasil', data: result.rows[0] });
        } else {
            res.status(401).json({ error: 'Login gagal' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register Member (Protected)
app.post('/api/register-member', adminAuth, async (req, res) => {
    const { name, customToken } = req.body;
    try {
        const evoData = await evolutionService.createInstance(name, customToken);
        await db.query(
            'INSERT INTO members (instance_name, api_key) VALUES ($1, $2) ON CONFLICT (instance_name) DO UPDATE SET api_key = $2',
            [name, customToken]
        );
        res.status(201).json({ status: 'Success', evolution: evoData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List Members (Protected)
app.get('/api/members', adminAuth, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM members ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SPA FALLBACK ---
// Jika user mengakses route yang tidak terdaftar (misal refresh halaman di browser)
// Arahkan kembali ke index.html agar React yang menangani routingnya
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * ==========================================
 * Bagian 5: BOOTSTRAPPER
 * ==========================================
 */
const PORT = process.env.PORT || 3030;

const start = async () => {
    try {
        await pool.connect();
        await db.init();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 HYBRID SERVER RUNNING ON PORT ${PORT}`);
            console.log(`📂 Serving static files from: /public`);
        });
    } catch (err) {
        console.error('❌ FATAL STARTUP ERROR:', err.message);
        process.exit(1);
    }
};

start();
