// Admin functionalities will be implemented here

document.addEventListener('DOMContentLoaded', async () => {
    const imageGrid = document.querySelector('.image-grid');
    
    // Function to load and display images
    async function loadImages() {
        try {
            const response = await fetch('/christmas/api/images');
            const images = await response.json();
            
            // Clear existing images
            imageGrid.innerHTML = '';
            
            // Sort images by timestamp, newest first
            images.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            images.forEach(image => {
                const imageCard = document.createElement('div');
                imageCard.className = 'image-card';
                
                // Create image element
                const img = document.createElement('img');
                img.src = image.url;
                img.alt = 'Generated Image';
                
                // Create info section
                const info = document.createElement('div');
                info.className = 'image-info';
                
                // Format timestamp
                const date = new Date(image.timestamp);
                const formattedDate = date.toLocaleString();
                
                info.innerHTML = `
                    <p><strong>Generated:</strong> ${formattedDate}</p>
                    <p><strong>Prompt:</strong> ${image.prompt}</p>
                    <div class="answers">
                        <strong>Answers:</strong>
                        <ul>
                            ${Object.entries(image.answers)
                                .map(([key, value]) => `<li>${key}: ${Array.isArray(value) ? value.join(', ') : value}</li>`)
                                .join('')}
                        </ul>
                    </div>
                `;
                
                // Create controls
                const controls = document.createElement('div');
                controls.className = 'image-controls';
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-danger';
                deleteBtn.textContent = 'Delete';
                deleteBtn.onclick = () => deleteImage(image);
                
                const displayBtn = document.createElement('button');
                displayBtn.className = 'btn btn-primary';
                displayBtn.textContent = 'Set as Display';
                displayBtn.onclick = () => setAsDisplay(image);
                
                controls.appendChild(displayBtn);
                controls.appendChild(deleteBtn);
                
                // Assemble the card
                imageCard.appendChild(img);
                imageCard.appendChild(info);
                imageCard.appendChild(controls);
                
                imageGrid.appendChild(imageCard);
            });
        } catch (error) {
            console.error('Error loading images:', error);
            alert('Error loading images. Please try again.');
        }
    }
    
    // Function to delete an image
    async function deleteImage(image) {
        if (confirm('Are you sure you want to delete this image?')) {
            try {
                const response = await fetch('/christmas/api/images/delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ imageUrl: image.url })
                });
                
                if (response.ok) {
                    await loadImages(); // Reload the images
                } else {
                    alert('Error deleting image. Please try again.');
                }
            } catch (error) {
                console.error('Error deleting image:', error);
                alert('Error deleting image. Please try again.');
            }
        }
    }
    
    // Function to set an image as the current display
    async function setAsDisplay(image) {
        try {
            const response = await fetch('/christmas/api/images/display', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: image.url,
                    createdBy: image.createdBy || '',
                    showCreatedBy: true
                })
            });
            
            if (response.ok) {
                alert('Image set as current display.');
            } else {
                alert('Error setting display image. Please try again.');
            }
        } catch (error) {
            console.error('Error setting display image:', error);
            alert('Error setting display image. Please try again.');
        }
    }
    
    // Load images initially
    await loadImages();
    
    // Refresh images periodically
    setInterval(loadImages, 30000); // Refresh every 30 seconds
});
