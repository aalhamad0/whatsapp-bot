const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzrX3AdAromnJRhtjsUJEguUouRzfpXzzOujHDSjfMg-ezDTSvR2-xYjRQNj-7DjqHr/exec';

let sock;
let isConnected = false; 
let currentQR = '';

const app = express();
app.use(express.json());

const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    if (currentQR) {
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}`;
        res.send(`<html dir="rtl"><body style="text-align:center;font-family:tahoma;margin-top:50px;"><h2>📱 امسح الباركود بجوال المزرعة</h2><img src="${qrImageUrl}" style="border:2px solid black;padding:10px;border-radius:10px;"/></body></html>`);
    } else if (isConnected) {
        res.send('<html dir="rtl"><body style="text-align:center;font-family:tahoma;color:green;margin-top:50px;"><h2>✅ البوت متصل وجاهز لاستقبال وإرسال الأوامر!</h2></body></html>');
    } else {
        res.send('<html dir="rtl"><body style="text-align:center;font-family:tahoma;color:orange;margin-top:50px;"><h2>⏳ جاري تشغيل البوت... حدث الصفحة بعد ثواني</h2></body></html>');
    }
});

// بوابة إرسال الرسايل من قوقل شيت 
app.post('/send-message', async (req, res) => {
    let { to, chatId, message } = req.body;
    let targetNumber = to || chatId;
    
    if (!targetNumber || !message) {
        return res.status(400).send('فشل: الرقم أو الرسالة مفقودة');
    }

    if (!isConnected || !sock?.user) {
        return res.status(500).send('فشل: البوت نائم أو غير متصل بالواتساب حالياً، افتح رابط السيرفر للتأكد.');
    }
    
    targetNumber = targetNumber.toString();
    let jid = targetNumber;
    
    if (!targetNumber.endsWith('@g.us')) {
        targetNumber = targetNumber.replace('@c.us', '').replace('@s.whatsapp.net', '');
        jid = targetNumber + '@s.whatsapp.net';
    }
    
    try {
        await sock.sendMessage(jid, { text: message });
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
        const { connection, qr } = update;
        if (qr) currentQR = qr;
        
        if (connection === 'close') {
            isConnected = false;
            currentQR = '';
            setTimeout(connectToWhatsApp, 3000);
        } else if (connection === 'open') {
            isConnected = true;
            currentQR = '';
        }
    });

    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify' || m.messages[0].key.fromMe) return;
        const msg = m.messages[0];
        
        // 🛡️ درع الحماية: التأكد إن الرسالة موجودة وتحتوي على نص (تجاهل الصور والملصقات)
        if (!msg.message) return;

        const sender = msg.key.remoteJid; 
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // 🛡️ إذا ما فيه نص، تجاهل الرسالة ولا تسوي شيء
        if (!text) return;

        console.log('--- 📡 رادار الراهي التقط رسالة جديدة ---');
        console.log('المرسل / القروب:', sender);
        console.log('النص:', text);
        console.log('--------------------------------------');

        let cleanSender = sender.replace('@s.whatsapp.net', '');
        axios.post(WEBHOOK_URL, { sender: cleanSender, message: text }).catch(e => {});
    });
}
connectToWhatsApp();
