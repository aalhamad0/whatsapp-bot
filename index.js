const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const express = require('express');

// رابط قوقل شيت الخاص بك
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzrX3AdAromnJRhtjsUJEguUouRzfpXzzOujHDSjfMg-ezDTSvR2-xYjRQNj-7DjqHr/exec';

// إنشاء سيرفر وهمي عشان استضافة Render ما تفصل النظام
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('نظام الراهي يعمل بنجاح!'));
app.listen(port, () => console.log(`السيرفر شغال على البورت ${port}`));

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if(qr) {
            console.log('\n\n==================================');
            console.log('امسح كود الـ QR هذا بجوال المزرعة');
            console.log('==================================\n\n');
        }
        if(connection === 'close') {
            console.log('انقطع الاتصال، جاري إعادة المحاولة...');
            connectToWhatsApp();
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
                // إرسال البيانات إلى قوقل شيت
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
