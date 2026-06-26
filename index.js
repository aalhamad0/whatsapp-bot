const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzrX3AdAromnJRhtjsUJEguUouRzfpXzzOujHDSjfMg-ezDTSvR2-xYjRQNj-7DjqHr/exec';

let sock;
const app = express();
app.use(express.json());

const port = process.env.PORT || 10000;

// بوابة استقبال الأوامر
app.post('/send-message', async (req, res) => {
    const { to, message } = req.body;
    
    // تأكد إن البوت متصل قبل المحاولة
    if (!sock) {
        return res.status(500).send('البوت غير متصل، جرب تمسح الكود مرة ثانية');
    }
    
    try {
        await sock.sendMessage(to + '@c.us', { text: message });
        res.send('تم الإرسال بنجاح!');
    } catch (error) {
        res.status(500).send('فشل الإرسال: ' + error.message);
    }
});

app.listen(port, () => console.log(`السيرفر شغال على البورت ${port}`));

async function connectToWhatsApp () {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        if(update.connection === 'close') {
            sock = null; // إعادة تعيين البوت
            connectToWhatsApp();
        } else if(update.connection === 'open') {
            console.log('✅ البوت متصل وجاهز للأوامر!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify' || m.messages[0].key.fromMe) return;
        const msg = m.messages[0];
        const sender = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if(text) axios.post(WEBHOOK_URL, { sender, message: text }).catch(e => console.log(e.message));
    });
}
connectToWhatsApp();
