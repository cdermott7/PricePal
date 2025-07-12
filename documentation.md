# PricePal - MentraOS Documentation Guide

This document provides a curated guide to the MentraOS documentation, specifically tailored for building the "PricePal" application. It's organized by the development phases required for the project.

---

## 🚀 Phase 1: Project Setup & Core Concepts

This section covers the initial setup of your development environment and the fundamental concepts of MentraOS.

### 1.1. Quickstart (Your First App)

The fastest way to get a project running. This covers environment setup, `ngrok`, app registration, and running the example app.

**Prerequisites:**
* Node.js (v18 or later)
* Bun
* Basic TypeScript knowledge

**Steps:**
1.  **Install MentraOS on your phone:** Download from `mentra.glass/os`.
2.  **Set up ngrok:**
    * Install `ngrok`.
    * Create an account and set up a **static domain** in the dashboard.
    * Run `ngrok config add-authtoken <your_authtoken>`.
3.  **Register your app with MentraOS:**
    * Go to `console.mentra.glass`.
    * Click "Create App".
    * Use a unique package name (e.g., `com.pricepal.app`).
    * Enter your static `ngrok` URL as the "Public URL".
    * **Crucially, add the `MICROPHONE` and `CAMERA` permissions.**
4.  **Get your app running:**
    * Use the example app as a template: `gh repo create --template Mentra-Community/MentraOS-Cloud-Example-App`
    * Clone your new repo and run `bun install`.
    * Create a `.env` file and add your `PORT`, `PACKAGE_NAME`, and `MENTRAOS_API_KEY`.
    * Run the app: `bun run dev`.
    * Expose it with ngrok: `ngrok http --domain=your-static-domain.ngrok-free.app 3000`.

> **IMPORTANT:** After making changes to your app code or restarting your server, you must restart your app inside the MentraOS phone app.

### 1.2. Permissions

Your app must declare which permissions it needs. For PricePal, **`MICROPHONE`** and **`CAMERA`** are essential.

* **Go to `console.mentra.glass`** -> Your App -> "Required Permissions".
* **Add `MICROPHONE`:** Provide a description like "Used for the 'Hey Mentra, is this a good price?' voice command."
* **Add `CAMERA`:** Provide a description like "Used to take a picture of the item to identify it and find its price."

### 1.3. Core Concepts

* **AppServer:** The base class for your application. It handles incoming connections.
* **AppSession:** Manages an active connection for a single user. This is your primary tool for interacting with the glasses. You get a `session` object in the `onSession` method.
* **Event-Driven:** Your app will react to events like voice commands (`onTranscription`) and button presses.

---

## 💻 Phase 2: Backend API

You'll need a custom API endpoint to handle the image processing and price lookup logic. The MentraOS SDK uses Express.js under the hood.

### 2.1. Creating a Custom Endpoint

You can access the underlying Express app instance to create your own API routes. This is where you'll build the `/api/identify-item` endpoint.

```typescript
import { AppServer, AppSession } from '@mentra/sdk';

class PricePalServer extends AppServer {
    constructor(config) {
        super(config);
        this.setupCustomRoutes();
    }

    protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
        session.logger.info(`New session for PricePal: ${sessionId}`);
        // Session-specific logic goes here
    }

    private setupCustomRoutes() {
        const app = this.getExpressApp();

        // Your custom endpoint for image processing
        app.post('/api/identify-item', async (req, res) => {
            const { image } = req.body; // Assuming image is sent as base64

            // 1. Send image to Roboflow for identification
            // const itemName = await roboflow.identify(image);

            // 2. Use OpenAI to search for prices
            // const prices = await openAI.searchPrices(itemName);

            // 3. Send back the structured response
            // res.json({ itemName, prices });
            
            // Placeholder response for testing
            res.json({ itemName: "TP-Link Archer T2U Plus", prices: [{ seller: "Amazon", price: 12.99 }] });
        });
    }
}

// Start the server
const server = new PricePalServer({
    packageName: process.env.PACKAGE_NAME!,
    apiKey: process.env.MENTRAOS_API_KEY!,
    port: Number(process.env.PORT || "3000")
});

server.start();