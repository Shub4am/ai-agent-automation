import dotenv from "dotenv";
import {
    Agent,
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
    args: ["--start-maximized", "--no-sandbox", "--disable-extensions", "--disable-file-system"],
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
    parameters: z.object({}),
    async execute() {
        const buffer = await page.screenshot();
        const filePath = `./assets/images/screenshot-${Date.now()}.png`;
        await fs.promises.writeFile(filePath, buffer);
        return { filePath }
    }
});

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

        return { elementData };
    },
});

const populateFormField = tool({
    name: "populate_form_field",
    description: "Populate a form field with data using enhanced clearing and typing methods",
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
                await page.focus(cssSelector);
                await sleep(200);
                await page.evaluate((selector) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.value = '';
                        element.focus();
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, cssSelector);
                await sleep(300);
                await page.keyboard.down('Control');
                await page.keyboard.press('KeyA');
                await page.keyboard.up('Control');
                await sleep(100);
                await page.type(cssSelector, inputData, { delay: 50 });
                await sleep(200);
                await page.evaluate((selector) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                        element.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                }, cssSelector);
                const finalValue = await page.evaluate((selector) => {
                    const element = document.querySelector(selector);
                    return element ? element.value : null;
                }, cssSelector);

                if (finalValue === inputData) {
                    console.log(`Successfully populated ${cssSelector} with "${inputData}"`);
                    operationSuccess = true;
                    workingSelector = cssSelector;
                    break;
                } else {
                    throw new Error(`Value verification failed. Expected: "${inputData}", Got: "${finalValue}"`);
                }

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
            activeSelector: workingSelector,
            finalValue: inputData
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
                await page.evaluate((selector) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, targetSelector);

                await sleep(500);
                await page.click(targetSelector, { delay: 100 });
                await sleep(1000);
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
5. **For each form field**, provide multiple selector options in order of preference.
6. **Fill fields one by one**, taking screenshots after each to verify success.
7. **Always take screenshots** after each action to confirm results.

---

## Tools Usage:
- **open_url(url)** → Navigate to a webpage.
- **analyze_dom_elements(targetArea)** → Get DOM elements. Use this to find form fields and buttons.
- **take_screenshot** → Must be called after every action to verify success.
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
4. For each input field in sequence:
   - Identify the field from the structure data
   - Create multiple selector options based on field attributes
   - Use 'populate_form_field' with the selector array
   - Take a screenshot immediately after to verify the field was filled
   - Wait before moving to next field
5. After all fields are filled, find the submit button from the structure
6. Use 'trigger_element_action' with multiple selector options for the button
7. Take a final screenshot to verify form submission success

---

## Critical Form Filling Rules:
- **Fill fields ONE AT A TIME** - never batch multiple fields
- **Always take a screenshot after each field** to verify it was populated
- **Wait between field operations** to ensure DOM stability
- **Provide descriptive feedback** about which field you're filling
- **Use the enhanced clearing and typing method** that includes proper event triggering

---

## Error Handling:
- If a selector fails, the tools will automatically try the next one in the array
- Always provide at least 2-3 selector options when possible
- If all selectors fail, re-analyze the DOM structure
- Take screenshots to diagnose issues visually

---

Now, follow these enhanced rules to complete the user's request reliably with visible field population.
  `,
    tools: [takeScreenshot, openURL, analyzeDOMElements, populateFormField, triggerElementAction],
    model: "gpt-4o-mini",
});

async function chatWithAgent(query) {
    console.log(`\n █████╗ ██╗     █████╗  ██████╗ ███████╗███╗   ██╗████████╗     ██████╗██╗     ██╗
██╔══██╗██║    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝    ██╔════╝██║     ██║
███████║██║    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║       ██║     ██║     ██║
██╔══██║██║    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║       ██║     ██║     ██║
██║  ██║██║    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║       ╚██████╗███████╗██║
╚═╝  ╚═╝╚═╝    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝        ╚═════╝╚══════╝╚═╝
                                                                                  \n`);
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
Fill each field ONE AT A TIME and take a screenshot after each field to verify it was populated correctly.
Then click the "Create Account" button and take a final screenshot.
`);