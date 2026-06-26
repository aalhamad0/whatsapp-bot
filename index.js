const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const express = require('express');

// رابط قوقل شيت الخاص بك
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzrX3AdAromnJRhtjsUJEguUouRzfpXzzOujHDSjfMg-ezDTSvR2-xYjRQNj-7DjqHr/exec';

const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('نظام الراهي يعمل بنجاح!'));
app.listen(port, () => console.log(`السيرفر شغال على البورت ${port}`));

async function connectToWhatsApp () {
    // جلب أحدث إصدار للواتساب لتجنب رفض الاتصال
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // عطلنا الطريقة القديمة
        browser: Browsers.macOS('Desktop'), // تمويه الاتصال كأنه من جهاز ماك حقيقي لتجنب الحظر
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if(qr) {
            console.log('\n\n==================================');
            console.log('امسح كود الـ QR هذا بجوال المزرعة:');
            // السطر اللي كان ناقص لرسم الكود
            qrcode.generate(qr, {small: true});
            console.log('==================================\n\n');
        }
        
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log('انقطع الاتصال، جاري إعادة المحاولة...');
            if(shouldReconnect) {
                connectToWhatsApp();
            }
        } else if(connection === 'open') {
            console.log('كفو! تم ربط الواتساب بنجاح!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if(!msg.message || msg.key.fromMe) return;

        const senderNumber = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if(messageText) {
            try {
                await axios.post(WEBHOOK_URL, {
                    sender: senderNumber,
                    message: messageText
                });
                console.log('تم تسجيل الرسالة في الشيت:', messageText);
            } catch (error) {
                console.error('حدث خطأ أثناء الإرسال:', error);
            }
        }
    });
}

connectToWhatsApp();
