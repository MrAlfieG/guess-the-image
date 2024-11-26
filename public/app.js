// Frontend logic for the questionnaire
document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('questionnaire');
    const basePath = window.appConfig?.basePath || '';
    
    try {
        console.log('Fetching questions from:', `${basePath}/api/questions`); // Debug log
        // Fetch questions from the server
        const response = await fetch(`${basePath}/api/questions`);
        if (!response.ok) {
            throw new Error(`Failed to fetch questions: ${response.status} ${response.statusText}`);
        }
        const questions = await response.json();
        console.log('Fetched questions:', questions); // Debug log

        if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error('No questions received from server');
        }

        // Create form elements for each question
        const questionsContainer = document.getElementById('questions-container');
        questionsContainer.innerHTML = ''; // Clear any existing content

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
                    optEl.value = value;  // Use the value from options
                    optEl.textContent = key;  // Use the key as display text
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

            questionsContainer.appendChild(formGroup);
        });

        // Add required fields note
        const requiredNote = document.createElement('div');
        requiredNote.className = 'text-muted small mb-4';
        requiredNote.textContent = '* Required fields';
        form.insertBefore(requiredNote, form.querySelector('button[type="submit"]'));

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
                const formData = new FormData(form);
                const answers = {};
                
                // Get questions to check for excludeFromPrompt
                const response = await fetch(`${basePath}/api/questions`);
                if (!response.ok) {
                    throw new Error('Failed to fetch questions');
                }
                const questions = await response.json();
                
                // Create a map of question IDs to their configurations
                const questionMap = questions.reduce((map, q) => {
                    map[q.id] = q;
                    return map;
                }, {});
                
                // Process each form field
                for (let [name, value] of formData.entries()) {
                    if (!value.trim()) continue;  // Skip empty values
                    
                    const questionId = parseInt(name.replace('question-', ''));
                    const question = questionMap[questionId];
                    
                    if (!question) continue;
                    
                    // If it's a select question, get the display text (key) from options
                    if (question.type === 'select') {
                        // Find the key (display text) that corresponds to this value
                        const displayText = Object.entries(question.options)
                            .find(([key, val]) => val === value)?.[0] || value;
                        answers[name] = displayText;
                    } else {
                        answers[name] = value;
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
                
                return { prompt, answers };  // Return both prompt and answers
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

            const submitButton = form.querySelector('button[type="submit"]');
            const originalButtonContent = submitButton.innerHTML;
            
            // Show loading state
            submitButton.disabled = true;
            submitButton.innerHTML = `
                <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Processing Request...
            `;

            try {
                const result = await generatePrompt();
                
                if (!result || !result.prompt) {
                    showToast('Please fill in at least one field to generate an image.', 'danger');
                    return;
                }

                const response = await fetch(`${basePath}/api/questions/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(result)  // Send both prompt and answers
                });

                if (!response.ok) {
                    throw new Error('Failed to generate image');
                }

                const resultData = await response.json();
                
                if (resultData.success) {
                    // Clear the preview
                    const previewContainer = document.getElementById('prompt-preview');
                    if (previewContainer) {
                        previewContainer.classList.add('d-none');
                    }

                    // Clear the form
                    form.reset();
                    form.classList.remove('was-validated');

                    // Remove any existing thank you message or generated image
                    const existingImage = document.querySelector('.generated-image');
                    if (existingImage) {
                        existingImage.remove();
                    }
                    const existingThankYou = document.querySelector('.thank-you-message');
                    if (existingThankYou) {
                        existingThankYou.remove();
                    }

                    // Create and display thank you message
                    const thankYouContainer = document.createElement('div');
                    thankYouContainer.className = 'thank-you-message card mt-4 text-center';
                    thankYouContainer.innerHTML = `
                        <div class="card-body">
                            <h3 class="card-title text-success mb-3">Thank You!</h3>
                            <p class="card-text">Your answers have been submitted successfully.</p>
                        </div>
                    `;
                    form.parentNode.appendChild(thankYouContainer);
                    
                    showToast('Answers submitted successfully!', 'success');
                } else {
                    throw new Error(resultData.error || 'Failed to generate image');
                }
            } catch (error) {
                console.error('Error:', error);
                showToast(error.message || 'There was an error submitting your answers. Please try again.', 'danger');
            } finally {
                // Reset button state
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonContent;
            }
        });
    } catch (error) {
        console.error('Error:', error);
        const container = document.getElementById('questions-container');
        container.innerHTML = `<div class="alert alert-danger">Error loading questions: ${error.message}</div>`;
    }
});
