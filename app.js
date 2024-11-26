require('dotenv').config();

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const session = require('express-session');
const fs = require('fs').promises;
const configModule = require('./routes/config');

const app = express();
const port = process.env.PORT || 3000;
const basePath = '/christmas';

// Session configuration
app.use(session({
    secret: 'christmas-candy-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'generated-images');
        try {
            await fs.access(uploadDir);
        } catch (error) {
            await fs.mkdir(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.'));
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Serve static files
app.use(basePath + '/public', express.static(path.join(__dirname, 'public')));
app.use(basePath + '/generated-images', express.static(path.join(__dirname, 'generated-images')));

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session.isAuthenticated) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// Login endpoint
app.post(basePath + '/api/login', express.json(), (req, res) => {
    const { password } = req.body;
    if (password === 'candy') {
        req.session.isAuthenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// File upload endpoint
app.post(basePath + '/api/upload-images', requireAuth, upload.array('images'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files were uploaded.' });
        }

        const uploadedFiles = req.files;
        const images = await configModule.loadImagesData();
        
        for (const file of uploadedFiles) {
            const imageMetadata = {
                url: `${basePath}/generated-images/${file.filename}`,
                createdAt: new Date().toISOString(),
                createdBy: 'Admin Upload',
                timestamp: Date.now()
            };
            images.push(imageMetadata);
        }
        
        await configModule.saveImagesData(images);

        // Check if auto-display is enabled
        try {
            const adminSettings = await configModule.loadAdminSettings();
            
            if (adminSettings.autoDisplayNew && uploadedFiles.length > 0) {
                const lastFile = uploadedFiles[uploadedFiles.length - 1];
                const displayImage = {
                    url: `${basePath}/generated-images/${lastFile.filename}`,
                    createdBy: 'Admin Upload',
                    showCreatedBy: false,
                    showDetails: false
                };
                await configModule.saveDisplayImage(displayImage);
            }
        } catch (error) {
            console.error('Error handling auto-display:', error);
        }

        res.json({ 
            success: true, 
            message: `${uploadedFiles.length} image${uploadedFiles.length === 1 ? '' : 's'} uploaded successfully` 
        });
    } catch (error) {
        console.error('Error handling file upload:', error);
        res.status(500).json({ error: 'Failed to process uploaded files: ' + error.message });
    }
});

// Routes
app.use(basePath, configModule);

// Serve HTML files
app.get(basePath, async (req, res) => {
    try {
        const settings = await configModule.loadAdminSettings();
        if (!settings.quizActive) {
            res.sendFile(path.join(__dirname, 'waiting.html'));
        } else {
            res.sendFile(path.join(__dirname, 'index.html'));
        }
    } catch (error) {
        console.error('Error checking quiz status:', error);
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

app.get(basePath + '/prompt', async (req, res) => {
    try {
        const settings = await configModule.loadAdminSettings();
        if (!settings.quizActive) {
            res.sendFile(path.join(__dirname, 'waiting.html'));
        } else {
            res.sendFile(path.join(__dirname, 'prompt.html'));
        }
    } catch (error) {
        console.error('Error checking quiz status:', error);
        res.sendFile(path.join(__dirname, 'prompt.html'));
    }
});

app.get(basePath + '/admin', (req, res) => {
    if (req.session.isAuthenticated) {
        res.sendFile(path.join(__dirname, 'admin.html'));
    } else {
        res.sendFile(path.join(__dirname, 'admin-login.html'));
    }
});

app.get(basePath + '/display', (req, res) => {
    res.sendFile(path.join(__dirname, 'display.html'));
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Base path is set to: ${basePath}`);
});
