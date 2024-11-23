# Guess The Image Game

An interactive web application that generates unique images based on user responses to a questionnaire. The application uses OpenAI's DALL-E API to create custom images that reflect the user's preferences and choices.

## Features

- Interactive questionnaire interface
- Dynamic image generation using DALL-E
- Admin panel for managing generated images
- Presenter mode for displaying images
- Display mode for showing images on a separate screen
- Real-time updates and synchronization

## Prerequisites

- Node.js v22 or higher
- NPM (Node Package Manager)
- OpenAI API key

## Installation

1. Clone the repository:
```bash
git clone [your-repository-url]
```

2. Install dependencies:
```bash
npm install
```

3. Create a `config.json` file in the root directory with your OpenAI API key:
```json
{
  "openai": {
    "apiKey": "your-api-key-here"
  }
}
```

4. Start the server:
```bash
npm start
```

5. Access the application at `http://localhost:3000`

## Usage

1. Open the main page and fill out the questionnaire
2. Submit your answers to generate a unique image
3. Use the admin panel at `/admin.html` to manage generated images
4. Use the presenter view at `/presenter.html` for presentations
5. Use the display view at `/display.html` for showing images on a separate screen

## Project Structure

- `app.js` - Main server file
- `index.html` - Main questionnaire interface
- `admin.html` - Admin panel
- `presenter.html` - Presenter view
- `display.html` - Display view
- `questions.json` - Questionnaire configuration
- `public/` - Static assets
- `stored-images/` - Directory for storing generated images

## License

MIT License
