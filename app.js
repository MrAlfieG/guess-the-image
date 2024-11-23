const express = require('express');
const bodyParser = require('body-parser');
const { Configuration, OpenAIApi } = require('openai');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const https = require('https');
const config = require('./config.json');
const multer = require('multer');

const app = express();
const port = 3000;
const basePath = config.basePath || '';

// Middleware
app.use(bodyParser.json());

// Serve static files
app.use(basePath, express.static(path.join(__dirname, 'public')));
app.use(basePath, express.static(__dirname));
app.use(`${basePath}/stored-images`, express.static(path.join(__dirname, 'stored-images')));

// Configure multer for multiple file uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, 'stored-images/');
        },
        filename: function (req, file, cb) {
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            cb(null, `image-${timestamp}-${file.originalname}`);
        }
    })
});

// Ensure the stored-images directory exists
const storedImagesDir = path.join(__dirname, 'stored-images');
if (!fsSync.existsSync(storedImagesDir)) {
    fsSync.mkdirSync(storedImagesDir, { recursive: true });
    console.log('Created stored-images directory');
}

// Function to download image from URL
async function downloadImage(url, filename) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
                return;
            }

            const filepath = path.join(__dirname, 'stored-images', filename);
            const fileStream = fsSync.createWriteStream(filepath);

            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                resolve(filepath);
            });

            fileStream.on('error', (err) => {
                fs.unlink(filepath);
                reject(err);
            });
        }).on('error', reject);
    });
}

// OpenAI Configuration
console.log('Loading configuration...');
console.log('API Key type:', typeof config.openai.apiKey);
console.log('API Key length:', config.openai.apiKey.length);
console.log('API Key prefix:', config.openai.apiKey.substring(0, 7));

const configuration = new Configuration({
    apiKey: config.openai.apiKey.trim(), // Ensure no whitespace
});

const openai = new OpenAIApi(configuration);

// Load questions configuration
async function loadQuestions() {
    try {
        const questionsData = await fs.readFile(path.join(__dirname, 'questions.json'), 'utf8');
        return JSON.parse(questionsData);
    } catch (error) {
        console.error('Error loading questions:', error);
        return [];
    }
}

// Function to generate prompt from template
function generatePromptFromTemplate(template, answer) {
    if (Array.isArray(answer)) {
        // For multi-select, join the answers with 'and'
        const formattedAnswers = answer.map(a => a.trim()).join(' and ');
        return template.replace('${answer}', formattedAnswers);
    }
    // Ensure the entire answer string is used, not just the first word
    return template.replace('${answer}', answer.trim());
}

// Serve static files
app.get(basePath || '/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get(`${basePath}/admin`, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get(`${basePath}/display`, (req, res) => {
    res.sendFile(path.join(__dirname, 'display.html'));
});

app.get(`${basePath}/presenter`, (req, res) => {
    res.sendFile(path.join(__dirname, 'presenter.html'));
});

// Get questions endpoint
app.get(`${basePath}/api/questions`, async (req, res) => {
    try {
        const questions = await loadQuestions();
        console.log('Loaded questions:', questions); // Debug log
        res.json(questions);
    } catch (error) {
        console.error('Error serving questions:', error);
        res.status(500).json({ error: 'Failed to load questions' });
    }
});

// Generate image endpoint
app.post(`${basePath}/api/questions/generate`, async (req, res) => {
    try {
        const { answers } = req.body;
        console.log('Received answers:', answers);

        // Load questions to get templates
        const questions = await loadQuestions();
        
        // Build the prompt from all answers
        let promptParts = [];
        let creatorName = 'Anonymous';
        
        for (const [key, value] of Object.entries(answers)) {
            const questionId = parseInt(key.split('-')[1]);
            const question = questions.find(q => q.id === questionId);
            
            if (question && !question.excludeFromPrompt) {
                // For select-type questions, use the option value instead of the key
                const answerValue = question.type === 'select' ? question.options[value] : value;
                const promptPart = generatePromptFromTemplate(question.promptTemplate, answerValue);
                promptParts.push(promptPart);
            } else if (question && question.excludeFromPrompt) {
                // Store creator name for later
                if (question.id === 1) { // Assuming question 1 is always the name
                    creatorName = value;
                }
            }
        }

        const prompt = promptParts.join(" ") ;
        console.log('Generated prompt:', prompt);

        try {
            const response = await openai.createImage({
                prompt: prompt,
                n: 1,
                size: "1024x1024",
                model: "dall-e-3",
                quality: "standard",
                style: "vivid"
            });

            const imageUrl = response.data.data[0].url;
            console.log('Generated image URL:', imageUrl);
            
            // Generate unique filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `image-${timestamp}-${creatorName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
            
            // Download and save the image
            const localPath = await downloadImage(imageUrl, filename);
            const relativePath = `/stored-images/${filename}`;
            
            // Save image URL and metadata
            const imageData = {
                url: imageUrl,
                localPath: relativePath,
                prompt: prompt,
                timestamp: new Date().toISOString(),
                answers: answers,
                createdBy: creatorName
            };
            
            // Save to generated-images.json
            const imagesFile = path.join(__dirname, 'generated-images.json');
            let images = [];
            try {
                const data = await fs.readFile(imagesFile, 'utf8');
                images = JSON.parse(data);
            } catch (error) {
                console.log('No existing images file, creating new one');
            }
            
            images.push(imageData);
            await fs.writeFile(imagesFile, JSON.stringify(images, null, 2));

            // Check auto-display setting before updating display image
            const displayImage = await readDisplayImage();
            if (displayImage.autoDisplay !== false) {
                // Update display-image.json
                await writeDisplayImage({
                    url: imageUrl,
                    localPath: relativePath,
                    createdBy: creatorName,
                    showCreatedBy: displayImage.showCreatedBy,
                    autoDisplay: displayImage.autoDisplay
                });
            }

            res.json({ 
                success: true, 
                message: 'Image generated and saved successfully',
                imageUrl: relativePath 
            });
        } catch (openaiError) {
            console.error('OpenAI API Error:', openaiError);
            res.status(500).json({ 
                success: false, 
                message: 'Error generating image',
                error: openaiError.message
            });
        }
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message
        });
    }
});

// Handle form submission
app.post(`${basePath}/submit`, async (req, res) => {
    try {
        const answers = req.body;
        console.log('Received answers:', answers);
        
        // Load questions to get prompt templates
        const questions = await loadQuestions();
        console.log('Loaded questions:', questions);
        
        // Generate prompt parts from each question's template
        const promptParts = questions.map(question => {
            const answer = answers[`question-${question.id}`];
            if (!answer || (Array.isArray(answer) && answer.length === 0)) {
                return null;
            }
            const promptPart = generatePromptFromTemplate(question.promptTemplate, answer);
            console.log(`Generated prompt part for question ${question.id}:`, promptPart);
            return promptPart;
        }).filter(part => part !== null);

        // Combine all prompt parts
        const prompt = promptParts.join(', ');
        console.log('Final combined prompt:', prompt);

        try {
            // Generate image using DALL-E 3
            console.log('Making OpenAI API request with prompt:', prompt);
            
            const response = await openai.createImage({
                prompt: prompt,
                n: 1,
                size: "1024x1024",
                model: "dall-e-3",
                quality: "standard",
                style: "vivid"
            });

            // Safely log the response data
            if (response.data) {
                console.log('OpenAI API Response data:', {
                    created: response.data.created,
                    data: response.data.data
                });
            }

            const imageUrl = response.data.data[0].url;
            console.log('Generated image URL:', imageUrl);
            
            // Save image URL and metadata
            const imageData = {
                url: imageUrl,
                prompt: prompt,
                timestamp: new Date().toISOString(),
                answers: answers
            };
            
            // Save to a JSON file
            const imagesFile = path.join(__dirname, 'generated-images.json');
            let images = [];
            try {
                const data = await fs.readFile(imagesFile, 'utf8');
                images = JSON.parse(data);
            } catch (error) {
                console.log('No existing images file, creating new one');
            }
            
            images.push(imageData);
            await fs.writeFile(imagesFile, JSON.stringify(images, null, 2));

            res.json({ 
                success: true, 
                message: 'Image generated successfully',
                imageUrl: imageUrl 
            });
        } catch (openaiError) {
            console.error('OpenAI API Error Details:');
            console.error('Error name:', openaiError.name);
            console.error('Error message:', openaiError.message);
            
            // Safely log the error response
            if (openaiError.response) {
                console.error('API Response Status:', openaiError.response.status);
                console.error('API Response Status Text:', openaiError.response.statusText);
                console.error('API Response Data:', openaiError.response.data);
            }

            res.status(500).json({ 
                success: false, 
                message: 'Error generating image',
                error: openaiError.response ? openaiError.response.data : openaiError.message
            });
        }
    } catch (error) {
        console.error('Server Error Details:');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message
        });
    }
});

// Get all images endpoint
app.get(`${basePath}/api/images`, async (req, res) => {
    try {
        const imagesJsonPath = path.join(__dirname, 'generated-images.json');
        let images = [];
        
        try {
            const data = await fs.readFile(imagesJsonPath, 'utf8');
            images = JSON.parse(data);
            // Filter out null values
            images = images.filter(img => img !== null);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            // If file doesn't exist, return empty array
            await fs.writeFile(imagesJsonPath, '[]', 'utf8');
        }
        
        res.json(images);
    } catch (error) {
        console.error('Error loading images:', error);
        res.status(500).json({ error: 'Failed to load images' });
    }
});

// Delete an image
app.post(`${basePath}/api/images/delete`, async (req, res) => {
    try {
        const { imageUrl } = req.body;
        console.log('Delete request received for image:', imageUrl);
        
        if (!imageUrl) {
            console.error('No imageUrl provided in request');
            return res.status(400).json({ success: false, message: 'No imageUrl provided' });
        }

        // Read current images
        const imagesFile = path.join(__dirname, 'generated-images.json');
        console.log('Reading images from:', imagesFile);
        
        let images = [];
        try {
            const exists = fsSync.existsSync(imagesFile);
            if (!exists) {
                console.error('Images file does not exist:', imagesFile);
                return res.status(500).json({ success: false, message: 'Images database not found' });
            }

            const data = await fs.readFile(imagesFile, 'utf8');
            const parsed = JSON.parse(data);
            
            // First, remove all null entries
            images = parsed.filter(img => img !== null && img !== undefined);
            console.log('Found', images.length, 'non-null images in JSON file');
        } catch (error) {
            console.error('Error reading images file:', error);
            return res.status(500).json({ success: false, message: 'Failed to read images file: ' + error.message });
        }

        // Find the image in our JSON
        const imageToDelete = images.find(img => img.url === imageUrl);
        if (!imageToDelete) {
            console.error('Image not found in JSON:', imageUrl);
            console.log('Available URLs:', images.map(img => img.url).join('\n'));
            return res.status(404).json({ success: false, message: 'Image not found in database' });
        }
        console.log('Found image to delete:', imageToDelete);

        // Get the filename from the URL and ensure directory exists
        const filename = imageUrl.split('/').pop(); // Get just the filename
        if (!fsSync.existsSync(storedImagesDir)) {
            console.log('Creating stored-images directory');
            fsSync.mkdirSync(storedImagesDir, { recursive: true });
        }

        const filePath = path.join(storedImagesDir, filename);
        console.log('Attempting to delete file at:', filePath);

        // Check if file exists and is accessible
        try {
            if (fsSync.existsSync(filePath)) {
                fsSync.unlinkSync(filePath);
                console.log('Successfully deleted file:', filePath);
            } else {
                console.log('File does not exist (continuing with JSON cleanup):', filePath);
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to delete image file: ' + error.message
            });
        }

        // Remove the image from JSON and clean up null entries
        const newImages = images.filter(img => img.url !== imageUrl);
        console.log(`Filtered out image. Old count: ${images.length}, New count: ${newImages.length}`);
        
        try {
            await fs.writeFile(imagesFile, JSON.stringify(newImages, null, 2));
            console.log('Successfully updated JSON file');
        } catch (error) {
            console.error('Error writing to JSON file:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to update images database: ' + error.message 
            });
        }

        // If this was the display image, clear it
        const displayFile = path.join(__dirname, 'display-image.json');
        try {
            if (fsSync.existsSync(displayFile)) {
                const displayData = await fs.readFile(displayFile, 'utf8');
                const displayImage = JSON.parse(displayData);
                if (displayImage.url === imageUrl) {
                    await fs.writeFile(displayFile, JSON.stringify({ url: '', createdBy: '', showCreatedBy: true }, null, 2));
                    console.log('Cleared display image');
                }
            }
        } catch (error) {
            console.error('Error checking display image:', error);
            // Don't return error here as the main deletion was successful
        }

        console.log('Delete operation completed successfully');
        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        console.error('Unexpected error during deletion:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Unexpected error during deletion: ' + error.message
        });
    }
});

// Get display image
app.get(`${basePath}/api/images/display`, async (req, res) => {
    try {
        const displayImageFile = path.join(__dirname, 'display-image.json');
        let displayImage = { url: '', createdBy: '', showCreatedBy: true };

        try {
            const data = await fs.readFile(displayImageFile, 'utf8');
            displayImage = JSON.parse(data);
            // Ensure showCreatedBy has a default value
            displayImage.showCreatedBy = displayImage.showCreatedBy ?? true;
            console.log('Read display image:', displayImage);
        } catch (error) {
            console.error('Error reading display image file:', error);
            // Create the file with default state if it doesn't exist
            await fs.writeFile(displayImageFile, JSON.stringify(displayImage, null, 2));
        }

        res.json(displayImage);
    } catch (error) {
        console.error('Error in display image endpoint:', error);
        res.status(500).json({ error: 'Failed to get display image' });
    }
});

// Set display image
app.post(`${basePath}/api/images/display`, async (req, res) => {
    try {
        const { url, createdBy, showCreatedBy } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'URL is required'
            });
        }

        const displayImageFile = path.join(__dirname, 'display-image.json');
        const displayImage = {
            url,
            createdBy: createdBy || '',
            showCreatedBy: showCreatedBy ?? true
        };

        console.log('Saving display image:', displayImage);
        await fs.writeFile(displayImageFile, JSON.stringify(displayImage, null, 2));

        res.json({
            success: true,
            displayImage
        });
    } catch (error) {
        console.error('Error setting display image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set display image'
        });
    }
});

// Toggle creator visibility
app.post(`${basePath}/api/images/display/toggle-creator`, async (req, res) => {
    try {
        const { showCreatedBy } = req.body;
        
        if (typeof showCreatedBy !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'showCreatedBy must be a boolean'
            });
        }

        const displayImageFile = path.join(__dirname, 'display-image.json');
        let displayImage;
        
        try {
            const data = await fs.readFile(displayImageFile, 'utf8');
            displayImage = JSON.parse(data);
            displayImage.showCreatedBy = showCreatedBy;
        } catch (error) {
            console.error('Error reading display image:', error);
            displayImage = { url: '', createdBy: '', showCreatedBy };
        }

        await fs.writeFile(displayImageFile, JSON.stringify(displayImage, null, 2));
        console.log('Updated creator visibility:', displayImage);

        res.json({
            success: true,
            displayImage
        });
    } catch (error) {
        console.error('Error updating creator visibility:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update creator visibility'
        });
    }
});

// Get auto-display setting
app.get(`${basePath}/api/images/display/auto-display`, async (req, res) => {
    try {
        const displayImage = await readDisplayImage();
        res.json({ autoDisplay: displayImage.autoDisplay !== false });
    } catch (error) {
        console.error('Error reading auto-display setting:', error);
        res.status(500).json({ error: 'Failed to read auto-display setting' });
    }
});

// Toggle auto-display setting
app.post(`${basePath}/api/images/display/toggle-auto-display`, async (req, res) => {
    try {
        const { autoDisplay } = req.body;
        const displayImage = await readDisplayImage();
        
        // Update the setting
        displayImage.autoDisplay = autoDisplay;
        await writeDisplayImage(displayImage);
        
        res.json({ 
            success: true, 
            message: `Auto-display ${autoDisplay ? 'enabled' : 'disabled'}`,
            autoDisplay 
        });
    } catch (error) {
        console.error('Error updating auto-display setting:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update auto-display setting' 
        });
    }
});

// Update image upload endpoint to handle multiple files
app.post(`${basePath}/api/images/upload`, upload.array('imageFile'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }

        const images = await readGeneratedImages();
        
        // Add each uploaded file to the images array
        for (const file of req.files) {
            const imagePath = '/stored-images/' + file.filename;
            images.push({
                url: imagePath,
                localPath: imagePath,
                createdBy: '',  // Default to empty answer
                timestamp: new Date().toISOString()
            });
        }

        await writeGeneratedImages(images);
        res.json({ success: true });
    } catch (error) {
        console.error('Error handling image upload:', error);
        res.status(500).json({ success: false, message: 'Failed to upload images' });
    }
});

// Add endpoint to update image answer
app.post(`${basePath}/api/images/update-answer`, async (req, res) => {
    try {
        const { url, answer } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, message: 'URL is required' });
        }

        const images = await readGeneratedImages();
        const image = images.find(img => img.url === url || img.localPath === url);
        
        if (!image) {
            return res.status(404).json({ success: false, message: 'Image not found' });
        }

        image.createdBy = answer;
        await writeGeneratedImages(images);

        // If this is the current display image, update its answer there too
        const displayImage = await readDisplayImage();
        if (displayImage && (displayImage.url === url || displayImage.url === image.localPath)) {
            displayImage.createdBy = answer;
            await writeDisplayImage(displayImage);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating image answer:', error);
        res.status(500).json({ success: false, message: 'Failed to update answer' });
    }
});

// Image generation endpoint
app.post(`${basePath}/api/images/generate`, async (req, res) => {
    try {
        const { prompt, createdBy } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Generate image using OpenAI
        const response = await openai.createImage({
            prompt: prompt,
            n: 1,
            size: "1024x1024",
        });

        const imageUrl = response.data.data[0].url;
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const filename = `image-${timestamp}-${createdBy || 'unknown'}.png`;

        // Download the image
        await downloadImage(imageUrl, filename);
        const localPath = `/stored-images/${filename}`;

        // Update display-image.json
        const displayData = {
            url: localPath,
            createdBy: createdBy || '',
            showCreatedBy: true
        };
        await fs.writeFile(path.join(__dirname, 'display-image.json'), JSON.stringify(displayData, null, 2));

        // Add to generated-images.json
        const imagesFile = path.join(__dirname, 'generated-images.json');
        let images = [];
        try {
            const data = await fs.readFile(imagesFile, 'utf8');
            images = JSON.parse(data);
        } catch (error) {
            console.log('No existing images file, creating new one');
        }

        images.push({
            url: imageUrl,
            localPath: localPath,
            prompt: prompt,
            timestamp: new Date().toISOString(),
            createdBy: createdBy || '',
            type: 'generated'
        });

        await fs.writeFile(imagesFile, JSON.stringify(images, null, 2));

        res.json({ 
            success: true, 
            url: localPath,
            message: 'Image generated successfully' 
        });
    } catch (error) {
        console.error('Error generating image:', error);
        res.status(500).json({ 
            error: 'Failed to generate image',
            details: error.message 
        });
    }
});

// Reorder images endpoint
app.post(`${basePath}/api/images/reorder`, async (req, res) => {
    try {
        const { images } = req.body;
        
        if (!Array.isArray(images)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Images must be an array' 
            });
        }

        // Filter out any null values and validate image objects
        const validImages = images.filter(img => 
            img && 
            (img.localPath || img.url)
        );

        if (validImages.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'No valid images provided' 
            });
        }

        // Save the reordered images
        await writeGeneratedImages(validImages);

        res.json({ 
            success: true, 
            message: 'Image order updated successfully' 
        });
    } catch (error) {
        console.error('Error reordering images:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to reorder images',
            error: error.message 
        });
    }
});

// Helper functions to read and write JSON files
async function readGeneratedImages() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'generated-images.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
        return [];
    }
}

async function writeGeneratedImages(images) {
    await fs.writeFile(path.join(__dirname, 'generated-images.json'), JSON.stringify(images, null, 2));
}

async function readDisplayImage() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'display-image.json'), 'utf8');
        const displayImage = JSON.parse(data);
        // Ensure default values
        displayImage.showCreatedBy = displayImage.showCreatedBy ?? true;
        displayImage.autoDisplay = displayImage.autoDisplay ?? true;
        return displayImage;
    } catch (error) {
        if (error.code === 'ENOENT') {
            // If file doesn't exist, return default settings
            const defaultSettings = { 
                url: '', 
                createdBy: '', 
                showCreatedBy: true, 
                autoDisplay: true 
            };
            // Create the file with default settings
            await writeDisplayImage(defaultSettings);
            return defaultSettings;
        }
        throw error;
    }
}

async function writeDisplayImage(image) {
    // Ensure the image object has all required properties with defaults
    const imageToWrite = {
        url: image.url || '',
        createdBy: image.createdBy || '',
        showCreatedBy: image.showCreatedBy ?? true,
        autoDisplay: image.autoDisplay ?? true
    };
    
    await fs.writeFile(
        path.join(__dirname, 'display-image.json'),
        JSON.stringify(imageToWrite, null, 2)
    );
}

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
