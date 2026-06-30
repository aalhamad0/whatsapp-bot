const { makeWASocket, Browsers, fetchLatestBaileysVersion, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { proto } = require('@whiskeysockets/baileys/WAProto');
const axios = require('axios');
const express = require('express');
const { MongoClient } = require('mongodb');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzrX3AdAromnJRhtjsUJEguUouRzfpXzzOujHDSjfMg-ezDTSvR2-xYjRQNj-7DjqHr/exec';

// ⚠️ استبدل <db_password> بالرقم السري الخاص بقاعدة البيانات
const MONGO_URI = 'mongodb+srv://aalhamad0_db_user:<Or3Jklq5JGfSUtNm>@cluster0.wkucpbx.mongodb.net/?appName=Cluster0';

let sock;
let isConnected = false; 
let currentQR = '';

const app = express();
app.use(express.json());
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    if (currentQR) {
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}`;
        res.send(`<html dir="rtl"><body style="text-align:center;font-family:tahoma;margin-top:50px;"><h2>📱 امسح الباركود للمرة الأخيرة بجوال المزرعة</h2><img src="${qrImageUrl}" style="border:2px solid black;padding:10px;border-radius:10px;"/></body></html>`);
    } else if (isConnected) {
        res.send('<html dir="rtl"><body style="text-align:center;font-family:tahoma;color:green;margin-top:50px;"><h2>✅ البوت متصل ومحفوظ في الخزنة السحابية!</h2></body></html>');
    } else {
        res.send('<html dir="rtl"><body style="text-align:center;font-family:tahoma;color:orange;margin-top:50px;"><h2>⏳ جاري تشغيل البوت وفتح الخزنة... حدث الصفحة</h2></body></html>');
    }
});

app.post('/send-message', async (req, res) => {
    let { to, chatId, message } = req.body;
    let targetNumber = to || chatId;
    if (!targetNumber || !message) return res.status(400).send('فشل: الرقم أو الرسالة مفقودة');
    if (!isConnected || !sock?.user) return res.status(500).send('فشل: البوت غير متصل حالياً.');
    
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

// ==========================================
// 🛡️ نظام الخزنة السحابية (MongoDB)
// ==========================================
async function useMongoDBAuthState(collection) {
    const writeData = async (data, id) => {
        const informationToStore = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
        await collection.replaceOne({ _id: id }, informationToStore, { upsert: true });
    };
    const readData = async (id) => {
        const data = await collection.findOne({ _id: id });
        if (data) return JSON.parse(JSON.stringify(data), BufferJSON.reviver);
        return null;
    };
    const removeData = async (id) => { await collection.deleteOne({ _id: id }); };
    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async id => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
}

async function connectToWhatsApp () {
    console.log('جاري فتح الخزنة السحابية...');
    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const collection = mongoClient.db('whatsapp_bot').collection('auth_info');
    console.log('✅ تم فتح الخزنة بنجاح!');

    const { state, saveCreds } = await useMongoDBAuthState(collection);
    const { version } = await fetchLatestBaileysVersion();
    
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
            console.log('✅ البوت متصل بالواتساب ومحمي!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify' || m.messages[0].key.fromMe) return;
        const msg = m.messages[0];
        if (!msg.message) return;

        const sender = msg.key.remoteJid; 
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (!text) return;
        let cleanSender = sender.replace('@s.whatsapp.net', '');
        axios.post(WEBHOOK_URL, { sender: cleanSender, message: text }).catch(e => {});
    });
}

connectToWhatsApp().catch(err => console.log('خطأ في تشغيل البوت:', err));
