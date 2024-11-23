// Frontend logic for the questionnaire
document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('questionnaire');
    const basePath = window.appConfig?.basePath || '';
    
    try {
        // Fetch questions from the server
        const response = await fetch(`${basePath}/api/questions`);
        if (!response.ok) {
            throw new Error('Failed to fetch questions');
        }
        const questions = await response.json();
        console.log('Fetched questions:', questions); // Debug log

        if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error('No questions received from server');
        }

        // Create form elements for each question
        questions.forEach(q => {
            const formGroup = document.createElement('div');
            formGroup.className = 'mb-4';
            
            const label = document.createElement('label');
            label.className = 'form-label';
            label.textContent = q.question + (q.required ? ' *' : '');
            label.setAttribute('for', `question-${q.id}`);
            formGroup.appendChild(label);

            if (q.type === 'select') {
                const select = document.createElement('select');
                select.id = `question-${q.id}`;
                select.name = `question-${q.id}`;
                select.className = 'form-select';
                if (q.required) select.required = true;

                // Add a placeholder option
                const placeholderOpt = document.createElement('option');
                placeholderOpt.value = '';
                placeholderOpt.textContent = 'Choose an option...';
                placeholderOpt.selected = true;
                placeholderOpt.disabled = true;
                select.appendChild(placeholderOpt);

                // Handle options as an object
                Object.entries(q.options).forEach(([key, value]) => {
                    const optEl = document.createElement('option');
                    optEl.value = key;
                    optEl.textContent = key;
                    select.appendChild(optEl);
                });

                formGroup.appendChild(select);

                // Add invalid feedback div
                const invalidFeedback = document.createElement('div');
                invalidFeedback.className = 'invalid-feedback';
                invalidFeedback.textContent = `Please select an option for "${q.question}"`;
                formGroup.appendChild(invalidFeedback);
            } else if (q.type === 'free-text') {
                const input = document.createElement('input');
                input.type = 'text';
                input.id = `question-${q.id}`;
                input.name = `question-${q.id}`;
                input.className = 'form-control';
                if (q.required) input.required = true;
                formGroup.appendChild(input);

                // Add invalid feedback div
                const invalidFeedback = document.createElement('div');
                invalidFeedback.className = 'invalid-feedback';
                invalidFeedback.textContent = `Please fill in "${q.question}"`;
                formGroup.appendChild(invalidFeedback);
            }

            form.appendChild(formGroup);
        });

        // Add required fields note
        const requiredNote = document.createElement('div');
        requiredNote.className = 'text-muted small mb-4';
        requiredNote.textContent = '* Required fields';
        form.appendChild(requiredNote);

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'd-flex gap-2 mb-3';

        // Add test prompt button
        const testButton = document.createElement('button');
        testButton.type = 'button';
        testButton.textContent = 'Test Prompt';
        testButton.className = 'btn btn-secondary';
        testButton.onclick = () => generatePrompt(true);
        buttonContainer.appendChild(testButton);

        // Add generate image button
        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.className = 'btn btn-primary';
        submitButton.innerHTML = `
            Generate Image
            <i class="bi bi-arrow-right ms-2"></i>
        `;
        buttonContainer.appendChild(submitButton);

        form.appendChild(buttonContainer);

        // Create prompt preview container
        const previewContainer = document.createElement('div');
        previewContainer.id = 'prompt-preview';
        previewContainer.className = 'mt-4 d-none';
        form.after(previewContainer);

        // Add form validation class
        form.classList.add('needs-validation');
        form.noValidate = true;

        // Function to show toast message
        function showToast(message, type = 'success') {
            const toastContainer = document.getElementById('toast-container') || (() => {
                const container = document.createElement('div');
                container.id = 'toast-container';
                container.className = 'position-fixed bottom-0 end-0 p-3';
                document.body.appendChild(container);
                return container;
            })();

            const toast = document.createElement('div');
            toast.className = `toast align-items-center text-white bg-${type} border-0`;
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'assertive');
            toast.setAttribute('aria-atomic', 'true');

            toast.innerHTML = `
                <div class="d-flex">
                    <div class="toast-body">
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            `;

            toastContainer.appendChild(toast);
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();

            toast.addEventListener('hidden.bs.toast', () => {
                toast.remove();
            });
        }

        // Function to validate form
        function validateForm() {
            if (!form.checkValidity()) {
                return false;
            }
            return true;
        }

        // Function to generate prompt from form data
        async function generatePrompt(previewOnly = false) {
            try {
                const form = document.getElementById('questionnaire');
                const formData = new FormData(form);
                const answers = {};
                
                // Get questions to check for excludeFromPrompt
                const response = await fetch(`${basePath}/api/questions`);
                const questions = await response.json();
                
                // Create a map of question IDs to their configurations
                const questionMap = questions.reduce((map, q) => {
                    map[q.id] = q;
                    return map;
                }, {});
                
                // Process each form field
                for (let [name, value] of formData.entries()) {
                    answers[name] = value;
                    
                    // Get the question ID from the field name
                    const questionId = parseInt(name.replace('question-', ''));
                    const question = questionMap[questionId];
                    
                    // If it's a select question, get the value from options
                    if (question && question.type === 'select') {
                        const selectedValue = question.options[value];
                        if (selectedValue) {
                            answers[name] = selectedValue;
                        }
                    }
                }
                
                // Filter out questions marked as excludeFromPrompt
                const promptParts = questions
                    .filter(q => !q.excludeFromPrompt)
                    .map(q => {
                        const answer = answers[`question-${q.id}`];
                        if (!answer) return null;
                        return generatePromptFromTemplate(q.promptTemplate, answer);
                    })
                    .filter(part => part !== null);
                
                const prompt = promptParts.join(', ');
                
                if (previewOnly) {
                    showToast(prompt, 'info');
                    return;
                }
                
                return prompt;
            } catch (error) {
                console.error('Error generating prompt:', error);
                showToast('Error generating prompt', 'danger');
                return null;
            }
        }

        // Function to generate prompt from template
        function generatePromptFromTemplate(template, answer) {
            return template.replace('${answer}', answer);
        }

        // Handle form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            form.classList.add('was-validated');

            if (!validateForm()) {
                return;
            }

            const prompt = await generatePrompt();
            
            if (!prompt) {
                showToast('Please fill in at least one field to generate an image.', 'danger');
                return;
            }

            try {
                const response = await fetch(`${basePath}/api/questions/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ answers: prompt })
                });

                const result = await response.json();
                
                if (result.success) {
                    // Clear the preview when successfully generating an image
                    const previewContainer = document.getElementById('prompt-preview');
                    previewContainer.classList.add('d-none');

                    // Display the generated image
                    if (result.imageUrl) {
                        const existingImage = document.querySelector('.generated-image');
                        if (existingImage) {
                            existingImage.remove();
                        }
                        
                        const imageContainer = document.createElement('div');
                        imageContainer.className = 'generated-image card mt-4';
                        imageContainer.innerHTML = `
                            <img src="${result.imageUrl}" class="card-img-top" alt="Generated Image">
                        `;
                        form.parentNode.appendChild(imageContainer);
                    }
                    
                    showToast('Image generated successfully!', 'success');
                } else {
                    showToast('Error: ' + (result.error || 'Failed to generate image'), 'danger');
                }
            } catch (error) {
                console.error('Error:', error);
                showToast('There was an error submitting your answers. Please try again.', 'danger');
            }
        });
    } catch (error) {
        console.error('Error loading questions:', error);
        const errorMessage = document.createElement('div');
        errorMessage.className = 'alert alert-danger';
        errorMessage.innerHTML = `
            <h5>Error Loading Questions</h5>
            <p>${error.message}</p>
            <p>Please try refreshing the page. If the problem persists, contact support.</p>
        `;
        form.parentNode.appendChild(errorMessage);
    }
});
