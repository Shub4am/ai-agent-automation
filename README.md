# AI Agent Automation

This project is a browser automation tool powered by OpenAI's GPT-based agent and Puppeteer. It automates web form interactions, such as filling out signup forms, clicking buttons, and taking screenshots, using intelligent DOM analysis and robust selector strategies.

## Features
- Automated browser control with Puppeteer
- Intelligent DOM inspection and selector prioritization
- Form filling and button clicking with fallback selectors
- Screenshot capture after each action
- Configurable via `.env` and code
- Extensible agent instructions and tools

## How It Works
1. The agent opens a specified URL.
2. It analyzes the DOM to find forms, inputs, and buttons.
3. It fills out form fields using multiple selector strategies (ID, name, placeholder, type, class).
4. It clicks buttons to submit forms.
5. Screenshots are taken after each step for verification.

## Getting Started

Follow these steps to set up and run the project on your local machine.

### **1\. Clone the Repository**

First, clone the repository to your local machine using Git:

git clone https://github.com/Shub4am/ai-agent-automation
cd ai-agent-automation

### **2\. Install Dependencies**

This project uses pnpm for package management. Install the dependencies by running:

pnpm install

### **3\. Set Up Environment Variables**

You'll need to provide API keys and credentials for the agent to work.

1. Make a copy of the .env.sample file and name it .env.  
2. Open the .env file and add your credentials.

#### **.env.example**

OPENAI_API_KEY=your_openai_api_key  

### Prerequisites
- Node.js (v18+ recommended)
- pnpm (or npm/yarn)
- Google Chrome installed (default path is set in code)

### Installation
```sh
pnpm install
```

### Configuration
- Copy `.env.example` to `.env` and set your OpenAI API key and other environment variables as needed.

### Usage
Run the automation script:
```sh
node index.js
```

The script will launch Chrome, navigate to the target page, fill out the form, and take screenshots.

### Customization
- Edit `index.js` to change the agent's instructions, target URLs, or form data.
- Add or modify tools for more automation capabilities.

## Project Structure
- `index.js` - Main automation script
- `assets/images/` - Screenshots saved by the agent
- `package.json` - Project dependencies and scripts
- `pnpm-workspace.yaml` - pnpm workspace configuration

## Dependencies
- [puppeteer](https://pptr.dev/)
- [@openai/agents](https://www.npmjs.com/package/@openai/agents)
- [openai](https://www.npmjs.com/package/openai)
- [zod](https://www.npmjs.com/package/zod)
- [dotenv](https://www.npmjs.com/package/dotenv)


## Video Demo

[Video Link](https://youtu.be/ZpLhp20w3es)

## License
MIT
