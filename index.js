const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');

// رابط قوقل شيت الخاص بك
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzrX3AdAromnJRhtjsUJEguUouRzfpXzzOujHDSjfMg-ezDTSvR2-xYjRQNj-7DjqHr/exec';

let currentQR = ''; 

const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    if (currentQR) {
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}`;
        res.send(`
            <html dir="rtl">
            <head><meta charset="utf-8"><title>ربط نظام الراهي</title></head>
            <body style="text-align: center; margin-top: 50px; font-family: tahoma;">
                <h2>امسح الكود بجوال المزرعة</h2>
                <img src="${qrImageUrl}" alt="QR Code" style="border: 2px solid #000; padding: 10px; border-radius: 10px;" />
            </body>
            </html>
        `);
    } else {
        res.send(`
            <html dir="rtl">
            <head><meta charset="utf-8"></head>
            <body style="text-align: center; margin-top: 50px; font-family: tahoma; color: green;">
                <h2>✅ نظام الراهي يعمل ومربوط بالواتساب بنجاح!</h2>
            </body>
            </html>
        `);
    }
});

app.listen(port, () => console.log(`السيرفر شغال على البورت ${port}`));

async function connectToWhatsApp () {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false // إيقاف سحب المحادثات القديمة عشان ما يعلق
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if(qr) {
            currentQR = qr; 
            console.log('تم إنشاء كود جديد، افتح الرابط لمسحه.');
        }
        
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log('انقطع الاتصال، جاري إعادة المحاولة...');
            if(shouldReconnect) connectToWhatsApp();
        } else if(connection === 'open') {
            currentQR = ''; 
            console.log('كفو! تم ربط الواتساب بنجاح! وجاهز لاستقبال الرسايل.');
        }
    });

    // رادار الرسايل الجديد
    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return; // التركيز فقط على الرسايل الجديدة لحظة بلحظة
        
        const msg = m.messages[0];
        if(!msg.message) return;
        
        if(msg.key.fromMe) {
            console.log('تم تجاهل رسالة لأنها مرسلة من البوت نفسه.');
            return;
        }

        const senderNumber = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        console.log('--- 📡 رادار الراهي التقط رسالة جديدة ---');
        console.log('المرسل:', senderNumber);
        console.log('النص:', messageText);

        if(messageText) {
            try {
                const response = await axios.post(WEBHOOK_URL, {
                    sender: senderNumber,
                    message: messageText
                });
                console.log('✅ تم إرسال الرسالة إلى قوقل شيت بنجاح!');
                console.log('رد قوقل شيت:', response.data);
            } catch (error) {
                console.error('❌ حدث خطأ أثناء الإرسال لقوقل:', error.message);
            }
        } else {
            console.log('⚠️ الرسالة لا تحتوي على نص قابل للقراءة (قد تكون صورة أو ملصق).');
        }
        console.log('--------------------------------------');
    });
}

connectToWhatsApp();
