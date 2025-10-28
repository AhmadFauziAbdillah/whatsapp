const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

let sock;
let qrGenerated = false;
let isConnected = false;
let currentQR = null;

// Pastikan folder auth ada
const authFolder = path.join(__dirname, 'auth_info_baileys');
if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
}

// Setup WhatsApp Connection
async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false, // Matikan print QR (Railway tidak support terminal)
            logger: pino({ level: 'silent' }),
            browser: ['Warranty System', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: undefined,
            keepAliveIntervalMs: 30000
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📱 QR Code generated');
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

// Root endpoint - Landing page
app.get('/', (req, res) => {
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
            }
            .qr-section {
                text-align: center;
                margin: 20px 0;
            }
            #qrcode {
                margin: 20px auto;
                padding: 20px;
                background: white;
                display: inline-block;
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
        </style>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
    </head>
    <body>
        <div class="container">
            <h1>🤖 WhatsApp Bot API</h1>
            <div class="status ${isConnected ? 'connected' : 'disconnected'}" id="status">
                ${isConnected ? '✅ Connected' : '❌ Disconnected'}
            </div>
            
            ${!isConnected && qrGenerated ? `
            <div class="qr-section">
                <h3>📱 Scan QR Code dengan WhatsApp</h3>
                <p>Buka WhatsApp → Linked Devices → Link a Device</p>
                <div id="qrcode"></div>
                <button onclick="refreshQR()">🔄 Refresh QR</button>
            </div>
            ` : ''}
            
            <div class="info">
                <p><strong>📡 Server Status:</strong> Online</p>
                <p><strong>🔗 Bot Number:</strong> ${isConnected && sock?.user ? sock.user.id.split(':')[0] : 'Not connected'}</p>
                <p><strong>⏰ Uptime:</strong> ${Math.floor(process.uptime())} seconds</p>
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
        
        <script>
            ${qrGenerated && currentQR ? `
            QRCode.toCanvas(document.getElementById('qrcode'), '${currentQR}', {
                width: 300,
                margin: 2
            });
            ` : ''}
            
            function refreshQR() {
                window.location.reload();
            }
            
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
                                window.location.reload();
                            }
                        } else {
                            statusEl.className = 'status disconnected';
                            statusEl.textContent = '❌ Disconnected';
                        }
                    });
            }, 5000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// API: Get QR Code
app.get('/qr', (req, res) => {
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
    console.log(`📡 Railway URL: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'}`);
    connectToWhatsApp();
});