// State management
const state = {
    images: [],
    modifiedAnswers: new Map(),
    sortable: null
};

document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

async function initializePage() {
    await loadImages();
    initializeSortable();
    initializeSaveButton();
}

async function loadImages() {
    try {
        const response = await fetch('/christmas/api/images');
        if (!response.ok) throw new Error('Failed to load images');
        
        state.images = await response.json();
        renderImageGrid();
    } catch (error) {
        console.error('Error loading images:', error);
        showToast('Failed to load images', 'danger');
    }
}

function initializeSortable() {
    const grid = document.getElementById('imageGrid');
    state.sortable = new Sortable(grid, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        onStart: (evt) => {
            evt.item.classList.add('dragging');
        },
        onEnd: (evt) => {
            evt.item.classList.remove('dragging');
            handleReorder(evt.oldIndex, evt.newIndex);
        }
    });
}

function initializeSaveButton() {
    const saveButton = document.getElementById('saveChanges');
    saveButton.addEventListener('click', saveChanges);
}

function renderImageGrid() {
    const grid = document.getElementById('imageGrid');
    grid.innerHTML = '';
    
    state.images.forEach((image, index) => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.dataset.id = image.id;
        card.dataset.index = index;
        
        card.innerHTML = `
            <button class="delete-btn" onclick="deleteImage('${image.id}')">
                <i class="bi bi-x"></i>
            </button>
            <div class="image-wrapper">
                <img src="${image.url}" alt="Image ${index + 1}" loading="lazy">
            </div>
            <input type="text" 
                   class="answer-input" 
                   value="${image.createdBy || ''}" 
                   placeholder="Enter answer..."
                   onchange="handleAnswerChange('${image.id}', this.value)"
                   data-original="${image.createdBy || ''}">
        `;
        
        grid.appendChild(card);
    });
}

function handleAnswerChange(imageId, newValue) {
    const card = document.querySelector(`[data-id="${imageId}"]`);
    const input = card.querySelector('.answer-input');
    const originalValue = input.dataset.original;
    
    if (newValue !== originalValue) {
        state.modifiedAnswers.set(imageId, newValue);
        card.classList.add('modified');
    } else {
        state.modifiedAnswers.delete(imageId);
        card.classList.remove('modified');
    }
    
    updateSaveButton();
}

function updateSaveButton() {
    const saveButton = document.getElementById('saveChanges');
    saveButton.disabled = state.modifiedAnswers.size === 0;
}

function handleReorder(oldIndex, newIndex) {
    if (oldIndex === newIndex) return;
    
    // Update the local array
    const [movedImage] = state.images.splice(oldIndex, 1);
    state.images.splice(newIndex, 0, movedImage);
    
    // Send the new order to the server
    const imageIds = state.images.map(img => img.id);
    updateImageOrder(imageIds);
}

async function updateImageOrder(imageIds) {
    try {
        const response = await fetch('/christmas/api/images/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageIds })
        });

        if (!response.ok) throw new Error('Failed to update image order');
        showToast('Image order updated');
    } catch (error) {
        console.error('Error updating image order:', error);
        showToast('Failed to update image order', 'danger');
        await loadImages(); // Reload to restore original order
    }
}

async function deleteImage(imageId) {
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    try {
        const response = await fetch(`/christmas/api/images/${imageId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete image');
        
        showToast('Image deleted');
        await loadImages();
    } catch (error) {
        console.error('Error deleting image:', error);
        showToast('Failed to delete image', 'danger');
    }
}

async function saveChanges() {
    if (state.modifiedAnswers.size === 0) return;
    
    try {
        const updates = Array.from(state.modifiedAnswers.entries()).map(([id, answer]) => ({
            id,
            createdBy: answer
        }));
        
        const response = await fetch('/christmas/api/images/batch-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });

        if (!response.ok) throw new Error('Failed to save changes');
        
        showToast('Changes saved successfully');
        state.modifiedAnswers.clear();
        await loadImages();
    } catch (error) {
        console.error('Error saving changes:', error);
        showToast('Failed to save changes', 'danger');
    }
}

function showToast(message, type = 'success') {
    const toastContainer = document.querySelector('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

// Make functions globally available for inline event handlers
window.deleteImage = deleteImage;
window.handleAnswerChange = handleAnswerChange;
