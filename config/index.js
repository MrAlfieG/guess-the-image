const fs = require('fs');
const path = require('path');

// Load config.json
const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Load environment variables
require('dotenv').config();

module.exports = {
    basePath: config.basePath || '',
    openaiApiKey: process.env.OPENAI_API_KEY,
    port: process.env.PORT || 3000
};
