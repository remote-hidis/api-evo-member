const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

/**
 * ==========================================
 * Bagian 1: DATABASE MODULE (db.js)
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
 * Bagian 2: EVOLUTION SERVICE (services/evolution.js)
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

// Middleware untuk melindungi endpoint Admin
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
 * Bagian 4: ROUTES & APP CORE (index.js)
 * ==========================================
 */
const app = express();
app.use(express.json());

// -- Route: Login Member --
// Digunakan oleh frontend member untuk verifikasi kredensial mereka
app.post('/login-member', async (req, res) => {
    const { name, apiKey } = req.body;

    if (!name || !apiKey) {
        return res.status(400).json({ error: 'name dan apiKey wajib diisi' });
    }

    try {
        const result = await db.query(
            'SELECT instance_name, status FROM members WHERE instance_name = $1 AND api_key = $2',
            [name, apiKey]
        );

        if (result.rows.length > 0) {
            res.json({
                status: 'Success',
                message: 'Login berhasil',
                data: result.rows[0]
            });
        } else {
            res.status(401).json({ error: 'Login gagal: Nama instance atau API Key salah' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
});

// -- Route: Register Member (Protected Admin) --
app.post('/register-member', adminAuth, async (req, res) => {
    const { name, customToken } = req.body;

    if (!name || !customToken) {
        return res.status(400).json({ error: 'name dan customToken wajib diisi' });
    }

    try {
        console.log(`[ACTION] Registering: ${name}`);
        
        // Call Evolution Service
        const evoData = await evolutionService.createInstance(name, customToken);

        // Save to DB
        await db.query(
            `INSERT INTO members (instance_name, api_key) 
             VALUES ($1, $2) 
             ON CONFLICT (instance_name) DO UPDATE SET api_key = $2`,
            [name, customToken]
        );

        res.status(201).json({ status: 'Success', evolution: evoData });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            error: 'Gagal pendaftaran',
            details: error.response?.data || error.message
        });
    }
});

// -- Route: Delete Member (Protected Admin) --
app.delete('/delete-member/:name', adminAuth, async (req, res) => {
    const instanceName = req.params.name;

    try {
        console.log(`[ACTION] Deleting: ${instanceName}`);
        
        // Delete from Evolution
        const evoData = await evolutionService.deleteInstance(instanceName);

        // Delete from DB
        await db.query('DELETE FROM members WHERE instance_name = $1', [instanceName]);

        res.json({ status: 'Success', evolution: evoData });
    } catch (error) {
        if (error.response?.status === 404) {
            await db.query('DELETE FROM members WHERE instance_name = $1', [instanceName]);
            return res.status(404).json({ message: 'Data lokal dibersihkan (API 404)' });
        }
        res.status(500).json({ error: 'Gagal hapus', details: error.message });
    }
});

// -- Route: List Members (Protected Admin) --
app.get('/members', adminAuth, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM members ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -- Health Check --
app.get('/health', (req, res) => res.send('Modular Manager Online'));

/**
 * ==========================================
 * Bagian 5: BOOTSTRAPPER
 * ==========================================
 */
const PORT = process.env.PORT || 3000;

const start = async () => {
    try {
        await pool.connect();
        await db.init();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
        });
    } catch (err) {
        console.error('❌ FATAL STARTUP ERROR:', err.message);
        process.exit(1);
    }
};

start();
