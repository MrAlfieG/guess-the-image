require('dotenv').config();

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const config = require('./config');

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files - make sure this is before the routes
app.use('/christmas/public', express.static(path.join(__dirname, 'public')));
app.use('/christmas/stored-images', express.static(path.join(__dirname, 'stored-images')));

// Additional static file serving for direct access
app.use('/christmas', express.static(__dirname));

// Routes
const configRouter = require('./routes/config');
app.use('/christmas', configRouter);

// Serve HTML files
app.get('/christmas', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/christmas/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/christmas/display', (req, res) => {
    res.sendFile(path.join(__dirname, 'display.html'));
});

app.get('/christmas/prompt', (req, res) => {
    res.sendFile(path.join(__dirname, 'prompt.html'));
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Base path is set to: ${config.basePath}`);
});
