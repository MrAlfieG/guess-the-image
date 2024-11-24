const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const OpenAI = require('openai');

// Config endpoint
router.get('/api/config', (req, res) => {
    res.json({
        basePath: '/christmas'
    });
});

// Load images data
async function loadImagesData() {
    try {
        const data = await fs.readFile(path.join(__dirname, '..', 'generated-images.json'), 'utf8');
        const images = JSON.parse(data);
        return Array.isArray(images) ? images : [];
    } catch (error) {
        if (error.code === 'ENOENT') {
            // If file doesn't exist, create it with empty array
            await fs.writeFile(path.join(__dirname, '..', 'generated-images.json'), '[]');
            return [];
        }
        console.error('Error loading images data:', error);
        return [];
    }
}

// Save images data
async function saveImagesData(images) {
    try {
        await fs.writeFile(
            path.join(__dirname, '..', 'generated-images.json'),
            JSON.stringify(images, null, 2)
        );
        return true;
    } catch (error) {
        console.error('Error saving images data:', error);
        return false;
    }
}

// Load display image data
async function loadDisplayImage() {
    try {
        const data = await fs.readFile(path.join(__dirname, '..', 'display-image.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading display image:', error);
        return {};
    }
}

// Save display image data
async function saveDisplayImage(displayImage) {
    try {
        await fs.writeFile(
            path.join(__dirname, '..', 'display-image.json'),
            JSON.stringify(displayImage, null, 2)
        );
        return true;
    } catch (error) {
        console.error('Error saving display image:', error);
        return false;
    }
}

// Load admin settings
async function loadAdminSettings() {
    try {
        const data = await fs.readFile(path.join(__dirname, '..', 'admin-settings.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            const defaultSettings = { autoDisplayNew: false };
            await saveAdminSettings(defaultSettings);
            return defaultSettings;
        }
        console.error('Error loading admin settings:', error);
        return { autoDisplayNew: false };
    }
}

// Save admin settings
async function saveAdminSettings(settings) {
    try {
        await fs.writeFile(
            path.join(__dirname, '..', 'admin-settings.json'),
            JSON.stringify(settings, null, 2)
        );
        return true;
    } catch (error) {
        console.error('Error saving admin settings:', error);
        return false;
    }
}

// Load questions
async function loadQuestions() {
    try {
        const data = await fs.readFile(path.join(__dirname, '..', 'questions.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading questions:', error);
        return [];
    }
}

// Save questions
async function saveQuestions(questions) {
    try {
        await fs.writeFile(
            path.join(__dirname, '..', 'questions.json'),
            JSON.stringify(questions, null, 2)
        );
        return true;
    } catch (error) {
        console.error('Error saving questions:', error);
        return false;
    }
}

// Generate questions
async function generateQuestions() {
    try {
        // TO DO: implement question generation logic
        return [];
    } catch (error) {
        console.error('Error generating questions:', error);
        return [];
    }
}

// API endpoints for images
router.get('/api/images', async (req, res) => {
    try {
        const images = await loadImagesData();
        res.json(images);
    } catch (error) {
        console.error('Error serving images:', error);
        res.status(500).json({ error: 'Failed to load images' });
    }
});

// Update image answer
router.post('/api/images/update-answer', async (req, res) => {
    try {
        const { url, answer } = req.body;
        const images = await loadImagesData();
        
        const imageIndex = images.findIndex(img => 
            img.url === url || img.localPath === url
        );
        
        if (imageIndex === -1) {
            throw new Error('Image not found');
        }
        
        images[imageIndex].createdBy = answer;
        await saveImagesData(images);
        
        res.json({ 
            success: true, 
            message: 'Answer updated successfully',
            image: images[imageIndex]
        });
    } catch (error) {
        console.error('Error updating answer:', error);
        res.status(500).json({ error: 'Failed to update answer' });
    }
});

router.get('/api/images/display', async (req, res) => {
    try {
        const displayImage = await loadDisplayImage();
        res.json(displayImage);
    } catch (error) {
        console.error('Error serving display image:', error);
        res.status(500).json({ error: 'Failed to load display image' });
    }
});

// Update display image
router.post('/api/images/display', async (req, res) => {
    try {
        const { url, createdBy, showCreatedBy, showDetails } = req.body;
        const currentData = await loadDisplayImage();
        const updatedData = {
            ...currentData,
            url,
            createdBy,
            showCreatedBy: showCreatedBy !== undefined ? showCreatedBy : currentData.showCreatedBy,
            showDetails: showDetails !== undefined ? showDetails : currentData.showDetails
        };
        await saveDisplayImage(updatedData);
        res.json({ success: true, message: 'Display image updated' });
    } catch (error) {
        console.error('Error updating display image:', error);
        res.status(500).json({ error: 'Failed to update display image' });
    }
});

// Update display settings
router.post('/api/images/display/settings', async (req, res) => {
    try {
        const currentData = await loadDisplayImage();
        const updatedData = {
            ...currentData,
            ...req.body
        };
        await saveDisplayImage(updatedData);
        res.json({ success: true, message: 'Display settings updated' });
    } catch (error) {
        console.error('Error updating display settings:', error);
        res.status(500).json({ error: 'Failed to update display settings' });
    }
});

// Reorder images
router.post('/api/images/reorder', async (req, res) => {
    try {
        const { images } = req.body;
        await saveImagesData(images);
        res.json({ success: true, message: 'Image order updated' });
    } catch (error) {
        console.error('Error reordering images:', error);
        res.status(500).json({ error: 'Failed to reorder images' });
    }
});

// API endpoints for admin settings
router.get('/api/admin/settings', async (req, res) => {
    try {
        const settings = await loadAdminSettings();
        res.json(settings);
    } catch (error) {
        console.error('Error serving admin settings:', error);
        res.status(500).json({ error: 'Failed to load admin settings' });
    }
});

router.post('/api/admin/settings', async (req, res) => {
    try {
        const settings = await loadAdminSettings();
        const updatedSettings = { ...settings, ...req.body };
        await saveAdminSettings(updatedSettings);
        res.json({ success: true, message: 'Admin settings updated' });
    } catch (error) {
        console.error('Error updating admin settings:', error);
        res.status(500).json({ error: 'Failed to update admin settings' });
    }
});

// Questions endpoint
router.get('/api/questions', async (req, res) => {
    try {
        const questions = await loadQuestions();
        res.json(questions);
    } catch (error) {
        console.error('Error serving questions:', error);
        res.status(500).json({ error: 'Failed to load questions' });
    }
});

// Generate image from answers
router.post('/api/questions/generate', async (req, res) => {
    try {
        const { answers } = req.body;
        
        if (!answers) {
            return res.status(400).json({ 
                success: false,
                error: 'No answers provided' 
            });
        }

        // Generate a unique filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `generated-${timestamp}.png`;
        const localPath = `/generated-images/${filename}`; 
        const fullPath = path.join(__dirname, '..', 'generated-images', filename);

        // Ensure generated-images directory exists
        const generatedImagesDir = path.join(__dirname, '..', 'generated-images');
        try {
            await fs.access(generatedImagesDir);
        } catch (error) {
            console.log('Creating generated-images directory...');
            await fs.mkdir(generatedImagesDir, { recursive: true });
        }

        try {
            // Initialize OpenAI client
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OpenAI API key is not configured');
            }

            console.log('Initializing OpenAI...');
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            // If answers is a string, use it directly as the prompt
            const prompt = typeof answers === 'string' ? answers : answers.prompt || '';
            console.log('Making OpenAI API call with prompt length:', prompt.length);
            
            const response = await openai.images.generate({
                model: "dall-e-3",
                prompt: prompt,
                n: 1,
                size: "1024x1024",
                quality: "standard",
                response_format: "b64_json"
            });

            if (!response.data || !response.data[0] || !response.data[0].b64_json) {
                console.error('Invalid OpenAI response:', JSON.stringify(response, null, 2));
                throw new Error('Invalid response from OpenAI');
            }

            // Convert base64 to image and save it
            const imageData = response.data[0].b64_json;
            console.log('Converting base64 to buffer...');
            const buffer = Buffer.from(imageData, 'base64');
            
            console.log('Writing file to:', fullPath);
            await fs.writeFile(fullPath, buffer);
            console.log('File written successfully');

            // Save the image metadata with correct paths
            const imageMetadata = {
                url: `/christmas${localPath}`, 
                localPath: `/christmas${localPath}`, 
                prompt: answers,
                timestamp: new Date().toISOString(),
                createdBy: answers["1"] || '', // Name
                posterType: answers["2"] || '', // Poster type
                style: answers["3"] || '', // Style
                artStyle: answers["4"] || '', // Art style
                animal: answers["5"] || '', // Animal
                action: answers["6"] || '', // Action
                holding: answers["7"] || '', // Holding
                weather: answers["8"] || '', // Weather
                location: answers["9"] || '', // Location
                food: answers["10"] || '', // Food
                christmasItem: answers["11"] || '' // Christmas list item
            };

            // Add to generated-images.json
            const images = await loadImagesData();
            images.push(imageMetadata);
            await saveImagesData(images);

            // Check if auto-display is enabled
            const adminSettings = await loadAdminSettings();
            if (adminSettings.autoDisplayNew) {
                await saveDisplayImage({
                    url: imageMetadata.url,
                    createdBy: imageMetadata.createdBy,
                    showCreatedBy: (await loadDisplayImage())?.showCreatedBy || false,
                    showDetails: (await loadDisplayImage())?.showDetails || false
                });
            }

            res.json({
                success: true,
                imageUrl: localPath
            });
        } catch (error) {
            console.error('Error calling OpenAI:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack,
                response: error.response?.data
            });
            res.status(500).json({ 
                success: false,
                error: `OpenAI API Error: ${error.message}` 
            });
        }
    } catch (error) {
        console.error('Error in image generation:', error);
        res.status(500).json({ 
            success: false,
            error: `Image Generation Error: ${error.message}`
        });
    }
});

// Delete image
router.post('/api/images/delete', async (req, res) => {
    try {
        const { imageUrl } = req.body;
        
        if (!imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'No image URL provided'
            });
        }

        // Load current images
        const images = await loadImagesData();
        
        // Find the image to delete
        const imageIndex = images.findIndex(img => 
            img.url === imageUrl || img.localPath === imageUrl
        );
        
        if (imageIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        // Get the image data before removing it
        const imageToDelete = images[imageIndex];

        // Remove the image from the array
        images.splice(imageIndex, 1);

        // Save the updated images array
        await saveImagesData(images);

        // Delete the actual file
        const filename = imageToDelete.localPath.split('/').pop();
        const filePath = path.join(__dirname, '..', 'generated-images', filename);
        
        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.warn('Could not delete image file:', error);
            // Continue even if file deletion fails
        }

        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete image'
        });
    }
});

// Export the router and functions
module.exports = {
    router,
    loadImagesData,
    saveImagesData,
    loadDisplayImage,
    saveDisplayImage,
    loadAdminSettings,
    saveAdminSettings,
    loadQuestions,
    saveQuestions,
    generateQuestions
};
