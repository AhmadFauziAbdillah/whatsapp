import { default as makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

let sock;
let qrGenerated = false;
let isConnected = false;
let currentQR = null;

// Pastikan folder auth ada
const authFolder = join(__dirname, 'auth_info_baileys');
if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
}

// Setup WhatsApp Connection
async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true, // UBAH KE TRUE untuk debug
            logger: pino({ level: 'silent' }),
            browser: ['Warranty System', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: undefined,
            keepAliveIntervalMs: 30000
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📱 QR Code generated - Length:', qr.length);
                currentQR = qr;
                qrGenerated = true;
                isConnected = false;
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Connection closed. Reconnecting:', shouldReconnect);
                
                isConnected = false;
                
                if (shouldReconnect) {
                    setTimeout(() => {
                        connectToWhatsApp();
                    }, 5000);
                } else {
                    console.log('⚠️ Bot logged out. Please delete auth folder and restart.');
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp Bot Connected!');
                console.log(`📱 Bot Number: ${sock.user.id.split(':')[0]}`);
                currentQR = null;
                qrGenerated = false;
                isConnected = true;
            }
        });

        sock.ev.on('creds.update', saveCreds);
        
    } catch (error) {
        console.error('Error connecting to WhatsApp:', error);
        setTimeout(connectToWhatsApp, 10000);
    }
}

// Format phone number
function formatPhoneNumber(phone) {
    let formatted = phone.replace(/\D/g, '');
    if (formatted.startsWith('0')) {
        formatted = '62' + formatted.substring(1);
    } else if (!formatted.startsWith('62')) {
        formatted = '62' + formatted;
    }
    return formatted;
}

// Root endpoint - Landing page dengan QR Code fix
app.get('/', (req, res) => {
    const qrData = currentQR ? JSON.stringify(currentQR).replace(/'/g, "\\'") : null;
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Bot API</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .container {
                background: white;
                border-radius: 20px;
                padding: 40px;
                max-width: 600px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            h1 {
                color: #333;
                margin-bottom: 10px;
                font-size: 2em;
            }
            .status {
                display: inline-block;
                padding: 8px 16px;
                border-radius: 20px;
                font-weight: bold;
                margin: 20px 0;
            }
            .connected { background: #10b981; color: white; }
            .disconnected { background: #ef4444; color: white; }
            .info {
                background: #f3f4f6;
                padding: 20px;
                border-radius: 10px;
                margin: 20px 0;
            }
            .info p {
                margin: 10px 0;
                color: #666;
            }
            .endpoints {
                margin-top: 30px;
            }
            .endpoint {
                background: #f9fafb;
                padding: 15px;
                border-radius: 8px;
                margin: 10px 0;
                border-left: 4px solid #667eea;
            }
            .endpoint code {
                background: #e5e7eb;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.9em;
                word-break: break-all;
            }
            .qr-section {
                text-align: center;
                margin: 20px 0;
                padding: 20px;
                background: #f9fafb;
                border-radius: 10px;
            }
            #qrcode {
                margin: 20px auto;
                padding: 20px;
                background: white;
                display: inline-block;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            button {
                background: #667eea;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1em;
                font-weight: bold;
                margin: 10px 0;
            }
            button:hover {
                background: #5568d3;
            }
            .debug {
                background: #fef3c7;
                padding: 10px;
                border-radius: 5px;
                margin: 10px 0;
                font-size: 0.9em;
                color: #92400e;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 WhatsApp Bot API</h1>
            <div class="status ${isConnected ? 'connected' : 'disconnected'}" id="status">
                ${isConnected ? '✅ Connected' : '❌ Disconnected'}
            </div>
            
            ${!isConnected && qrGenerated && qrData ? `
            <div class="qr-section">
                <h3>📱 Scan QR Code dengan WhatsApp</h3>
                <p>Buka WhatsApp → Linked Devices → Link a Device</p>
                <canvas id="qrcode"></canvas>
                <br>
                <button onclick="window.location.reload()">🔄 Refresh QR</button>
                <div class="debug">
                    ✅ QR Code berhasil di-generate (${qrData ? 'Ada data' : 'Tidak ada data'})
                </div>
            </div>
            ` : ''}
            
            ${!isConnected && !qrGenerated ? `
            <div class="qr-section">
                <p>⏳ Generating QR Code...</p>
                <p>Please wait or <button onclick="window.location.reload()" style="display:inline;padding:8px 16px;margin:0 5px;">Refresh</button></p>
            </div>
            ` : ''}
            
            <div class="info">
                <p><strong>📡 Server Status:</strong> Online</p>
                <p><strong>🔗 Bot Number:</strong> ${isConnected && sock?.user ? sock.user.id.split(':')[0] : 'Not connected'}</p>
                <p><strong>⏰ Uptime:</strong> ${Math.floor(process.uptime())} seconds</p>
                <p><strong>🔑 QR Status:</strong> ${qrGenerated ? 'Generated ✅' : 'Not yet ⏳'}</p>
            </div>
            
            <div class="endpoints">
                <h3>📚 Available Endpoints</h3>
                
                <div class="endpoint">
                    <strong>POST /send-message</strong>
                    <p>Send text message to WhatsApp number</p>
                    <code>{ "phone": "6281234567890", "message": "Hello" }</code>
                </div>
                
                <div class="endpoint">
                    <strong>GET /status</strong>
                    <p>Get bot connection status</p>
                </div>
                
                <div class="endpoint">
                    <strong>GET /qr</strong>
                    <p>Get current QR code (if available)</p>
                </div>
            </div>
        </div>
        
        <!-- Load QRCode library -->
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        
        <script>
            // Generate QR Code
            ${qrGenerated && qrData ? `
            try {
                const qrData = ${qrData};
                console.log('QR Data received:', qrData ? 'Yes' : 'No');
                
                // Clear previous QR
                const qrContainer = document.getElementById('qrcode');
                qrContainer.innerHTML = '';
                
                // Generate new QR
                new QRCode(qrContainer, {
                    text: qrData,
                    width: 280,
                    height: 280,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.L
                });
                
                console.log('✅ QR Code rendered successfully');
            } catch (error) {
                console.error('❌ Error rendering QR:', error);
                document.getElementById('qrcode').innerHTML = '<p style="color:red;">Error rendering QR code. Check console.</p>';
            }
            ` : ''}
            
            // Auto refresh status every 5 seconds
            setInterval(() => {
                fetch('/status')
                    .then(r => r.json())
                    .then(data => {
                        const statusEl = document.getElementById('status');
                        if (data.status === 'connected') {
                            statusEl.className = 'status connected';
                            statusEl.textContent = '✅ Connected';
                            if (document.querySelector('.qr-section')) {
                                setTimeout(() => window.location.reload(), 2000);
                            }
                        } else {
                            statusEl.className = 'status disconnected';
                            statusEl.textContent = '❌ Disconnected';
                            // Reload if QR should be available
                            if (data.qrRequired && !${qrGenerated}) {
                                setTimeout(() => window.location.reload(), 3000);
                            }
                        }
                    })
                    .catch(err => console.error('Status check failed:', err));
            }, 5000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// API: Get QR Code
app.get('/qr', (req, res) => {
    console.log('QR requested - Available:', !!currentQR, 'Connected:', isConnected);
    if (currentQR) {
        res.json({
            success: true,
            qr: currentQR,
            message: 'Scan this QR code with WhatsApp'
        });
    } else {
        res.json({
            success: false,
            message: isConnected ? 'Already connected' : 'QR not available yet'
        });
    }
});

// API: Send Message
app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
        return res.status(400).json({
            success: false,
            error: 'Phone and message are required'
        });
    }

    if (!isConnected || !sock) {
        return res.status(503).json({
            success: false,
            error: 'WhatsApp bot is not connected',
            hint: 'Please scan QR code first'
        });
    }

    try {
        const formattedPhone = formatPhoneNumber(phone);
        const jid = `${formattedPhone}@s.whatsapp.net`;
        
        // Check if number exists
        const [exists] = await sock.onWhatsApp(jid);
        if (!exists) {
            return res.status(404).json({
                success: false,
                error: 'Phone number not registered on WhatsApp'
            });
        }
        
        // Send message
        const result = await sock.sendMessage(jid, { text: message });
        
        console.log(`✅ Message sent to ${formattedPhone}`);
        
        res.json({
            success: true,
            message: 'Message sent successfully',
            to: formattedPhone,
            messageId: result.key.id
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API: Status
app.get('/status', (req, res) => {
    res.json({
        status: isConnected ? 'connected' : 'disconnected',
        qrRequired: qrGenerated,
        qrAvailable: !!currentQR,
        botNumber: sock?.user?.id ? sock.user.id.split(':')[0] : null,
        uptime: process.uptime()
    });
});

// API: Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    if (sock) await sock.end();
    process.exit(0);
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    connectToWhatsApp();
});
