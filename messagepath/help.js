require('../configuration/config');
const path = require("path");

const { proto, delay, getContentType, areJidsSameUser, generateWAMessage, jidDecode } = require("baileys")
const chalk = require('chalk')
const fs = require('fs')
const Crypto = require('crypto')
const axios = require('axios')
const moment = require('moment-timezone')
const { sizeFormatter } = require('human-readable')
const util = require('util')
const Jimp = require('jimp')
const { defaultMaxListeners } = require('stream')
const CHANNELS_FILE = path.join(__dirname, '../database/channels.json');

// Fungsi untuk membaca channels dari file
function getChannels() {
    try {
        if (fs.existsSync(CHANNELS_FILE)) {
            const data = fs.readFileSync(CHANNELS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error reading channels file:', err);
    }
    return [];
}

// Fungsi untuk menyimpan channels ke file
function saveChannels(channels) {
    try {
        fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
        return true;
    } catch (err) {
        console.error('Error saving channels file:', err);
        return false;
    }
}

// Fungsi untuk menambah channel
function addChannel(name, username) {
    const channels = getChannels();
    
    // Cek apakah channel sudah ada
    if (channels.some(ch => ch.username === username)) {
        return { success: false, message: 'Channel already exists' };
    }
    
    channels.push({ name, username });
    const saved = saveChannels(channels);
    
    if (saved) {
        // Update global.channels jika diperlukan
        if (global.channels && Array.isArray(global.channels)) {
            global.channels = channels;
        }
        return { success: true, message: 'Channel added successfully' };
    }
    
    return { success: false, message: 'Failed to save channel' };
}

// Fungsi untuk menghapus channel
function removeChannel(username) {
    const channels = getChannels();
    const initialLength = channels.length;
    
    const filteredChannels = channels.filter(ch => ch.username !== username);
    
    if (filteredChannels.length === initialLength) {
        return { success: false, message: 'Channel not found' };
    }
    
    const saved = saveChannels(filteredChannels);
    
    if (saved) {
      
        if (global.channels && Array.isArray(global.channels)) {
            global.channels = filteredChannels;
        }
        return { success: true, message: 'Channel removed successfully' };
    }
    
    return { success: false, message: 'Failed to save channels' };
}

// Fungsi untuk mendapatkan semua channels
function listChannels() {
    return getChannels();
}

// Fungsi untuk membersihkan semua channels
function clearChannels() {
    const saved = saveChannels([]);
    
    if (saved) {
        if (global.channels && Array.isArray(global.channels)) {
            global.channels = [];
        }
        return { success: true, message: 'All channels cleared' };
    }
    
    return { success: false, message: 'Failed to clear channels' };
}
// -------------------- File Management -------------------- \\
function ensureFileExists(filePath, defaultData = []) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
}

// -------------------- Bot Mode System -------------------- \\
const botModePath = path.join(__dirname, '../database/botmode.json');
ensureFileExists(botModePath, { mode: "private", changedBy: null, changedAt: null });

function getBotMode() {
    const modeData = JSON.parse(fs.readFileSync(botModePath, 'utf8') || '{}');
    return modeData.mode || "private";
}

function setBotMode(mode, userId = null) {
    const validModes = ["public", "private"];
    if (!validModes.includes(mode)) {
        throw new Error("Invalid mode. Use 'public' or 'private'.");
    }
    
    const modeData = {
        mode: mode,
        changedBy: userId,
        changedAt: Date.now()
    };
    
    fs.writeFileSync(botModePath, JSON.stringify(modeData, null, 2));
    return modeData;
}

function getBotModeInfo() {
    const modeData = JSON.parse(fs.readFileSync(botModePath, 'utf8') || '{}');
    return {
        mode: modeData.mode || "private",
        changedBy: modeData.changedBy || "Unknown",
        changedAt: modeData.changedAt ? new Date(modeData.changedAt).toLocaleString() : "Never"
    };
}

function isFreeMode() {
    return getBotMode() === "public";
}

// -------------------- Owner System -------------------- \\
function isOwner(userId) {
    if (!global.ownID) return false;
    
    const userIdStr = userId.toString();
    
    if (Array.isArray(global.ownID)) {
        return global.ownID.some(ownerId => ownerId.toString() === userIdStr);
    }
    
    return global.ownID.toString() === userIdStr;
}

// -------------------- Admin System -------------------- \\
const mainAdminPath = path.join(__dirname, '../database/admin.json');
const mainPremiumPath = path.join(__dirname, '../database/premium.json');
const mainUsersPath = path.join(__dirname, '../database/users.json');

ensureFileExists(mainAdminPath, []);
ensureFileExists(mainPremiumPath, []);
ensureFileExists(mainUsersPath, []);

let adminUsers = JSON.parse(fs.readFileSync(mainAdminPath, 'utf8') || '[]');
let premiumUsers = JSON.parse(fs.readFileSync(mainPremiumPath, 'utf8') || '[]');

function saveAdminUsers() {
    fs.writeFileSync(mainAdminPath, JSON.stringify(adminUsers, null, 2));
}

function savePremiumUsers() {
    fs.writeFileSync(mainPremiumPath, JSON.stringify(premiumUsers, null, 2));
}

function isAdmin(userId) {
    return adminUsers.includes(userId.toString());
}

function addAdmin(userId) {
    const userIdStr = userId.toString();
    if (!adminUsers.includes(userIdStr)) {
        adminUsers.push(userIdStr);
        saveAdminUsers();
    }
}

function delAdmin(userId) {
    const userIdStr = userId.toString();
    adminUsers = adminUsers.filter(a => a !== userIdStr);
    saveAdminUsers();
}

function listAdmin() {
    if (adminUsers.length === 0) return "Belum ada admin.";
    return adminUsers.map(a => `• ${a}`).join("\n");
}

function isAdminOrOwner(userId) {
    return isOwner(userId) || isAdmin(userId);
}

// -------------------- Premium System -------------------- \\
function isPremium(userId) {
    const now = Date.now();
    const user = premiumUsers.find(u => u.id === userId.toString());
    return user && now < user.expired;
}

function getPremiumStatusSymbol(userId) {
    return isPremium(userId) ? '✅' : '🔒';
}

function addPremium(userId, days = 30) {
    const now = Date.now();
    const duration = days * 24 * 60 * 60 * 1000;
    const existing = premiumUsers.find(u => u.id === userId.toString());

    if (existing) {
        existing.expired = Math.max(existing.expired, now) + duration;
    } else {
        premiumUsers.push({ 
            id: userId.toString(), 
            expired: now + duration,
            added: now,
            days: days
        });
    }
    savePremiumUsers();
}

function delPremium(userId) {
    premiumUsers = premiumUsers.filter(u => u.id !== userId.toString());
    savePremiumUsers();
}

function listPremiumUsers() {
    if (premiumUsers.length === 0) return "Belum ada user premium.";
    return premiumUsers.map(u => {
        const sisa = u.expired - Date.now();
        const hari = Math.ceil(sisa / (1000 * 60 * 60 * 24));
        const addedDate = new Date(u.added || Date.now()).toLocaleDateString();
        return `• ${u.id} - ${hari > 0 ? `${hari} hari lagi` : "Expired"} (ditambah: ${addedDate})`;
    }).join("\n");
}

// -------------------- User Registration -------------------- \\
function registerUser(userId, username = "Unknown") {
    try {
        const users = JSON.parse(fs.readFileSync(mainUsersPath, "utf8") || "[]");

        if (!users.includes(userId.toString())) {
            users.push(userId.toString());
            fs.writeFileSync(mainUsersPath, JSON.stringify(users, null, 2));
            return true; 
        }

        return false; 
    } catch (err) {
        console.error("[REGISTER USER ERROR]", err);
        fs.writeFileSync(mainUsersPath, JSON.stringify([userId.toString()], null, 2));
        return true;
    }
}

/**
 * Total user
 */
function getTotalUsers() {
    try {
        const users = JSON.parse(fs.readFileSync(mainUsersPath, "utf8") || "[]");
        return users.length;
    } catch {
        return 0;
    }
}

// -------------------- Cooldown System -------------------- \\
const cooldownPath = path.join(__dirname, '../database/cooldown.json');
ensureFileExists(cooldownPath, {});

function setCooldown(userId, seconds) {
    const cooldowns = JSON.parse(fs.readFileSync(cooldownPath, 'utf8') || '{}');
    
    const minCooldown = global.cooldown?.min || 5;
    const maxCooldown = global.cooldown?.max || 60;
    const defaultCooldown = global.cooldown?.default || 30;
    
    cooldowns[userId.toString()] = {
        duration: Math.max(minCooldown, Math.min(seconds, maxCooldown)),
        lastUsed: Date.now()
    };
    fs.writeFileSync(cooldownPath, JSON.stringify(cooldowns, null, 2));
}

function getCooldown(userId) {
    const cooldowns = JSON.parse(fs.readFileSync(cooldownPath, 'utf8') || '{}');
    const userCooldown = cooldowns[userId.toString()];
    
    const defaultCooldown = global.cooldown?.default || 30;
    
    if (!userCooldown) {
        return {
            duration: defaultCooldown,
            lastUsed: 0,
            remaining: 0
        };
    }
    
    const now = Date.now();
    const elapsed = Math.floor((now - userCooldown.lastUsed) / 1000);
    const remaining = Math.max(0, userCooldown.duration - elapsed);
    
    return {
        duration: userCooldown.duration,
        lastUsed: userCooldown.lastUsed,
        remaining: remaining
    };
}

function canUseCommand(userId) {
    const cooldown = getCooldown(userId);
    return cooldown.remaining <= 0;
}

function updateLastUsed(userId) {
    const cooldowns = JSON.parse(fs.readFileSync(cooldownPath, 'utf8') || '{}');
    if (cooldowns[userId.toString()]) {
        cooldowns[userId.toString()].lastUsed = Date.now();
        fs.writeFileSync(cooldownPath, JSON.stringify(cooldowns, null, 2));
    }
}

// -------------------- Access Control -------------------- \\
function blockIfNoAccess(ctx, userId) {
    if (isFreeMode()) {
        return false;
    }
    
    const premium = isPremium(userId);
    const admin = isAdmin(userId);
    const owner = isOwner(userId);

    if (!premium && !admin && !owner) {
        const { InlineKeyboard } = require("grammy");
        const nih = new InlineKeyboard()
            .url("Order Premium", "https://t.me/dexoffc");
        
        ctx.reply(`<pre>🔖𝗣𝗿𝗲𝗺𝗶𝘂𝗺 𝗺𝗼𝗱𝗲 𝗮𝗰𝘁𝗶𝘃𝗲</pre>
<b>[ # ] 𝖯𝖱𝖨𝖢𝖤 𝖫𝖨𝖲𝖳 𝖠𝖢𝖢𝖤𝖲 𝖯𝖱𝖤𝖬</b>
  - $3 𝖴𝖲𝖣𝖳 - 30 𝖽𝖺𝗒 / 𝖬𝗈𝗇𝗍𝗁
  - $5 𝖴𝖲𝖣𝖳 - 𝖴𝗇𝗅𝗂𝗆𝗂𝗍𝖾𝖽 / 𝖫𝗂𝖿𝖾𝗍𝗂𝗆𝖾 
  - $15 𝖴𝖲𝖣𝖳 - 𝗇𝗈 𝖾𝗇𝖼𝗋𝗒𝗉𝗍 𝖿𝗂𝗅𝖾
  
<pre>Want to Upgrade Your Access</pre>
<b>Click the ORDER button below to buy</b>`,
            {
                parse_mode: "HTML",
                reply_markup: nih
            }
        );
        return true;
    }
    return false;
}

// -------------------- Ekspor Semua Fungsi -------------------- \\
module.exports = {
    // Bot Mode System
    getBotMode,
    setBotMode,
    getBotModeInfo,
    isFreeMode,
    
    // Owner System
    isOwner,
    
    // Admin System
    isAdmin,
    addAdmin,
    delAdmin,
    listAdmin,
    isAdminOrOwner,
    
    // Premium System
    isPremium,
    getPremiumStatusSymbol,
    addPremium,
    delPremium,
    listPremiumUsers,
    
    // User Registration
    registerUser,
    getTotalUsers,
    
    // Cooldown System
    setCooldown,
    getCooldown,
    canUseCommand,
    updateLastUsed,
    
    // Access Control
    blockIfNoAccess,
    getChannels,
    saveChannels,
    addChannel,
    removeChannel,
    listChannels,
    clearChannels
};