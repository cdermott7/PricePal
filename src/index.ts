import { AppServer, AppSession, ViewType, AuthenticatedRequest, PhotoData } from '@mentra/sdk';
import { Request, Response } from 'express';
import * as ejs from 'ejs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Interface representing a stored photo with metadata
 */
interface StoredPhoto {
  requestId: string;
  buffer: Buffer;
  timestamp: Date;
  userId: string;
  mimeType: string;
  filename: string;
  size: number;
}

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? (() => { throw new Error('GEMINI_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

/**
 * Photo Taker App with webview functionality for displaying photos
 * Extends AppServer to provide photo taking and webview display capabilities
 */
class ExampleMentraOSApp extends AppServer {
  private photos: Map<string, StoredPhoto[]> = new Map(); // Store array of photos by userId
  private latestPhotoTimestamp: Map<string, number> = new Map(); // Track latest photo timestamp per user
  private isStreamingPhotos: Map<string, boolean> = new Map(); // Track if we are streaming photos for a user
  private nextPhotoTime: Map<string, number> = new Map(); // Track next photo time for a user
  private geminiAI: GoogleGenerativeAI; // Gemini AI instance

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });
    console.log(`[INIT] Initializing Gemini AI with API key: ${GEMINI_API_KEY.substring(0, 10)}...`);
    this.geminiAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log(`[INIT] Gemini AI initialized successfully`);
    this.setupWebviewRoutes();
    console.log(`[INIT] Webview routes setup complete`);
  }


  /**
   * Handle new session creation and button press events
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    // this gets called whenever a user launches the app
    console.log(`[SESSION] Session started for user ${userId}, sessionId: ${sessionId}`);

    // set the initial state of the user
    this.isStreamingPhotos.set(userId, false);
    this.nextPhotoTime.set(userId, Date.now());
    console.log(`[SESSION] Initialized user state for ${userId}`);

    // this gets called whenever a user presses a button
    session.events.onButtonPress(async (button) => {
      console.log(`[BUTTON] Button pressed: ${button.buttonId}, type: ${button.pressType} for user ${userId}`);

      if (button.pressType === 'long') {
        // the user held the button, so we toggle the streaming mode
        const currentStreaming = this.isStreamingPhotos.get(userId);
        this.isStreamingPhotos.set(userId, !currentStreaming);
        console.log(`[BUTTON] Streaming photos for user ${userId} toggled from ${currentStreaming} to ${!currentStreaming}`);
        return;
      } else {
        console.log(`[BUTTON] Single photo request initiated for user ${userId}`);
        session.layouts.showTextWall("Button pressed, about to take photo", {durationMs: 4000});
        // the user pressed the button, so we take a single photo
        try {
          console.log(`[CAMERA] Requesting photo from camera for user ${userId}`);
          // first, get the photo
          const photo = await session.camera.requestPhoto();
          console.log(`[CAMERA] Photo received for user ${userId}:`, {
            requestId: photo.requestId,
            timestamp: photo.timestamp,
            mimeType: photo.mimeType,
            size: photo.size,
            bufferLength: photo.buffer.length
          });
          this.cachePhoto(photo, userId);
        } catch (error) {
          console.error(`[CAMERA] Error taking photo for user ${userId}:`, error);
        }
      }
    });

    // repeatedly check if we are in streaming mode and if we are ready to take another photo
    setInterval(async () => {
      const isStreaming = this.isStreamingPhotos.get(userId);
      const nextPhotoTime = this.nextPhotoTime.get(userId) ?? 0;
      const currentTime = Date.now();
      
      if (isStreaming && currentTime > nextPhotoTime) {
        console.log(`[STREAM] Auto-taking photo for user ${userId} (streaming: ${isStreaming}, nextTime: ${nextPhotoTime}, currentTime: ${currentTime})`);
        try {
          // set the next photos for 30 seconds from now, as a fallback if this fails
          this.nextPhotoTime.set(userId, currentTime + 30000);
          console.log(`[STREAM] Set next photo time to ${currentTime + 30000} for user ${userId}`);

          // actually take the photo
          console.log(`[STREAM] Requesting auto photo from camera for user ${userId}`);
          const photo = await session.camera.requestPhoto();
          console.log(`[STREAM] Auto photo received for user ${userId}:`, {
            requestId: photo.requestId,
            timestamp: photo.timestamp,
            mimeType: photo.mimeType,
            size: photo.size,
            bufferLength: photo.buffer.length
          });

          // set the next photo time to now, since we are ready to take another photo
          this.nextPhotoTime.set(userId, Date.now());

          // cache the photo for display
          this.cachePhoto(photo, userId);
        } catch (error) {
          console.error(`[STREAM] Error auto-taking photo for user ${userId}:`, error);
        }
      }
    }, 1000);
  }

  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    // clean up the user's state
    this.isStreamingPhotos.set(userId, false);
    this.nextPhotoTime.delete(userId);
    console.log(`[SESSION] Session stopped for user ${userId}, sessionId: ${sessionId}, reason: ${reason}`);
  }

  /**
   * Cache a photo for display
   */
  private async cachePhoto(photo: PhotoData, userId: string) {
    console.log(`[CACHE] Starting to cache photo for user ${userId}, requestId: ${photo.requestId}`);
    
    // create a new stored photo object which includes the photo data and the user id
    const cachedPhoto: StoredPhoto = {
      requestId: photo.requestId,
      buffer: photo.buffer,
      timestamp: photo.timestamp,
      userId: userId,
      mimeType: photo.mimeType,
      filename: photo.filename,
      size: photo.size
    };

    console.log(`[CACHE] Created cached photo object for user ${userId}:`, {
      requestId: cachedPhoto.requestId,
      timestamp: cachedPhoto.timestamp,
      mimeType: cachedPhoto.mimeType,
      size: cachedPhoto.size,
      bufferLength: cachedPhoto.buffer.length
    });

    // this example app simply stores the photo in memory for display in the webview, but you could also send the photo to an AI api,
    // or store it in a database or cloud storage, send it to roboflow, or do other processing here

    // cache the photo for display
    const userPhotos = this.photos.get(userId) || [];
    userPhotos.push(cachedPhoto);
    this.photos.set(userId, userPhotos);
    // update the latest photo timestamp
    this.latestPhotoTimestamp.set(userId, cachedPhoto.timestamp.getTime());
    console.log(`[CACHE] Photo cached for user ${userId}, timestamp: ${cachedPhoto.timestamp}, total photos for user: ${userPhotos.length}`);
    
    // Analyze the photo with Gemini
    console.log(`[CACHE] Initiating Gemini analysis for user ${userId}`);
    this.analyzePhotoWithGemini(cachedPhoto, userId);
  }

  /**
   * Analyze a photo with Gemini AI
   */
  private async analyzePhotoWithGemini(photo: StoredPhoto, userId: string) {
    console.log(`[GEMINI] Starting analysis for user ${userId}, requestId: ${photo.requestId}`);
    try {
      // Get the generative model
      const model = this.geminiAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Convert buffer to base64
      const base64Image = photo.buffer.toString('base64');
      
      // Create the prompt
      const prompt = `You will be provided an image of a product.

1. Give me 3 alternatives to this product and their prices in JSON format with:
Product Name
Product Store
Product Price

Only include products with all fields populated.

2. Provide a one sentence recommendation about whether to buy the product: e.g. if this is a good price and i should buy it, or buy elsewhere or buy an alternative product.

Analyze this product image and provide alternatives with current pricing.`;

      // Create the content for the API call
      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType: photo.mimeType,
        },
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const analysis = response.text();
      
      console.log(`Gemini analysis for user ${userId}:`, analysis);
      
      // Store the analysis with the photo for later retrieval
      (photo as any).geminiAnalysis = analysis;
      console.log(`[GEMINI] Analysis stored with photo for user ${userId}`);
      
    } catch (error) {
      console.error(`Error analyzing photo with Gemini: ${error}`);
      // Store error message for debugging
      (photo as any).geminiAnalysis = `Error analyzing photo: ${error}`;
    }
  }


  /**
 * Set up webview routes for photo display functionality
 */
  private setupWebviewRoutes(): void {
    const app = this.getExpressApp();

    // API endpoint to get the latest photo for the authenticated user
    app.get('/api/latest-photo', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      console.log(`[API] Latest photo request for userId: ${userId}`);

      if (!userId) {
        console.log(`[API] Unauthenticated request to /api/latest-photo`);
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId);
      if (!userPhotos || userPhotos.length === 0) {
        console.log(`[API] No photos found for userId: ${userId}`);
        res.status(404).json({ error: 'No photo available' });
        return;
      }

      const latestPhoto = userPhotos[userPhotos.length - 1];
      console.log(`[API] Returning latest photo for userId: ${userId}, requestId: ${latestPhoto.requestId}`);
      res.json({
        requestId: latestPhoto.requestId,
        timestamp: latestPhoto.timestamp.getTime(),
        hasPhoto: true
      });
    });

    // API endpoint to get photo data
    app.get('/api/photo/:requestId', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      const requestId = req.params.requestId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId);
      if (!userPhotos || userPhotos.length === 0) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }

      const photo = userPhotos.find(p => p.requestId === requestId);
      if (!photo) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }

      res.set({
        'Content-Type': photo.mimeType,
        'Cache-Control': 'no-cache'
      });
      res.send(photo.buffer);
    });

    // API endpoint to get Gemini analysis for the latest photo
    app.get('/api/gemini-analysis', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      console.log(`[API] Gemini analysis request for userId: ${userId}`);

      if (!userId) {
        console.log(`[API] Unauthenticated request to /api/gemini-analysis`);
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId);
      if (!userPhotos || userPhotos.length === 0) {
        console.log(`[API] No photos found for userId: ${userId} in gemini-analysis request`);
        res.status(404).json({ error: 'No photo available' });
        return;
      }

      const latestPhoto = userPhotos[userPhotos.length - 1];
      const analysis = (latestPhoto as any).geminiAnalysis;
      if (!analysis) {
        console.log(`[API] No Gemini analysis available for userId: ${userId}, requestId: ${latestPhoto.requestId}`);
        res.status(404).json({ error: 'No Gemini analysis available yet' });
        return;
      }

      console.log(`[API] Returning Gemini analysis for userId: ${userId}, analysis length: ${analysis.length}`);
      res.json({ analysis });
    });

    // API endpoint to get all photos for a user
    app.get('/api/photos', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      console.log(`[API] All photos request for userId: ${userId}`);

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId) || [];
      const photoSummaries = userPhotos.map(photo => ({
        requestId: photo.requestId,
        timestamp: photo.timestamp.getTime(),
        mimeType: photo.mimeType,
        hasAnalysis: !!(photo as any).geminiAnalysis
      }));

      res.json({ photos: photoSummaries });
    });

    // API endpoint to get analysis for a specific photo
    app.get('/api/analysis/:requestId', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      const requestId = req.params.requestId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId);
      if (!userPhotos || userPhotos.length === 0) {
        res.status(404).json({ error: 'No photos found' });
        return;
      }

      const photo = userPhotos.find(p => p.requestId === requestId);
      if (!photo) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }

      const analysis = (photo as any).geminiAnalysis;
      if (!analysis) {
        res.status(404).json({ error: 'No analysis available yet' });
        return;
      }

      res.json({ analysis });
    });

    // Main webview route - displays the photo viewer interface
    app.get('/webview', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).send(`
          <html>
            <head><title>Photo Viewer - Not Authenticated</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>Please open this page from the MentraOS app</h1>
            </body>
          </html>
        `);
        return;
      }

      const templatePath = path.join(process.cwd(), 'views', 'photo-viewer.ejs');
      const html = await ejs.renderFile(templatePath, {});
      res.send(html);
    });
  }
}



// Start the server
// DEV CONSOLE URL: https://console.mentra.glass/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new ExampleMentraOSApp();

app.start().catch(console.error);