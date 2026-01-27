const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-cbc';

/**
 * Get encryption key from environment
 * Key must be 32 bytes (64 hex characters)
 */
function getEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('ENCRYPTION_KEY is not set in environment variables');
    }
    if (key.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    return Buffer.from(key, 'hex');
}

/**
 * Encrypt a text string
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text in format: iv:encryptedData
 */
function encrypt(text) {
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Return IV and encrypted data separated by colon
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedText - Encrypted text in format: iv:encryptedData
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
    try {
        const key = getEncryptionKey();
        const parts = encryptedText.split(':');

        if (parts.length !== 2) {
            throw new Error('Invalid encrypted data format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
}

/**
 * Generate a new encryption key
 * @returns {string} - 64 character hex string (32 bytes)
 */
function generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = {
    encrypt,
    decrypt,
    generateEncryptionKey
};
