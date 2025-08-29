import dotenv from "dotenv";
import {
    Agent,
    run,
    tool,
    OpenAIProvider,
    Runner,
    setOpenAIAPI,
    setTracingDisabled,
    setDefaultOpenAIClient,
} from '@openai/agents';
import puppeteer from "puppeteer";
import fs from "fs"
import { z } from "zod";
import { OpenAI } from "openai";

// const agent = new Agent({
//     name: 'History Tutor',
//     instructions:
//         'You provide assistance with historical queries. Explain important events and context clearly.',
// });

// const result = await run(agent, 'When did sharks first appear?');

// console.log(result.finalOutput);

dotenv.config();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await puppeteer.launch({
    headless: false,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--start-maximized", "--no-sandbox", "--disable-extensions", "--diable-file-system"],
    defaultViewport: null
})

const page = await browser.newPage();

const client = new OpenAI();
const modelProvider = new OpenAIProvider({
    openAIClient: client
})
setDefaultOpenAIClient(client);
setOpenAIAPI("chat_completions");
setTracingDisabled(true);

const takeScreenshot = tool({
    name: "take_screenshot",
    description: 'take screenshot of the given webpage',
    // Return base64 image
    parameters: z.object({}),
    async execute() {
        const buffer = await page.screenshot();
        const filePath = `./assets/images/screenshot-${Date.now()}.png`;
        await fs.promises.writeFile(filePath, buffer);
        return { filePath }
    }

});

// const openBrowser = tool({
//     name: "open_browser",
//     description: 'open the browser'
// });

const openURL = tool({
    name: "open_url",
    description: 'open the given url',
    parameters: z.object({ url: z.string() }),
    async execute({ url }) {
        await page.goto(url, { waitUntil: "networkidle2" })
        await sleep(3000);
        console.log("Agent SDK Tool browsed to the following website: ", url)
        return { success: true }
    }

});

// const clickOnScreen = tool({
//     name: 'click_screen',
//     description: 'Clicks on the screen with specified co-ordinates',
//     parameters: z.object({
//         x: z.number().describe('x axis on the screen where we need to click'),
//         y: z.number().describe('Y axis on the screen where we need to click'),
//     }),
//     async execute(input) {
//         input.x;
//         input.y;
//         page.mouse.click(input.x, input.y);
//     },
// });

// const sendKeys = tool({
//     name: 'send_keys',
// });


const analyzeDOMElements = tool({
    name: "analyze_dom_elements",
    description: "Analyze and extract DOM elements from the current webpage, with emphasis on interactive components",
    parameters: z.object({
        targetArea: z.string().nullable().default("form").describe("Target area to analyze such as 'forms',  'buttons', or 'interactive'")
    }),
    async execute({ targetArea = "form" }) {
        const elementData = await page.evaluate((area) => {
            const foundElements = [];
            const formElements = document.querySelectorAll('form');
            formElements.forEach((formEl, idx) => {
                foundElements.push({
                    tag: 'form',
                    selector: `form:nth-child(${idx + 1})`,
                    id: formEl.id,
                    className: formEl.className,
                    action: formEl.action
                });
            });

            const inputElements = document.querySelectorAll('input, textarea, select');
            inputElements.forEach((inputEl, idx) => {
                const possibleSelectors = [];
                if (inputEl.id) possibleSelectors.push(`#${inputEl.id}`);
                if (inputEl.name) possibleSelectors.push(`[name="${inputEl.name}"]`);
                if (inputEl.type) possibleSelectors.push(`input[type="${inputEl.type}"]`);
                if (inputEl.placeholder) possibleSelectors.push(`[placeholder="${inputEl.placeholder}"]`);

                foundElements.push({
                    tag: inputEl.tagName.toLowerCase(),
                    type: inputEl.type,
                    id: inputEl.id,
                    name: inputEl.name,
                    className: inputEl.className,
                    placeholder: inputEl.placeholder,
                    selectors: possibleSelectors,
                    value: inputEl.value,
                    required: inputEl.required,
                    visible: inputEl.offsetParent !== null
                });
            });

            const buttonElements = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
            buttonElements.forEach((btnEl, idx) => {
                const availableSelectors = [];
                if (btnEl.id) availableSelectors.push(`#${btnEl.id}`);
                if (btnEl.className) {
                    const classList = btnEl.className.split(' ').filter(cls => cls);
                    if (classList.length > 0) availableSelectors.push(`.${classList.join('.')}`);
                }
                if (btnEl.type) availableSelectors.push(`[type="${btnEl.type}"]`);

                foundElements.push({
                    tag: btnEl.tagName.toLowerCase(),
                    type: btnEl.type,
                    id: btnEl.id,
                    className: btnEl.className,
                    textContent: btnEl.textContent?.trim(),
                    value: btnEl.value,
                    selectors: availableSelectors,
                    visible: btnEl.offsetParent !== null
                });
            });

            return foundElements;
        }, targetArea || "form");

        // console.log('DOM element analysis:', elementData);
        return { elementData };
    },
});

const populateFormField = tool({
    name: "populate_form_field",
    description: "Populate a form field with data, attempting multiple CSS selectors until successful",
    parameters: z.object({
        targetSelectors: z.array(z.string()).describe("Array of CSS selectors to attempt in priority order"),
        inputData: z.string().describe("Data to input into the field"),
    }),
    async execute({ targetSelectors, inputData }) {
        let operationSuccess = false;
        let finalError = null;
        let workingSelector = null;

        for (const cssSelector of targetSelectors) {
            try {
                await page.waitForSelector(cssSelector, { visible: true, timeout: 5000 });
                await page.click(cssSelector, { clickCount: 3 });
                await sleep(500);
                await page.type(cssSelector, inputData, { sleep: 100 });
                console.log(`Automation tool successfully populated ${cssSelector} with "${inputData}"`);
                operationSuccess = true;
                workingSelector = cssSelector;
                break;
            } catch (err) {
                finalError = err.message;
                console.log(`Failed to populate ${cssSelector}: ${err.message}`);
                continue;
            }
        }

        if (!operationSuccess) {
            throw new Error(`Failed to populate input fields. Error: ${finalError}`);
        }

        return {
            operationSuccess: true,
            activeSelector: workingSelector
        };
    },
});

const triggerElementAction = tool({
    name: "trigger_element_action",
    description: "Trigger a click action on an element, testing multiple CSS selectors sequentially",
    parameters: z.object({
        elementSelectors: z.array(z.string()).describe("Array of CSS selectors to test in priority order"),
    }),
    async execute({ elementSelectors }) {
        let operationSuccess = false;
        let finalError = null;
        let activeSelector = null;

        for (const targetSelector of elementSelectors) {
            try {
                await page.waitForSelector(targetSelector, { visible: true, timeout: 5000 });
                await page.click(targetSelector);
                console.log(`Successfully triggered action on element: ${targetSelector}`);
                operationSuccess = true;
                activeSelector = targetSelector;
                break;
            } catch (err) {
                finalError = err.message;
                console.log(`Failed to trigger action on ${targetSelector}: ${err.message}`);
                continue;
            }
        }

        if (!operationSuccess) {
            throw new Error(`Failed to trigger element action with any selector. Final error: ${finalError}`);
        }

        return {
            operationSuccess: true,
            executedSelector: activeSelector
        };
    },
});



const websiteAutomationAgent = new Agent({
    name: "Website Automation Agent",
    instructions: `
You are a **fully functional and reliable DOM-based browser automation agent** with enhanced DOM inspection capabilities.

Your primary goal is to automate actions in a web browser using the available tools.  
You can now inspect the DOM structure to find the correct selectors before attempting actions.

---

## Enhanced Workflow:
1. **Always start by opening the given URL** with 'open_url'.  
2. **After opening, analyze the page layout** with 'analyze_dom_elements' to understand available elements.
3. **Take a screenshot** to see the visual layout.
4. **Use the DOM structure** to identify the correct selectors for form fields.
5. **For each action**, provide multiple selector options in order of preference.
6. **Always take screenshots** after each action to confirm results.

---

## Tools Usage:
- **open_url(url)** → Navigate to a webpage.
- **analyze_dom_elements(targetArea)** → Get DOM elements. Use this to find form fields and buttons.
- **take_screenshot** → Must be called after every action.
- **populate_form_field(targetSelectors, inputData)** → Provide an array of target selectors to try. The tool will attempt them in order.
- **triggerElementAction(elementSelectors)** → Provide an array of element selectors for buttons/clickable elements.

---

## Selector Strategy:
When you get the page structure, create selector arrays in this priority order:
1. ID selector (#elementId) - most reliable
2. Name attribute ([name="fieldName"]) - very reliable  
3. Placeholder attribute ([placeholder="text"]) - good for identification
4. Type + additional attributes (input[type="email"]) - fallback
5. Class selectors - last resort

Example:
For an email field, provide: ["#email", "[name='email']", "[placeholder*='email']", "input[type='email']"]

---

## Form Filling Enhanced Workflow:
1. Navigate to the signup page using 'open_url'.
2. Use 'analyze_dom_elements' to understand the form layout.
3. Take a screenshot to see the visual form.
4. For each input field:
   - Identify the field from the structure data
   - Create multiple selector options
   - Use 'populate_form_field' with the selector array
   - Take a screenshot to verify
5. Find the submit button from the structure
6. Use 'trigger_element_action' with multiple selector options for the button
7. Take a final screenshot to verify success

---

## Error Handling:
- If a selector fails, the tools will automatically try the next one in the array
- Always provide at least 2-3 selector options when possible
- If all selectors fail, check the page structure again - the DOM might have changed

---

Now, follow these enhanced rules to complete the user's request reliably.
  `,
    tools: [takeScreenshot, openURL, analyzeDOMElements, populateFormField, triggerElementAction],
    model: "gpt-4o-mini",
});


async function chatWithAgent(query) {
    const runner = new Runner({ modelProvider });
    try {
        const response = await runner.run(websiteAutomationAgent, query, {
            maxTurns: 30,
        });
        console.log('Final response:', response.finalOutput);
        await browser.close();
    } catch (error) {
        console.error('Agent execution failed:', error);
        await browser.close();
    }
}

chatWithAgent(`
Go to https://ui.chaicode.com/auth/signup and fill the form with:
- First Name: Bruce
- Last Name: Wayne
- Email: test@example.com
- Password: Qwerty@123
- Confirm Password: Qwerty@123
Then click the "Create Account" button.
`);