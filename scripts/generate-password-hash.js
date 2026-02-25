import crypto from 'crypto';

const password = process.argv[2] || 'admin123';
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
const passwordHash = `${salt}:${hash}`;

console.log('Password:', password);
console.log('Hash:', passwordHash);
console.log('\nSQL to update admin password:');
console.log(`UPDATE admin SET password_hash = '${passwordHash}' WHERE id = 1;`);
